/**
 * Sync controller (renderer): decides when the open synced project pushes
 * and pulls
 *
 * Loaded only when the open project is synced (src/hooks/useProjectSync.ts),
 * so local-only projects never run any of this (spec v3 §3.4).
 *
 * Automatic mode: a change to the project (or a file-only change reported
 * by main, e.g. point counts) pushes 3 s after editing pauses, and at most
 * 30 s after the first unpushed change while editing continues (§6.1, 16i).
 * Queued changes push when the project opens.
 * Manual mode: nothing runs until syncNow() (the Sync click).
 * Pull (§6.2): syncNow() in either mode is save, push, pull; a push that
 * the server turned down (the entity changed there) also pulls, so the
 * merge runs and the merged result is pushed. A pull waits until no edit is
 * open (16l), then: main merges with the saved project.json, the store
 * applies the result in one write (applyRemoteChanges), project.json is
 * saved, and main records the pull. If the user changed anything while the
 * merge ran, the pull is dropped and done again. Files the pull brought
 * download afterwards; the tree reloads their thumbnails.
 * Decisions (16x to 16aa): decide() settles one item of the "Sync needs your
 * decision" dialog the same way (main works it out, the store applies it in
 * one write, project.json is saved, main records it); the answer is then
 * pushed like any edit. A Sync click that leaves new items opens the
 * dialog; a restore waiting for its pull makes every cycle pull.
 *
 * A push cycle saves project.json first (16w: the base never gets ahead of
 * the file on disk), then asks main to push. It saves only when the store
 * is ahead of the file (an edit since the project opened, or isDirty), so
 * opening a project never rewrites project.json. The save does not mark
 * the project clean, so autosave and its version snapshot keep their
 * schedule.
 * Failures never show a dialog; they become the store's problem:
 *   offline / server / error   retried with backoff (Automatic), and at once
 *                              when the browser reports it is back online
 *   auth / account / wrong_server   wait for a login change (or the next edit)
 *   disabled / old_server      retried every 10 minutes (Automatic)
 */

import { useAppStore } from '@/store';
import { useAuthStore } from '@/store/useAuthStore';
import { useSyncStore, decisionsWaiting } from '@/store/useSyncStore';
import { getRestServerUrl } from '@/components/dialogs/PreferencesDialog';
import { applyRemoteChanges } from '@/store/remoteChanges';

const DEBOUNCE_MS = 3_000;
const MAX_WAIT_MS = 30_000;
const RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000, 120_000, 300_000];
const SLOW_RETRY_MS = 10 * 60_000;
/** Manual mode: recount the changes waiting this long after editing pauses */
const RECOUNT_MS = 1_000;
/** How often a pull waiting for an open edit checks again */
const EDIT_POLL_MS = 1_000;
/** Pulls dropped because the user kept editing, before giving up for this cycle */
const PULL_ATTEMPTS = 3;
/** How often a decision waiting for a running cycle checks again */
const IDLE_POLL_MS = 200;

type SyncedStatus = Extract<SyncStatusResult, { synced: true }>;
type Failure = Extract<SyncPushResult, { ok: false }>;
type Api = NonNullable<Window['api']>;

const WAITS_FOR_LOGIN: SyncFailureKind[] = ['auth', 'account', 'wrong_server'];
const RETRIES_SLOWLY: SyncFailureKind[] = ['disabled', 'old_server', 'exists'];

class ProjectSync {
  private mode: SyncMode;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private maxWaitTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private recountTimer: ReturnType<typeof setTimeout> | null = null;
  private retryCount = 0;
  private running = false;
  private rerun = false;
  /** A change arrived since the current (or last) push cycle started */
  private changedSinceRun = false;
  /** The store has a change that the next cycle must save first */
  private needsSave = false;
  /** Counts local changes, to notice edits made while a pull was merging */
  private changeCount = 0;
  /** Set while pulled changes are written to the store (not local changes) */
  private applyingRemote = false;
  /** The next cycle pulls after pushing (the Sync click) */
  private pullRequested = false;
  private stopped = false;
  private problem: Failure | null = null;
  private readonly unsubscribers: Array<() => void> = [];

