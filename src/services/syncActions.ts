/**
 * Sync actions started by the user (the header chip, File > Sync to Strabo
 * Server...). Kept apart from syncController.ts, which loads only for a
 * synced project; this file imports it on demand.
 */

import { useAuthStore, promptLogin } from '@/store/useAuthStore';
import { useSyncStore } from '@/store/useSyncStore';

/** Window event: the user asked to turn sync on for the open local-only project (App.tsx handles it) */
export const TURN_ON_SYNC_EVENT = 'strabo:turn-on-sync';

/**
 * The Sync click: save, push, pull. Logged out, it asks for the login first
 * (Manual mode does not warn about it beforehand, 16af).
 */
export async function syncNowFromUser(): Promise<void> {
  const s = useSyncStore.getState();
  if (!s.synced) return;
  if (!useAuthStore.getState().isAuthenticated) {
    const ok = await promptLogin(`Log in as ${s.email ?? 'the account this copy belongs to'} to sync this project.`);
    if (!ok) return;
  }
  const { syncNow } = await import('@/services/syncController');
  syncNow();
}

/** Switch the open synced project between Automatic and Manual. */
export async function changeModeFromUser(mode: SyncMode): Promise<SyncCallResult> {
  const { changeSyncMode } = await import('@/services/syncController');
  return changeSyncMode(mode);
}

/** Ask App to open the turn-on dialog for the open project (16aj). */
export function requestTurnOnSync(): void {
  window.dispatchEvent(new CustomEvent(TURN_ON_SYNC_EVENT));
}

/** Projects whose first upload starts as soon as their sync starts, in either mode */
const firstSyncRequests = new Set<string>();

/**
 * Sync was just turned on for this project: its first upload runs when the
 * controller starts, also in Manual mode (the user just asked for it, 16aj).
 */
export function requestFirstSync(projectId: string): void {
  firstSyncRequests.add(projectId);
}

/** Read once by the controller when it starts */
export function takeFirstSyncRequest(projectId: string): boolean {
  return firstSyncRequests.delete(projectId);
}
