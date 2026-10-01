/**
 * Sync Store (Renderer Process)
 *
 * Sync state of the open project, for display (the header status chip).
 * Written only by src/services/syncController.ts; a local-only project
 * leaves it at synced: false.
 */

import { create } from 'zustand';

export interface SyncProblem {
  kind: SyncFailureKind;
  message: string;
}

export interface SyncStoreState {
  projectId: string | null;
  synced: boolean;
  mode: SyncMode | null;
  /** uploading until the first upload finished */
  phase: 'uploading' | 'ready' | null;
  /** The account the copy is bound to */
  email: string | null;
  /** waiting: local changes not pushed yet (debounce running, or Manual mode) */
  activity: 'idle' | 'waiting' | 'syncing';
  /** Why the last push did not run or failed; cleared by the next success */
  problem: SyncProblem | null;
  /** Entity changes not on the server, as of the last count (null = unknown) */
  pending: number | null;
  refused: number;
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
  update: (partial: Partial<Omit<SyncStoreState, 'update' | 'reset'>>) => void;
  reset: (projectId: string | null) => void;
}

const initial = {
  synced: false,
  mode: null,
  phase: null,
  email: null,
  activity: 'idle' as const,
  problem: null,
  pending: null,
  refused: 0,
  conflicts: 0,
  questions: 0,
  downloads: 0,
  notice: null,
  progress: null,
  lastSyncedAt: null,
  decisionsOpen: false,
  noticeDismissedTotal: 0,
  decisionsSettledAt: null,
};

/** Items waiting for the user's decision (conflicted entities, delete questions, turned-down changes). */
export function decisionsWaiting(s: Pick<SyncStoreState, 'conflicts' | 'questions' | 'refused'>): number {
  return s.conflicts + s.questions + s.refused;
}

export const useSyncStore = create<SyncStoreState>()((set) => ({
  projectId: null,
  ...initial,
  update: (partial) => set(partial),
  reset: (projectId) => set({ projectId, ...initial }),
}));