  constructor(readonly projectId: string, status: SyncedStatus) {
    this.mode = status.mode;
    useSyncStore.getState().reset(projectId);
    useSyncStore.getState().update({
      synced: true,
      mode: status.mode,
      phase: status.phase,
      email: status.email,
      pending: status.pending,
      refused: status.refused,
      conflicts: status.conflicts,
      questions: status.questions,
      downloads: status.downloads,
      activity: status.pending ? 'waiting' : 'idle',
    });
  }

  start(): void {
    this.unsubscribers.push(useAppStore.subscribe((state, prev) => {
      if (state.project && state.project !== prev.project && state.project.id === this.projectId) {
        this.localChange();
      }
    }));
    const offLocal = window.api?.sync.onLocalChange((id) => {
      if (id === this.projectId) this.localChange();
    });
    if (offLocal) this.unsubscribers.push(offLocal);
    const offProgress = window.api?.sync.onProgress((p) => {
      if (p.projectId === this.projectId && !this.stopped) useSyncStore.getState().update({ progress: p });
    });
    if (offProgress) this.unsubscribers.push(offProgress);
    this.unsubscribers.push(useAuthStore.subscribe((state, prev) => {
      const changed = state.isAuthenticated !== prev.isAuthenticated || state.user?.pkey !== prev.user?.pkey;
      if (changed && state.isAuthenticated && this.mode === 'automatic' && this.problem &&
        WAITS_FOR_LOGIN.includes(this.problem.kind)) {
        void this.run();
      }
    }));
    const onOnline = () => {
      if (this.mode === 'automatic' && this.problem && (this.problem.kind === 'offline' || this.problem.kind === 'server')) {
        void this.run();
      }
    };
    window.addEventListener('online', onOnline);
    this.unsubscribers.push(() => window.removeEventListener('online', onOnline));

    if (this.mode === 'automatic') void this.run();
  }

  stop(): void {
    this.stopped = true;
    this.clearTimers();
    if (this.recountTimer) clearTimeout(this.recountTimer);
    this.recountTimer = null;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    for (const off of this.unsubscribers.splice(0)) off();
  }

  /** The Sync click (any mode): save, push, pull. */
  syncNow(): void {
    this.pullRequested = true;
    void this.run();
  }

  async setMode(mode: SyncMode): Promise<SyncCallResult> {
    if (!window.api) return { ok: false, kind: 'error', message: 'Sync is not available' };
    const result = await window.api.sync.setMode(this.projectId, mode);
    if (!result.ok || this.stopped) return result;
    this.mode = mode;
    useSyncStore.getState().update({ mode });
    if (mode === 'automatic' && useSyncStore.getState().activity === 'waiting') void this.run();
    if (mode === 'manual') {
      this.clearTimers();
      if (this.retryTimer) clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    return result;
  }

  private localChange(): void {
    if (this.stopped || this.applyingRemote) return;
    this.changeCount++;
    this.needsSave = true;
    this.schedulePush();
  }

  /** Something local needs pushing: Automatic pushes after the debounce, Manual recounts. */
  private schedulePush(): void {
    if (this.stopped) return;
    this.changedSinceRun = true;
    if (!this.running) useSyncStore.getState().update({ activity: 'waiting' });
    if (this.mode !== 'automatic') {
      if (this.recountTimer) clearTimeout(this.recountTimer);
      this.recountTimer = setTimeout(() => {
        this.recountTimer = null;
        void this.refreshCounts();
      }, RECOUNT_MS);
      return;
    }
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => void this.run(), DEBOUNCE_MS);
    if (!this.maxWaitTimer) this.maxWaitTimer = setTimeout(() => void this.run(), MAX_WAIT_MS);
  }

