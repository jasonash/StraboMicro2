/**
 * Sync controller (renderer): decides when the open synced project pushes
 *
 * Loaded only when the open project is synced (src/hooks/useProjectSync.ts),
 * so local-only projects never run any of this (spec v3 §3.4).
 *
 * Automatic mode: a change to the project (or a file-only change reported
 * by main, e.g. point counts) pushes 3 s after editing pauses, and at most
 * 30 s after the first unpushed change while editing continues (§6.1, 16i).
 * Queued changes push when the project opens.
 * Manual mode: nothing runs until syncNow() (the Sync click).
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
import { useSyncStore } from '@/store/useSyncStore';
import { getRestServerUrl } from '@/components/dialogs/PreferencesDialog';

const DEBOUNCE_MS = 3_000;
const MAX_WAIT_MS = 30_000;
const RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000, 120_000, 300_000];
const SLOW_RETRY_MS = 10 * 60_000;

type SyncedStatus = Extract<SyncStatusResult, { synced: true }>;
type Failure = Extract<SyncPushResult, { ok: false }>;

const WAITS_FOR_LOGIN: SyncFailureKind[] = ['auth', 'account', 'wrong_server'];
const RETRIES_SLOWLY: SyncFailureKind[] = ['disabled', 'old_server', 'exists'];

class ProjectSync {
  private mode: SyncMode;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private maxWaitTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryCount = 0;
  private running = false;
  private rerun = false;
  /** A change arrived since the current (or last) push cycle started */
  private changedSinceRun = false;
  /** The store has a change that the next cycle must save first */
  private needsSave = false;
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
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    for (const off of this.unsubscribers.splice(0)) off();
  }

  /** The Sync click (any mode). */
  syncNow(): void {
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
    if (this.stopped) return;
    this.changedSinceRun = true;
    this.needsSave = true;
    if (!this.running) useSyncStore.getState().update({ activity: 'waiting' });
    if (this.mode !== 'automatic') return;
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

  /** One push cycle: save project.json, then push. */
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
    useSyncStore.getState().update({ activity: 'syncing', progress: null });

    let result: SyncPushResult;
    try {
      const api = window.api;
      const project = useAppStore.getState().project;
      if (!api || !project || project.id !== this.projectId) {
        useSyncStore.getState().update({ activity: 'idle' });
        return;
      }
      // Save only when the store is ahead of the file (an edit, or unsaved
      // edits restored with the session); otherwise push the file as it is
      if (this.needsSave || useAppStore.getState().isDirty) {
        this.needsSave = false;
        const saved = await api.saveProjectJson(project, this.projectId).catch(() => null);
        if (!saved?.success) {
          this.needsSave = true;
          throw new Error('The project could not be saved before syncing');
        }
      }
      result = await api.sync.push(this.projectId, getRestServerUrl());
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
        lastSyncedAt: Date.now(),
        activity: this.changedSinceRun ? 'waiting' : 'idle',
        pending: this.changedSinceRun ? null : 0,
        ...(result.ready ? { phase: 'ready' as const } : {}),
      });
      if (result.notAccepted > 0) void this.refreshCounts();
    } else {
      this.failed(result);
    }

    if (this.rerun) {
      this.rerun = false;
      void this.run();
    }
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

  /** Changes waiting and refused, from main (diffs the saved project.json). */
  private async refreshCounts(): Promise<void> {
    const status = await window.api?.sync.status(this.projectId);
    if (this.stopped || !status?.synced) return;
    useSyncStore.getState().update({ pending: status.pending, refused: status.refused, phase: status.phase });
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

/** Switch the open synced project between Automatic and Manual. */
export async function changeSyncMode(mode: SyncMode): Promise<SyncCallResult> {
  if (!current) return { ok: false, kind: 'not_synced', message: 'This project is not synced.' };
  return current.setMode(mode);
}
