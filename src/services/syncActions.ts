/**
 * Sync actions started by the user (the header chip, File > Sync to Strabo
 * Server...). Kept apart from syncController.ts, which loads only for a
 * synced project; this file imports it on demand.
 */

import { useAuthStore, promptLogin } from '@/store/useAuthStore';
import { useSyncStore } from '@/store/useSyncStore';
import { useAppStore } from '@/store';
import { getRestServerUrl } from '@/components/dialogs/PreferencesDialog';
import { sameServer } from '@/utils/syncChipState';

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

/**
 * What logging out would leave behind in the open project (16as, 16az):
 * 'plain' = nothing (local-only, nothing waiting, or a copy of another
 * account or server, which this login could not sync anyway);
 * 'changes' = changes not yet synced; 'uploading' = its first upload runs.
 */
export type LogoutCheck =
  | { kind: 'plain' }
  | { kind: 'changes'; count: number }
  | { kind: 'uploading' };

export async function checkBeforeLogout(): Promise<LogoutCheck> {
  const s = useSyncStore.getState();
  const user = useAuthStore.getState().user;
  const project = useAppStore.getState().project;
  if (!s.synced || !user || !project || project.id !== s.projectId) return { kind: 'plain' };
  if (s.pkey !== String(user.pkey) || !sameServer(s.server, getRestServerUrl())) return { kind: 'plain' };
  if (s.phase === 'uploading') return { kind: 'uploading' };
  // Count now: the store's count can be a few seconds old (debounce)
  const status = await window.api?.sync.status(project.id, project).catch(() => null);
  const count = status?.synced ? status.pending : s.pending;
  return count !== null && count > 0 ? { kind: 'changes', count } : { kind: 'plain' };
}

/** "Sync and log out": push the open project now and wait for the result. */
export async function syncBeforeLogout(): Promise<SyncCallResult> {
  const { pushAndWait } = await import('@/services/syncController');
  return pushAndWait();
}
