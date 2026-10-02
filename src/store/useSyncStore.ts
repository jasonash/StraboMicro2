/**
 * Sync Store (Renderer Process)
 *
 * Sync state of the open project, for display (the header status chip,
 * src/components/SyncStatusChip.tsx).
 * Written only by src/services/syncController.ts; a local-only project
 * leaves it at synced: false.
 */

import { create } from 'zustand';

export interface SyncProblem {
  kind: SyncFailureKind;
  message: string;
}

/** The server project a local-only copy links to */
export interface SyncLinkTarget {
  projectId: string;
  pid: number;
  syncFormat: string;
  /** When the server copy was last uploaded or changed */
  updatedAt: string | null;
}

export interface SyncStoreState {
  projectId: string | null;
  synced: boolean;
  mode: SyncMode | null;
  /** uploading until the first upload finished */
  phase: 'uploading' | 'ready' | null;
  /** The account and server the copy is bound to, and its server project number */
  email: string | null;
  pkey: string | null;
  server: string | null;
  pid: number | null;
  /** waiting: local changes not pushed yet (debounce running, or Manual mode) */
  activity: 'idle' | 'waiting' | 'syncing';
  /** Why the last push did not run or failed; cleared by the next success */
  problem: SyncProblem | null;
  /** Entity changes not on the server, as of the last count (null = unknown) */
  pending: number | null;
  refused: number;
  /** Changes waiting on the server (activity poll, 16ah); others: per person other than me */
  incoming: number;
  incomingFrom: Array<{ name: string; count: number }>;
  /** Manual mode, project just opened with changes waiting: the [Sync Now] [Work Offline] prompt (§6.4) */
  openPrompt: { incoming: number; others: Array<{ name: string; count: number }> } | null;
  /** Local-only project that is on the server: the one-time prompt (16an) */
  linkOffer: SyncLinkTarget | null;
  /** Linking under way: comparing (percent of originals hashed, null = not known yet) */
  linking: { percent: number | null } | null;
  /** The copies differ: which one to keep (16am) */
  linkChoice: (SyncLinkTarget & {
    mode: SyncMode;
    /** Converted rows: items that differ (null for legacy rows, which compare dates only) */
    total: number | null;
    byType: Record<string, number>;
    localChanged: string | null;
    serverChanged: string | null;
  }) | null;
  /** Entities with unresolved conflicts; delete-vs-edit questions; files to download */
  conflicts: number;
  questions: number;
  downloads: number;
  /** A short message about what sync is waiting for (e.g. an open edit) */
  notice: string | null;
  progress: SyncProgress | null;
  lastSyncedAt: number | null;
  /** The "Sync needs your decision" dialog is open */
  decisionsOpen: boolean;
  /** Items waiting when the user closed the notice; it shows again only above this */
  noticeDismissedTotal: number;
  /** When the sync after the last answer finished with nothing left to decide */
  decisionsSettledAt: number | null;
  /**
   * Micrograph id => count of originals a pull downloaded for it. The viewer
   * and overlays reload when it changes (the file path stays the same).
   */
  imageArrivals: Record<string, number>;
  /** Count one downloaded original per micrograph id */
  imagesArrived: (micrographIds: string[]) => void;
  update: (partial: Partial<Omit<SyncStoreState, 'update' | 'reset' | 'imagesArrived'>>) => void;
  reset: (projectId: string | null) => void;
}

const initial = {
  synced: false,
  mode: null,
  phase: null,
  email: null,
  pkey: null,
  server: null,
  pid: null,
  activity: 'idle' as const,
  problem: null,
  pending: null,
  refused: 0,
  incoming: 0,
  incomingFrom: [],
  openPrompt: null,
  linkOffer: null,
  linking: null,
  linkChoice: null,
  conflicts: 0,
  questions: 0,
  downloads: 0,
  notice: null,
  progress: null,
  lastSyncedAt: null,
  decisionsOpen: false,
  noticeDismissedTotal: 0,
  decisionsSettledAt: null,
  imageArrivals: {},
};

/** Items waiting for the user's decision (conflicted entities, delete questions, turned-down changes). */
export function decisionsWaiting(s: Pick<SyncStoreState, 'conflicts' | 'questions' | 'refused'>): number {
  return s.conflicts + s.questions + s.refused;
}

export const useSyncStore = create<SyncStoreState>()((set) => ({
  projectId: null,
  ...initial,
  update: (partial) => set(partial),
  imagesArrived: (micrographIds) => set((s) => {
    if (micrographIds.length === 0) return s;
    const imageArrivals = { ...s.imageArrivals };
    for (const id of micrographIds) imageArrivals[id] = (imageArrivals[id] ?? 0) + 1;
    return { imageArrivals };
  }),
  reset: (projectId) => set({ projectId, ...initial }),
}));
