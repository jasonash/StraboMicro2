/**
 * What an end-to-end test may reach in the page (tests/e2e/lib): the
 * stores, to set up data the way the UI does and to check the project
 * under the screen. Loaded by main.tsx only in test mode (e2eMode.ts).
 */

import { useAppStore } from '@/store/useAppStore';
import { useSyncStore } from '@/store/useSyncStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useInvitationsStore } from '@/store/useInvitationsStore';
import { usePresenceStore } from '@/store/usePresenceStore';

declare global {
  interface Window {
    __e2e?: {
      app: typeof useAppStore;
      sync: typeof useSyncStore;
      auth: typeof useAuthStore;
      invitations: typeof useInvitationsStore;
      presence: typeof usePresenceStore;
    };
  }
}

window.__e2e = { app: useAppStore, sync: useSyncStore, auth: useAuthStore, invitations: useInvitationsStore, presence: usePresenceStore };
