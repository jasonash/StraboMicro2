/**
 * Linking a local-only project to the same project on StraboSpot
 * (collaboration spec v3 §3.5, 16an, 16am), renderer side.
 *
 * offerLinkOnOpen   a local-only project opened while logged in: if the
 *                   server has it, I own it and the one-time prompt was
 *                   never answered, the prompt shows (SyncLinkPrompt)
 * answerLinkOffer   the prompt's answer: recorded (userData), then linking
 *                   starts in the chosen mode, or nothing (this computer only)
 * beginLinking      converted row: compare (hashing shows on the chip);
 *                   identical links at once, else SyncLinkChoiceDialog asks.
 *                   Legacy row: dates only; asks only when the server upload
 *                   is newer than the local copy's last change (P1-1)
 * requestLink       App does the link: save, unload, link (the folder
 *                   moves), first sync, reopen (LINK_SYNC_EVENT)
 */

import { useAppStore } from '@/store';
import { useAuthStore } from '@/store/useAuthStore';
import { useSyncStore, type SyncLinkTarget } from '@/store/useSyncStore';
import { getRestServerUrl } from '@/components/dialogs/PreferencesDialog';

/** Window event: App links the open project (detail: LinkRequest) */
export const LINK_SYNC_EVENT = 'strabo:link-sync';

export interface LinkRequest {
  projectId: string;
  pid: number;
  mode: SyncMode;
  use: 'mine' | 'theirs';
}

/** A local-only project just opened: show the one-time prompt if the server has it (owner, never answered). */
export async function offerLinkOnOpen(projectId: string): Promise<void> {
  const api = window.api;
  if (!api || !useAuthStore.getState().isAuthenticated) return;
  const r = await api.sync.serverProject(projectId, getRestServerUrl()).catch(() => null);
  if (!r?.ok || !r.row || r.answer !== null || r.row.role !== 'owner') return;
  if (useAppStore.getState().project?.id !== projectId) return;
  offerLink({ projectId, pid: r.row.pid, syncFormat: r.row.syncFormat, updatedAt: r.row.updatedAt });
}

/** Show the prompt for this project (also when it was answered before: Open Remote Project, 16ao) */
export function offerLink(target: SyncLinkTarget): void {
  useSyncStore.getState().update({ linkOffer: target });
}

/** The one-time prompt's answer */
export async function answerLinkOffer(answer: 'automatic' | 'manual' | 'local'): Promise<void> {
  const offer = useSyncStore.getState().linkOffer;
  useSyncStore.getState().update({ linkOffer: null });
  if (!offer || !window.api) return;
  await window.api.sync.promptAnswer(offer.projectId, answer).catch(() => null);
  if (answer !== 'local') await beginLinking(offer, answer);
}

/** Compare (converted) or check dates (legacy), then link or ask which copy to keep. */
export async function beginLinking(target: SyncLinkTarget, mode: SyncMode): Promise<void> {
  const api = window.api;
  if (!api) return;
  const project = useAppStore.getState().project;
  if (!project || project.id !== target.projectId) return;
  const localChanged = project.modifiedTimestamp ?? null;

  if (target.syncFormat === 'legacy') {
    // P1-1: ask only when the server upload is newer than the last local change
    const serverNewer = target.updatedAt !== null &&
      (localChanged === null || Date.parse(target.updatedAt) > Date.parse(localChanged));
    if (!serverNewer) {
      requestLink({ projectId: target.projectId, pid: target.pid, mode, use: 'mine' });
      return;
    }
    useSyncStore.getState().update({
      linkChoice: { ...target, mode, total: null, byType: {}, localChanged, serverChanged: target.updatedAt },
    });
    return;
  }

  useSyncStore.getState().update({ linking: { percent: null } });
  const off = api.sync.onProgress((p) => {
    if (p.projectId !== target.projectId || p.phase !== 'compare' || !p.bytesTotal) return;
    useSyncStore.getState().update({ linking: { percent: Math.floor(((p.bytesDone ?? 0) / p.bytesTotal) * 100) } });
  });
  try {
    const r = await api.sync.compare(target.projectId, getRestServerUrl(), target.pid);
    if (!r.ok) {
      alert(`This copy could not be compared with the one on StraboSpot.\n\n${r.message}`);
      return;
    }
    if (useAppStore.getState().project?.id !== target.projectId) return;
    if (r.identical) {
      requestLink({ projectId: target.projectId, pid: target.pid, mode, use: 'mine' });
      return;
    }
    useSyncStore.getState().update({
      linkChoice: { ...target, mode, total: r.total, byType: r.byType, localChanged: r.localChanged, serverChanged: r.serverChanged },
    });
  } finally {
    off();
    useSyncStore.getState().update({ linking: null });
  }
}

/** Ask App to link the open project */
export function requestLink(request: LinkRequest): void {
  window.dispatchEvent(new CustomEvent<LinkRequest>(LINK_SYNC_EVENT, { detail: request }));
}
