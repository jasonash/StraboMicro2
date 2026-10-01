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
  progress: SyncProgress | null;
  lastSyncedAt: number | null;
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
  progress: null,
  lastSyncedAt: null,
};

export const useSyncStore = create<SyncStoreState>()((set) => ({
  projectId: null,
  ...initial,
  update: (partial) => set(partial),
  reset: (projectId) => set({ projectId, ...initial }),
}));