  private clearTimers(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.maxWaitTimer) clearTimeout(this.maxWaitTimer);
    this.debounceTimer = null;
    this.maxWaitTimer = null;
  }

  /**
   * One cycle: save (when needed), push; with a pull requested or a push
   * turned down: pull, apply, push what the merge left; then fetch files.
   */
  private async run(): Promise<void> {
    if (this.stopped) return;
    if (this.running) {
      this.rerun = true;
      return;
    }
    this.clearTimers();
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.running = true;
    this.changedSinceRun = false;
    const wantPull = this.pullRequested;
    this.pullRequested = false;
    const decisionsBefore = decisionsWaiting(useSyncStore.getState());
    useSyncStore.getState().update({ activity: 'syncing', progress: null });

    let result: SyncPushResult;
    let pulled = false;
    try {
      const api = window.api;
      const project = useAppStore.getState().project;
      if (!api || !project || project.id !== this.projectId) {
        useSyncStore.getState().update({ activity: 'idle' });
        return;
      }
      await this.saveIfNeeded(api);
      result = await api.sync.push(this.projectId, getRestServerUrl());
      if (result.ok && (wantPull || result.conflicts > 0 || result.restored > 0)) {
        const p = await this.pullAndApply(api);
        pulled = true;
        if (!p.ok) {
          result = p;
        } else if (p.applied > 0 || result.conflicts > 0 || result.restored > 0) {
          // Push what the merge left (merged entities, and edits made meanwhile)
          await this.saveIfNeeded(api);
          result = await api.sync.push(this.projectId, getRestServerUrl());
        }
      }
      if (result.ok && (pulled || useSyncStore.getState().downloads > 0)) {
        const d = await this.downloadFiles(api);
        if (!d.ok) result = d;
      }
    } catch (error) {
      result = { ok: false, kind: 'error', message: error instanceof Error ? error.message : String(error) };
    } finally {
      this.running = false;
    }
    if (this.stopped) return;

    if (result.ok) {
      this.problem = null;
      this.retryCount = 0;
      useSyncStore.getState().update({
        problem: null,
        progress: null,
        notice: null,
        lastSyncedAt: Date.now(),
        activity: this.changedSinceRun ? 'waiting' : 'idle',
        pending: this.changedSinceRun ? null : 0,
        ...(result.ready ? { phase: 'ready' as const } : {}),
      });
      if (result.notAccepted > 0 || pulled) {
        void this.refreshCounts().then(() => {
          // A Sync click that left new items to decide opens the dialog (16x)
          if (wantPull && !this.stopped && decisionsWaiting(useSyncStore.getState()) > decisionsBefore) {
            useSyncStore.getState().update({ decisionsOpen: true });
          }
        });
      }
    } else {
      if (wantPull) this.pullRequested = true; // the next try pulls too
      this.failed(result);
    }

    if (this.rerun) {
      this.rerun = false;
      void this.run();
    }
  }

  /** Save project.json when the store is ahead of it (an edit, or unsaved edits restored with the session). */
  private async saveIfNeeded(api: Api): Promise<void> {
    if (!this.needsSave && !useAppStore.getState().isDirty) return;
    const project = useAppStore.getState().project;
    if (!project || project.id !== this.projectId) return;
    this.needsSave = false;
    const saved = await api.saveProjectJson(project, this.projectId).catch(() => null);
    if (!saved?.success) {
      this.needsSave = true;
      throw new Error('The project could not be saved before syncing');
    }
  }

  /**
   * Pull, apply to the store, save, record. Dropped and done again if the
   * user changed something while main merged (the merge read the file as it
   * was before that change).
   */
  private async pullAndApply(api: Api): Promise<{ ok: true; applied: number } | Failure> {
    for (let attempt = 0; attempt < PULL_ATTEMPTS; attempt++) {
      await this.waitUntilNotEditing();
      if (this.stopped) return { ok: false, kind: 'error', message: 'The project was closed' };
      await this.saveIfNeeded(api);
      const before = this.changeCount;
      const r = await api.sync.pull(this.projectId, getRestServerUrl());
      if (!r.ok) return r;
      if (this.stopped) return { ok: false, kind: 'error', message: 'The project was closed' };
      if (this.changeCount !== before || this.isEditing()) {
        await api.sync.pullDiscard(this.projectId, r.pullId);
        continue;
      }
      if (r.changes.length > 0) {
        this.applyingRemote = true;
        try {
          applyRemoteChanges(r.changes);
        } finally {
          this.applyingRemote = false;
        }
        const project = useAppStore.getState().project;
        const saved = project ? await api.saveProjectJson(project, this.projectId).catch(() => null) : null;
        if (!saved?.success) {
          // The store has the changes; the next pull finds them applied and records it
          await api.sync.pullDiscard(this.projectId, r.pullId);
          return { ok: false, kind: 'error', message: 'The project could not be saved after pulling' };
        }
      }
      const c = await api.sync.pullCommit(this.projectId, r.pullId);
      if (!c.ok) return c;
      const s = r.summary;
      if (s.received > 0) {
        console.log(`[Sync] Pulled ${s.received} changes (${s.applied} applied, ${s.conflicts} conflicts, ` +
          `${s.questions} delete questions, ${c.downloads ?? 0} files to download)`);
      }
      useSyncStore.getState().update({ downloads: c.downloads ?? 0 });
      return { ok: true, applied: r.changes.length };
    }
    return { ok: false, kind: 'error', message: 'The project kept changing while syncing; it will try again' };
  }

  /**
   * Settle one item of the decisions dialog: main works it out, the store
   * applies it in one write (an undo step when it takes their value in a
   * conflict, 16y), project.json is saved, main records it. Then it is
   * pushed like any edit (Manual mode waits for the Sync click).
   */
  async decide(decision: SyncDecision): Promise<SyncCallResult> {
    const api = window.api;
    if (!api) return { ok: false, kind: 'error', message: 'Sync is not available' };
    while (this.running && !this.stopped) {
      await new Promise((resolve) => setTimeout(resolve, IDLE_POLL_MS));
    }
    if (this.stopped) return { ok: false, kind: 'error', message: 'The project was closed' };
    this.running = true;
    let result: SyncCallResult;
    try {
      await this.saveIfNeeded(api);
      const r = await api.sync.decide(this.projectId, decision);
      if (!r.ok) {
        result = r;
      } else {
        let saved = true;
        if (r.changes.length > 0) {
          this.applyingRemote = true;
          try {
            applyRemoteChanges(r.changes, { undoable: r.undoable });
          } finally {
            this.applyingRemote = false;
          }
          const project = useAppStore.getState().project;
          const s = project ? await api.saveProjectJson(project, this.projectId).catch(() => null) : null;
          saved = Boolean(s?.success);
        }
        if (!saved) {
          await api.sync.decideDiscard(this.projectId, r.decisionId);
          this.needsSave = true;
          result = { ok: false, kind: 'error', message: 'The project could not be saved' };
        } else {
          const c = await api.sync.decideCommit(this.projectId, r.decisionId);
          result = c.ok ? { ok: true } : c;
          if (c.ok && c.downloads) useSyncStore.getState().update({ downloads: c.downloads });
        }
      }
    } catch (error) {
      result = { ok: false, kind: 'error', message: error instanceof Error ? error.message : String(error) };
    } finally {
      this.running = false;
    }
    if (this.stopped) return result;
    await this.refreshCounts();
    if (result.ok) this.schedulePush();
    if (this.rerun) {
      this.rerun = false;
      void this.run();
    }
    return result;
  }

  /** Fetch files pulls brought; the tree reloads the thumbnails of micrographs that got one. */
  private async downloadFiles(api: Api): Promise<{ ok: true } | Failure> {
    const d = await api.sync.download(this.projectId, getRestServerUrl());
    if (!d.ok) return d;
    for (const id of new Set([...d.images, ...d.thumbnails])) {
      window.dispatchEvent(new CustomEvent('thumbnail-generated', { detail: { micrographId: id } }));
    }
    useSyncStore.getState().update({ downloads: 0 });
    return { ok: true };
  }

  /** An edit is open: a pull now could be reverted when it is saved (16l). */
  private isEditing(): boolean {
    const s = useAppStore.getState();
    if (s.editingSpotId || s.editingGeometry || s.batchEditDialogOpen || s.pointCountMode ||
      s.quickEditMode || s.sketchTextInputActive) {
      return true;
    }
    // The decisions dialog does not hold sync up (everything else keeps syncing, 16aa)
    if (document.querySelector('.MuiDialog-root:not([data-sync-decisions])')) return true;
    const el = document.activeElement;
    if (!(el instanceof HTMLElement)) return false;
    if (el.isContentEditable || el.tagName === 'TEXTAREA') return true;
    return el instanceof HTMLInputElement && ['text', 'search', 'number', 'email', 'url', ''].includes(el.type);
  }

  private async waitUntilNotEditing(): Promise<void> {
    if (!this.isEditing()) return;
    useSyncStore.getState().update({ notice: 'Sync will run when you finish editing' });
    while (!this.stopped && this.isEditing()) {
      await new Promise((resolve) => setTimeout(resolve, EDIT_POLL_MS));
    }
    useSyncStore.getState().update({ notice: null });
  }

  private failed(failure: Failure): void {
    this.problem = failure;
    console.warn(`[Sync] Not synced (${failure.kind}): ${failure.message}`);
    useSyncStore.getState().update({
      problem: { kind: failure.kind, message: failure.message },
      progress: null,
      activity: 'waiting',
    });
    if (failure.kind === 'not_synced') {
      this.stop();
      useSyncStore.getState().reset(this.projectId);
      return;
    }
    void this.refreshCounts();
    if (this.mode !== 'automatic' || WAITS_FOR_LOGIN.includes(failure.kind)) return;
    const delay = RETRIES_SLOWLY.includes(failure.kind)
      ? SLOW_RETRY_MS
      : RETRY_DELAYS_MS[Math.min(this.retryCount, RETRY_DELAYS_MS.length - 1)];
    this.retryCount++;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.run();
    }, delay);
  }

  /** Changes waiting (in the app's current project) and refused, from main. */
  private async refreshCounts(): Promise<void> {
    const project = useAppStore.getState().project;
    const status = await window.api?.sync.status(this.projectId, project?.id === this.projectId ? project : undefined);
    if (this.stopped || !status?.synced) return;
    useSyncStore.getState().update({
      pending: status.pending,
      refused: status.refused,
      phase: status.phase,
      conflicts: status.conflicts,
      questions: status.questions,
      downloads: status.downloads,
    });
    if (!this.running && status.pending === 0 && !this.debounceTimer) {
      useSyncStore.getState().update({ activity: 'idle' });
    }
  }
}

let current: ProjectSync | null = null;

/**
 * Start syncing the open project (it is synced). Returns the stop function.
 */
export function startProjectSync(projectId: string, status: SyncedStatus): () => void {
  current?.stop();
  const sync = new ProjectSync(projectId, status);
  current = sync;
  sync.start();
  return () => {
    sync.stop();
    if (current === sync) {
      current = null;
      useSyncStore.getState().reset(null);
    }
  };
}

/** The Sync click. False when the open project is not synced. */
export function syncNow(): boolean {
  if (!current) return false;
  current.syncNow();
  return true;
}

/** Settle one item of the decisions dialog for the open synced project. */
export async function decideSync(decision: SyncDecision): Promise<SyncCallResult> {
  if (!current) return { ok: false, kind: 'not_synced', message: 'This project is not synced.' };
  return current.decide(decision);
}

/** Switch the open synced project between Automatic and Manual. */
export async function changeSyncMode(mode: SyncMode): Promise<SyncCallResult> {
  if (!current) return { ok: false, kind: 'not_synced', message: 'This project is not synced.' };
  return current.setMode(mode);
}
