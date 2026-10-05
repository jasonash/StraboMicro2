/**
 * Presence Store (Renderer Process)
 *
 * Who follows the open synced project on the live channel (spec v3
 * 17al-17an), as the live service last said; empty while the channel is
 * down (badges hidden, 17ao). Written by src/services/syncController.ts.
 *
 * Also what I am editing: EditingScope (src/components/Presence.tsx)
 * registers the item an open edit dialog changes; the controller sends it
 * with my presence. Nested dialogs stack; the newest counts.
 */

import { create } from 'zustand';
import type { PresenceTarget } from '@/utils/presence';

interface PresenceState {
  /** Every connection following the project, mine included (filtered for display) */
  people: SyncLivePerson[];
  editing: Array<{ key: number; target: PresenceTarget }>;
  setPeople: (people: SyncLivePerson[]) => void;
  /** Start editing target; returns the key to end it with */
  beginEditing: (target: PresenceTarget) => number;
  endEditing: (key: number) => void;
}

let nextKey = 1;

export const usePresenceStore = create<PresenceState>()((set) => ({
  people: [],
  editing: [],
  setPeople: (people) => set({ people }),
  beginEditing: (target) => {
    const key = nextKey++;
    set((s) => ({ editing: [...s.editing, { key, target }] }));
    return key;
  },
  endEditing: (key) => set((s) => ({ editing: s.editing.filter((e) => e.key !== key) })),
}));

/** The item I am editing in a dialog right now, or null */
export function myEditingTarget(): PresenceTarget | null {
  const list = usePresenceStore.getState().editing;
  return list.length > 0 ? list[list.length - 1].target : null;
}
