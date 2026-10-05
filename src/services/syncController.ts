/**
 * Sync controller (renderer): decides when the open synced project pushes
 * and pulls
 *
 * Loaded only when the open project is synced (src/hooks/useProjectSync.ts),
 * so local-only projects never run any of this (spec v3 §3.4).
 *
 * Automatic mode: a change to the project (or a file-only change reported
 * by main, e.g. point counts) pushes about 1 s after the edit is finished
 * (17aj: a dialog saved, a spot drawn, a field left; while an edit is open
 * it waits), and at most 30 s after the first unpushed change while
 * editing continues (§6.1, 16i). Queued changes push when the project opens.
 * Manual mode: nothing runs until syncNow() (the Sync click), except the
 * first upload right after sync is turned on (requestFirstSync).
 * On open (§6.4, 16ah): Automatic pushes and pulls; Manual asks the server
 * what is waiting and, if anything is, offers [Sync Now] [Work Offline].
 * While open, the project is followed on the live channel (main
 * electron/sync/live.js, 17ah-17ay): a notice that someone else changed it
 * runs the activity poll at once, which counts the changes waiting on the
 * server for the chip. Automatic mode pulls them by itself (basic
 * auto-pull, 16av); an edit in progress holds the pull until it closes,
 * with "Ben made 3 changes; they'll appear when you close this dialog"
 * (17ap). Manual mode only counts (17aq). While the live channel is down
 * the poll runs every 30 s focused, 2 min otherwise (17ao); when it is up,
 * only every 5 min as a safety net, and at once after a reconnect (catch
 * up). Phase 4 refines it (hold only the items being edited).
 * Pull (§6.2): syncNow() in either mode is save, push, pull; a push that
 * the server turned down (the entity changed there) also pulls, so the
 * merge runs and the merged result is pushed. A pull waits until no edit is
 * open (16l), then: main merges with the saved project.json, the store
 * applies the result in one write (applyRemoteChanges), project.json is
 * saved, and main records the pull. If the user changed anything while the
 * merge ran, the pull is dropped and done again. Files the pull brought
 * download afterwards, in the background (the next push does not wait for
 * them); the tree reloads their thumbnails, and the viewer and overlays
 * reload a micrograph whose original arrived (imageArrivals).
 * Decisions (16x to 16aa): decide() settles one item of the "Sync needs your
 * decision" dialog the same way (main works it out, the store applies it in
 * one write, project.json is saved, main records it); a full sync (push,
 * pull) follows 1 s later in either mode, since an answer is part of the
 * sync it interrupted (16ab). A Sync click or an answer that leaves new
 * items opens the dialog; a restore waiting for its pull makes every cycle
 * pull.
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
import { applyRemoteChanges, isApplyingSavedStamps } from '@/store/remoteChanges';
import { compositesAffectedBy, compositesShowing, regenerateComposites } from '@/utils/compositeRefresh';
import { takeFirstSyncRequest } from '@/services/syncActions';
import { loadParked } from '@/services/parkedLoad';
import { E2E, e2eMs, LEGACY_SYNC } from '@/services/e2eMode';
import { editWaitText } from '@/utils/syncChipState';
import { usePresenceStore, myEditingTarget } from '@/store/usePresenceStore';
import { sendableTarget } from '@/utils/presence';

// Under an end-to-end test (e2eMode.ts) the waits are short
/** Push this long after the last change once no edit is open (17aj) */
const DEBOUNCE_MS = LEGACY_SYNC ? 3_000 : e2eMs(1_000, 300);
const MAX_WAIT_MS = e2eMs(30_000, 3_000);
const RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000, 120_000, 300_000].map((ms) => e2eMs(ms, ms / 10));
const SLOW_RETRY_MS = e2eMs(10 * 60_000, 10_000);
/** Manual mode: recount the changes waiting this long after editing pauses */
const RECOUNT_MS = 1_000;
/** How often a pull waiting for an open edit checks again */
const EDIT_POLL_MS = 1_000;
/** Pulls dropped because the user kept editing, before giving up for this cycle */
const PULL_ATTEMPTS = 3;
/** How often a decision waiting for a running cycle checks again */
const IDLE_POLL_MS = 200;
/** Pause after an answer before its sync (answers given in a row share one) */
const DECISION_SYNC_MS = 1_000;
/** Activity poll: while the window is focused, and otherwise (16ah) */
const POLL_FOCUSED_MS = E2E?.pollMs ?? e2eMs(30_000, 1_500);
const POLL_AWAY_MS = E2E?.pollMs ?? e2eMs(120_000, 3_000);
/** Activity poll while the live channel is up: a safety net only */
const POLL_LIVE_MS = E2E?.pollMs ?? e2eMs(5 * 60_000, 3_000);
/** Here = window focused and input within this long; away otherwise (17an) */
const AWAY_AFTER_MS = 5 * 60_000;
/** How often here/away is worked out again */
const PRESENCE_CHECK_MS = 15_000;
/** Names of new people in the project are fetched at most this often */
const NAMES_REFRESH_MS = 60_000;

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
  private decisionTimer: ReturnType<typeof setTimeout> | null = null;
  /** The next cycle is the sync after an answer */
  private decisionRun = false;
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
  /** The next cycle pulls without being a Sync click (opening the project) */
  private quietPull = false;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private lastPollAt = 0;
  /** An activity poll is waiting for the running cycle, or for the one in flight, to end */
  private pollQueued = false;
  private polling = false;
  private pollAgain = false;
  /** Following the project on the live channel (main live.js): polls only as a safety net */
  private live = false;
  /** Changes waiting on the server are held until the open edit closes (17ap) */
  private holdingForEdit = false;
  /** My presence as last sent (JSON), and the last mouse or keyboard input */
  private presenceSent = '';
  private lastInputAt = Date.now();
  private presenceTimer: ReturnType<typeof setInterval> | null = null;
  private namesFetchedAt = 0;
  /** Background downloads of the files pulls brought */
  private downloading: Promise<void> | null = null;
  private downloadAgain = false;
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
      pkey: status.pkey,
      server: status.server,
      pid: status.pid,
      pending: status.pending,
      refused: status.refused,
      conflicts: status.conflicts,
      questions: status.questions,
      downloads: status.downloads,
      activity: status.pending ? 'waiting' : 'idle',
    });
  }

  start(): void {
    void this.loadPermissions();
    this.unsubscribers.push(useAppStore.subscribe((state, prev) => {
      if (state.project && state.project !== prev.project && state.project.id === this.projectId && !isApplyingSavedStamps()) {
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
    const offLive = window.api?.sync.onLive((e) => {
      if (e.projectId === this.projectId) this.onLive(e);
    });
    if (offLive) this.unsubscribers.push(offLive);
    this.unsubscribers.push(useAuthStore.subscribe((state, prev) => {
      const changed = state.isAuthenticated !== prev.isAuthenticated || state.user?.pkey !== prev.user?.pkey;
      if (changed && state.isAuthenticated) this.followLive();
      if (changed && state.isAuthenticated && this.mode === 'automatic' && this.problem &&
        WAITS_FOR_LOGIN.includes(this.problem.kind)) {
        void this.run();
      }
    }));
    const onOnline = () => {
      // Back online: the live channel tries again now instead of after its backoff
      this.followLive();
      if (this.mode === 'automatic' && this.problem && (this.problem.kind === 'offline' || this.problem.kind === 'server')) {
        void this.run();
      }
    };
    window.addEventListener('online', onOnline);
    this.unsubscribers.push(() => window.removeEventListener('online', onOnline));
    // Back to the window: count again if the last count is older than the focused interval
    const onFocus = () => {
      if (!this.live && Date.now() - this.lastPollAt >= POLL_FOCUSED_MS) this.schedulePoll(0);
    };
    window.addEventListener('focus', onFocus);
    this.unsubscribers.push(() => window.removeEventListener('focus', onFocus));

    this.followLive();
    this.startPresence();

    // takeFirstSyncRequest first: it clears the request either way
    if (takeFirstSyncRequest(this.projectId) || useSyncStore.getState().phase === 'uploading') {
      // Sync just turned on, or its first upload has not finished (stopped
      // at quit, or handed over by the intro queue, 16ay): the first upload
      // runs now, in either mode
      this.syncNow();
      this.schedulePoll();
    } else if (this.mode === 'automatic') {
      // Opening: push what waits, pull what arrived (16ah)
      this.pullQuietly();
      this.schedulePoll();
    } else {
      // Manual: ask what is waiting; the prompt offers Sync Now
      void this.poll(true);
    }
  }

  stop(): void {
    this.stopped = true;
    this.clearTimers();
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = null;
    if (this.recountTimer) clearTimeout(this.recountTimer);
    this.recountTimer = null;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    if (this.decisionTimer) clearTimeout(this.decisionTimer);
    this.decisionTimer = null;
    for (const off of this.unsubscribers.splice(0)) off();
    if (this.presenceTimer) clearInterval(this.presenceTimer);
    this.presenceTimer = null;
    usePresenceStore.getState().setPeople([]);
    void window.api?.sync.liveUnfollow(this.projectId);
  }

  /**
   * My presence (17al-17an): here or away, the micrograph I view, the item
   * I edit (shape editing, or an edit dialog's EditingScope). Sent when it
   * changes; main sends it again whenever the project is followed.
   */
  private startPresence(): void {
    this.unsubscribers.push(useAppStore.subscribe((s, prev) => {
      if (s.activeMicrographId !== prev.activeMicrographId || s.editingSpotId !== prev.editingSpotId) this.reportPresence();
    }));
    this.unsubscribers.push(usePresenceStore.subscribe((s, prev) => {
      if (s.editing !== prev.editing) this.reportPresence();
    }));
    const onInput = () => {
      const wasAway = Date.now() - this.lastInputAt >= AWAY_AFTER_MS;
      this.lastInputAt = Date.now();
      if (wasAway) this.reportPresence();
    };
    const onFocusChange = () => this.reportPresence();
    for (const type of ['mousemove', 'mousedown', 'keydown', 'wheel'] as const) {
      window.addEventListener(type, onInput, { passive: true });
      this.unsubscribers.push(() => window.removeEventListener(type, onInput));
    }
    window.addEventListener('focus', onFocusChange);
    window.addEventListener('blur', onFocusChange);
    this.unsubscribers.push(() => {
      window.removeEventListener('focus', onFocusChange);
      window.removeEventListener('blur', onFocusChange);
    });
    this.presenceTimer = setInterval(() => this.reportPresence(), PRESENCE_CHECK_MS);
    this.reportPresence();
  }

  private reportPresence(): void {
    if (this.stopped || !window.api) return;
    const s = useAppStore.getState();
    const here = document.hasFocus() && Date.now() - this.lastInputAt < AWAY_AFTER_MS;
    const presence = {
      state: here ? 'here' as const : 'away' as const,
      viewing: s.activeMicrographId ? sendableTarget({ type: 'micrograph', id: s.activeMicrographId }) : null,
      editing: sendableTarget(s.editingSpotId ? { type: 'spot', id: s.editingSpotId } : myEditingTarget()),
    };
    const json = JSON.stringify(presence);
    if (json === this.presenceSent) return;
    this.presenceSent = json;
    void window.api.sync.livePresence(this.projectId, presence).catch(() => null);
  }

  /** Who is in the project now; names of people not in the Collaborators list yet are fetched (17an). */
  private onPresence(people: SyncLivePerson[]): void {
    usePresenceStore.getState().setPeople(people);
    const names = useSyncStore.getState().memberNames;
    const me = Number(useAuthStore.getState().user?.pkey ?? NaN);
    const unknown = people.some((p) => p.user !== me && !(p.user in names));
    if (!unknown || Date.now() - this.namesFetchedAt < NAMES_REFRESH_MS) return;
    this.namesFetchedAt = Date.now();
    void window.api?.sync.members(this.projectId, getRestServerUrl()).then((m) => {
      if (this.stopped || !m?.ok) return;
      const fresh: Record<number, string> = {};
      for (const x of m.members) fresh[x.user.pkey] = x.user.name || x.user.email || '';
      useSyncStore.getState().update({ memberNames: fresh });
    }).catch(() => null);
  }

  /** Follow the project on the live channel (main checks the account and server; logged out = later). */
  private followLive(): void {
    if (this.stopped || !window.api || LEGACY_SYNC) return;
    void window.api.sync.liveFollow(this.projectId, getRestServerUrl()).catch(() => null);
  }

  /** An event of the live channel for this project. */
  private onLive(e: SyncLiveEvent): void {
    if (this.stopped) return;
    switch (e.kind) {
      case 'status':
        if (e.live === this.live) return;
        this.live = e.live;
        useSyncStore.getState().update({ live: e.live });
        // Up (again): catch up on notices missed meanwhile (17ao). Down: poll on the normal timers
        if (e.live) this.pollWhenIdle();
        else {
          // Stale presence misleads: badges hide while the channel is down (17ao)
          usePresenceStore.getState().setPeople([]);
          this.schedulePoll();
        }
        return;
      case 'changed':
        // My own push needs no pull
        if (!e.mine) this.pollWhenIdle();
        return;
      case 'access':
      case 'parked':
        // Role, removal, parked pushes: the poll's normal checks (17h, 17k, 17aa)
        this.pollWhenIdle();
        return;
      case 'presence':
        if (this.live) this.onPresence(e.people);
        return;
      default:
    }
  }

  /**
   * Poll as soon as no cycle runs (a running cycle skips polls). A notice
   * during a poll in flight polls once more after it: the answer may
   * predate the change.
   */
  private pollWhenIdle(): void {
    if (this.stopped) return;
    if (this.polling) {
      this.pollAgain = true;
      return;
    }
    if (this.pollQueued) return;
    this.pollQueued = true;
    void (async () => {
      while (!this.stopped && this.running) {
        await new Promise((resolve) => setTimeout(resolve, IDLE_POLL_MS));
      }
      this.pollQueued = false;
      if (!this.stopped) await this.poll(false);
    })();
  }

  /** Dev test tools: one cycle now, as a Sync click or as an automatic cycle. */
  runForTest(userClick: boolean): void {
    if (userClick) this.pullRequested = true;
    void this.run();
  }

  /** Resolves when no cycle is running or queued. */
  async whenIdle(): Promise<void> {
    while (!this.stopped && (this.running || this.rerun || this.downloading)) {
      await new Promise((resolve) => setTimeout(resolve, IDLE_POLL_MS));
    }
  }

  /**
   * Save and push now (no pull) and wait for the cycle to end: "Sync and
   * log out" (16as, 16az). The result is the cycle's problem, if any.
   */
  async pushAndWait(): Promise<SyncCallResult> {
    void this.run();
    while (!this.stopped && (this.running || this.rerun)) {
      await new Promise((resolve) => setTimeout(resolve, IDLE_POLL_MS));
    }
    if (this.stopped) return { ok: false, kind: 'error', message: 'The project was closed.' };
    return this.problem ? { ok: false, kind: this.problem.kind, message: this.problem.message } : { ok: true };
  }

  /** The Sync click (any mode): save, push, pull. */
  syncNow(): void {
    this.pullRequested = true;
    void this.run();
  }

  /** A pull that is not a Sync click (opening, auto-pull): the notice instead of the dialog */
  private pullQuietly(): void {
    this.quietPull = true;
    void this.run();
  }

  async setMode(mode: SyncMode): Promise<SyncCallResult> {
    if (!window.api) return { ok: false, kind: 'error', message: 'Sync is not available' };
    const result = await window.api.sync.setMode(this.projectId, mode);
    if (!result.ok || this.stopped) return result;
    this.mode = mode;
    useSyncStore.getState().update({ mode });
    if (mode === 'automatic' && useSyncStore.getState().incoming > 0) this.pullQuietly();
    else if (mode === 'automatic' && useSyncStore.getState().activity === 'waiting') void this.run();
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
    this.debounceTimer = setTimeout(() => this.pushWhenEditDone(), DEBOUNCE_MS);
    if (!this.maxWaitTimer) this.maxWaitTimer = setTimeout(() => void this.run(), MAX_WAIT_MS);
  }

  /** The debounce ran out: push, unless an edit is still open (17aj; the 30 s cap still pushes). */
  private pushWhenEditDone(): void {
    if (this.stopped) return;
    if (this.isEditing()) {
      this.debounceTimer = setTimeout(() => this.pushWhenEditDone(), EDIT_POLL_MS);
      return;
    }
    this.debounceTimer = null;
    void this.run();
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
    const userClick = this.pullRequested;
    const wantPull = userClick || this.quietPull;
    this.pullRequested = false;
    this.quietPull = false;
    const fromDecision = this.decisionRun;
    this.decisionRun = false;
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
      if (result.ok && (pulled || useSyncStore.getState().downloads > 0)) this.startDownloads(api);
    } catch (error) {
      result = { ok: false, kind: 'error', message: error instanceof Error ? error.message : String(error) };
    } finally {
      this.running = false;
    }
    if (this.stopped) return;

    if (result.ok) {
      this.problem = null;
      this.retryCount = 0;
      useAuthStore.getState().setOffline(false);
      useSyncStore.getState().update({
        problem: null,
        progress: null,
        notice: null,
        lastSyncedAt: Date.now(),
        ...(pulled ? { incoming: 0, incomingFrom: [], openPrompt: null } : {}),
        activity: this.changedSinceRun ? 'waiting' : 'idle',
        pending: this.changedSinceRun ? null : 0,
        ...(result.ready ? { phase: 'ready' as const } : {}),
      });
      if (result.notAccepted > 0 || pulled) {
        void this.refreshCounts().then(() => {
          // A Sync click that left new items to decide opens the dialog (16x)
          if (this.stopped) return;
          const waiting = decisionsWaiting(useSyncStore.getState());
          if (userClick && waiting > decisionsBefore) {
            useSyncStore.getState().update({ decisionsOpen: true });
          } else if (fromDecision && waiting === 0) {
            useSyncStore.getState().update({ decisionsSettledAt: Date.now() });
          }
        });
      }
    } else {
      // The next try pulls too
      if (userClick) this.pullRequested = true;
      else if (wantPull) this.quietPull = true;
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
        regenerateComposites(compositesAffectedBy(r.changes), () => useAppStore.getState().project);
      }
      const c = await api.sync.pullCommit(this.projectId, r.pullId);
      if (!c.ok) return c;
      if (r.changes.length > 0) void this.loadPermissions(); // new entities: who created them
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
          regenerateComposites(compositesAffectedBy(r.changes, { withCreated: true }), () => useAppStore.getState().project);
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
    if (result.ok) this.scheduleDecisionSync();
    if (this.rerun) {
      this.rerun = false;
      void this.run();
    }
    return result;
  }

  /**
   * What waits for a decision, as of the project now: an edit not saved yet
   * (e.g. deleting an item that has a conflict) is saved first, since main
   * reads project.json and settles waiting items the user overtook.
   */
  async listDecisions(): Promise<SyncDecisionsResult> {
    const api = window.api;
    if (!api) return { ok: false, kind: 'error', message: 'Sync is not available' };
    while (this.running && !this.stopped) {
      await new Promise((resolve) => setTimeout(resolve, IDLE_POLL_MS));
    }
    if (this.stopped) return { ok: false, kind: 'error', message: 'The project was closed' };
    this.running = true;
    try {
      await this.saveIfNeeded(api);
      const r = await api.sync.decisions(this.projectId);
      // Listing may have turned a conflict into a question: the notice's counts follow
      if (r.ok) void this.refreshCounts();
      return r;
    } catch (error) {
      return { ok: false, kind: 'error', message: error instanceof Error ? error.message : String(error) };
    } finally {
      this.running = false;
      if (this.rerun && !this.stopped) {
        this.rerun = false;
        void this.run();
      }
    }
  }

  /** The sync after an answer: push and pull in either mode (16ab). */
  private scheduleDecisionSync(): void {
    if (this.stopped) return;
    this.changedSinceRun = true;
    if (!this.running) useSyncStore.getState().update({ activity: 'waiting' });
    if (this.decisionTimer) clearTimeout(this.decisionTimer);
    this.decisionTimer = setTimeout(() => {
      this.decisionTimer = null;
      this.pullRequested = true;
      this.decisionRun = true;
      void this.run();
    }, DECISION_SYNC_MS);
  }

  /**
   * Fetch the files pulls brought, beside the push cycles (a big download
   * must not hold up the next push). A request while one runs makes it go
   * round once more. A failure becomes the problem once no cycle is running
   * (whose result would overwrite it); its retry runs a cycle, which starts
   * the downloads again.
   */
  private startDownloads(api: Api): void {
    if (this.downloading) {
      this.downloadAgain = true;
      return;
    }
    this.downloading = (async () => {
      let d: { ok: true } | Failure;
      do {
        this.downloadAgain = false;
        d = await this.downloadFiles(api);
      } while (d.ok && this.downloadAgain && !this.stopped);
      if (d.ok || this.stopped) return;
      while (this.running && !this.stopped) {
        await new Promise((resolve) => setTimeout(resolve, IDLE_POLL_MS));
      }
      if (!this.stopped && !this.retryTimer) this.failed(d);
    })().finally(() => {
      this.downloading = null;
    });
  }

  /** One download run; the tree reloads thumbnails, the viewer reloads arrived originals. */
  private async downloadFiles(api: Api): Promise<{ ok: true } | Failure> {
    const d = await api.sync.download(this.projectId, getRestServerUrl());
    if (this.stopped) return { ok: true };
    if (!d.ok) return d;
    useSyncStore.getState().imagesArrived(d.images);
    regenerateComposites(compositesShowing(useAppStore.getState().project, d.images), () => useAppStore.getState().project);
    for (const id of new Set([...d.images, ...d.thumbnails])) {
      window.dispatchEvent(new CustomEvent('thumbnail-generated', { detail: { micrographId: id } }));
    }
    useSyncStore.getState().update({ downloads: 0, ...(this.running ? {} : { progress: null }) });
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

  private inDialog(): boolean {
    return document.querySelector('.MuiDialog-root:not([data-sync-decisions])') !== null;
  }

  /**
   * Changes are waiting but an edit is open (17ap): say who made them, and
   * pull once the edit closes.
   */
  private pullAfterEditing(): void {
    if (this.holdingForEdit || this.stopped) return;
    this.holdingForEdit = true;
    void (async () => {
      let shown: string | null = null;
      while (!this.stopped && this.isEditing()) {
        const s = useSyncStore.getState();
        const text = editWaitText(s.incoming, s.incomingFrom, this.inDialog());
        if (text !== shown) {
          shown = text;
          s.update({ notice: text });
        }
        await new Promise((resolve) => setTimeout(resolve, EDIT_POLL_MS));
      }
      this.holdingForEdit = false;
      if (this.stopped) return;
      if (useSyncStore.getState().notice === shown) useSyncStore.getState().update({ notice: null });
      if (this.mode === 'automatic' && useSyncStore.getState().incoming > 0) this.pullQuietly();
    })();
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
    if (failure.kind === 'access_removed') {
      // Removed from the project, or left it (17k): this copy stops syncing; App makes it separate
      console.warn(`[Sync] ${failure.message}`);
      this.stop();
      useSyncStore.getState().update({
        accessRemoved: {
          projectId: this.projectId,
          ...(failure.removal ?? { left: false, removedBy: null, parked: false, projectName: null }),
        },
      });
      return;
    }
    this.problem = failure;
    if (failure.kind === 'offline') useAuthStore.getState().setOffline(true);
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

  /** The next activity poll, after delayMs (default: by window focus) */
  private schedulePoll(delayMs?: number): void {
    if (this.stopped) return;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    const ms = delayMs ?? (this.live ? POLL_LIVE_MS : document.hasFocus() ? POLL_FOCUSED_MS : POLL_AWAY_MS);
    this.pollTimer = setTimeout(() => {
      this.pollTimer = null;
      void this.poll(false);
    }, ms);
  }

  /**
   * Count the changes waiting on the server (16ah). Skipped while a cycle
   * runs (its pull brings them) and while logged out; failures are left to
   * the push and pull, which report them. onOpen: Manual mode's check when
   * the project opens, which offers Sync Now if anything waits (§6.4).
   */
  private async poll(onOpen: boolean): Promise<void> {
    if (this.polling) {
      this.pollAgain = true;
      return;
    }
    this.polling = true;
    try {
      await this.pollOnce(onOpen);
    } finally {
      this.polling = false;
    }
    if (this.pollAgain && !this.stopped) {
      this.pollAgain = false;
      this.pollWhenIdle();
    }
  }

  private async pollOnce(onOpen: boolean): Promise<void> {
    const api = window.api;
    if (this.stopped || !api) return;
    // A running cycle skips the poll; on the live channel nothing else would come back for it
    if (this.running && this.live) this.pollAgain = true;
    if (!this.running && useAuthStore.getState().isAuthenticated) {
      this.lastPollAt = Date.now();
      const r = await api.sync.activity(this.projectId, getRestServerUrl(), document.hasFocus() ? 'active' : 'away')
        .catch(() => null);
      if (this.stopped) return;
      // The header's offline state (16ar); other failures (login, account) say nothing about the connection
      if (r?.ok) useAuthStore.getState().setOffline(false);
      else if (r?.kind === 'offline') useAuthStore.getState().setOffline(true);
      else if (r?.kind === 'access_removed') {
        void this.removedOnPoll(r);
        return;
      }
      // My role follows the server (the owner may have changed it, 17h)
      if (r?.ok && r.role && r.role !== useSyncStore.getState().role) useSyncStore.getState().update({ role: r.role });
      // Owner: parked changes waiting for review (17aa)
      if (r?.ok && r.parkedCount !== useSyncStore.getState().parkedCount) void this.refreshParked(r.parkedCount);
      // A cycle that started meanwhile may have pulled already: count again after it
      if (r?.ok && this.running) this.pollAgain = true;
      if (r?.ok && !this.running) {
        useSyncStore.getState().update({ incoming: r.incoming, incomingFrom: r.others });
        if (onOpen && r.incoming > 0 && this.mode === 'manual') {
          useSyncStore.getState().update({ openPrompt: { incoming: r.incoming, others: r.others } });
        }
        // Basic auto-pull (16av); an open edit holds it until it closes (17ap)
        if (r.incoming > 0 && this.mode === 'automatic') {
          if (this.isEditing()) this.pullAfterEditing();
          else this.pullQuietly();
        }
      }
    }
    this.schedulePoll();
  }

  /**
   * A poll learned I was removed (17k) before any push did: send what this
   * copy has not synced first, so the server parks it for the owner's
   * review, then stop. Otherwise the copy turned separate with that work
   * never sent (found by the e2e tests: the poll after coming back online
   * beat the push). Leaving pushed before it left, and a deleted project
   * parks nothing, so those stop right away.
   */
  private async removedOnPoll(r: Failure): Promise<void> {
    const api = window.api;
    if (!api || r.removal?.left || r.removal?.deleted) {
      this.failed(r);
      return;
    }
    // A cycle already under way meets the removal itself
    while (this.running && !this.stopped) await new Promise((resolve) => setTimeout(resolve, 200));
    if (this.stopped) return;
    this.clearTimers();
    this.running = true;
    let pushed: SyncPushResult | null = null;
    try {
      await this.saveIfNeeded(api);
      pushed = await api.sync.push(this.projectId, getRestServerUrl());
    } catch {
      pushed = null;
    } finally {
      this.running = false;
    }
    if (this.stopped) return;
    this.failed(pushed && !pushed.ok && pushed.kind === 'access_removed' ? pushed : r);
  }

  /** The owner's list of parked pushes, after the count changed (17aa). */
  async refreshParked(count?: number): Promise<void> {
    const api = window.api;
    if (!api || this.stopped) return;
    if (count === 0) {
      useSyncStore.getState().update({ parkedCount: 0, parked: [] });
      return;
    }
    const r = await loadParked(this.projectId);
    if (this.stopped || !r.ok) return;
  }

  /** My role and who created what, for the role checks (17h, 17i). */
  private async loadPermissions(): Promise<void> {
    const r = await window.api?.sync.permissions(this.projectId).catch(() => null);
    if (this.stopped || !r?.ok) return;
    useSyncStore.getState().update({ role: r.role, authors: r.authors });
    // Names for "Added by …" (once; offline leaves them out)
    if (Object.keys(useSyncStore.getState().memberNames).length > 0) return;
    const m = await window.api?.sync.members(this.projectId, getRestServerUrl()).catch(() => null);
    if (this.stopped || !m?.ok) return;
    const names: Record<number, string> = {};
    for (const x of m.members) names[x.user.pkey] = x.user.name || x.user.email || '';
    useSyncStore.getState().update({ memberNames: names, ...(r.role === null ? { role: m.myRole } : {}) });
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

/** Fetch the owner's parked pushes again (after a review). */
export async function refreshParked(): Promise<void> {
  await current?.refreshParked();
}

/** Save and push the open synced project now and wait (Sync and log out). */
export async function pushAndWait(): Promise<SyncCallResult> {
  if (!current) return { ok: false, kind: 'not_synced', message: 'This project is not synced.' };
  return current.pushAndWait();
}

/**
 * Dev test tools (Debug > Sync Test): run one cycle and wait for it to end.
 * userClick: as the Sync click (pulls, may open the decisions dialog);
 * otherwise as an automatic cycle (the notice instead of the dialog).
 * False when the open project is not synced.
 */
export async function runCycleAndWait(userClick: boolean): Promise<boolean> {
  if (!current) return false;
  const sync = current;
  sync.runForTest(userClick);
  await sync.whenIdle();
  return true;
}

/** What waits for a decision in the open synced project (unsaved edits saved first). */
export async function listSyncDecisions(): Promise<SyncDecisionsResult> {
  if (!current) return { ok: false, kind: 'not_synced', message: 'This project is not synced.' };
  return current.listDecisions();
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
