/**
 * Collaboration invitations waiting for the logged-in account (spec v3
 * Phase 2, 17f), shared by the startup dialog, the header indicator and
 * Open Remote Project.
 *
 * App asks the server at launch and after each login (opening the dialog
 * when any wait), and again every 5 minutes and when the window regains
 * focus, at most once a minute (indicator only, never a dialog mid-session):
 * someone who reads the invitation email and switches to the app sees it.
 */

import { create } from 'zustand';
import { getRestServerUrl } from '@/components/dialogs/PreferencesDialog';

/** Time between background checks */
export const INVITES_RECHECK_MS = 5 * 60 * 1000;

/** Minimum time between checks when the window regains focus */
export const INVITES_FOCUS_MIN_MS = 60 * 1000;

interface InvitationsState {
  invitations: SyncInvitation[];
  dialogOpen: boolean;
  lastCheckedAt: number;
  /** Ask the server; openDialog shows the dialog when any wait */
  refresh: (openDialog?: boolean) => Promise<void>;
  /** Drop one (answered here) */
  remove: (pid: number) => void;
  openDialog: () => void;
  closeDialog: () => void;
  clear: () => void;
}

export const useInvitationsStore = create<InvitationsState>()((set, get) => ({
  invitations: [],
  dialogOpen: false,
  lastCheckedAt: 0,
  refresh: async (openDialog = false) => {
    if (!window.api) return;
    set({ lastCheckedAt: Date.now() });
    const r = await window.api.sync.invites(getRestServerUrl()).catch(() => null);
    // A failure (offline, server without collaboration) keeps what is known
    if (!r || !r.ok) return;
    set({ invitations: r.invitations, dialogOpen: openDialog && r.invitations.length > 0 ? true : get().dialogOpen });
  },
  remove: (pid) => set((s) => ({ invitations: s.invitations.filter((i) => i.pid !== pid) })),
  openDialog: () => set({ dialogOpen: true }),
  closeDialog: () => set({ dialogOpen: false }),
  clear: () => set({ invitations: [], dialogOpen: false, lastCheckedAt: 0 }),
}));
