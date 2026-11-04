/**
 * The owner's list of parked pushes (collaboration spec v3, 17o, 17aa),
 * shared by the sync controller's poll and the review dialog. Its own
 * module so the dialog does not load the sync controller (which loads only
 * for synced projects, useProjectSync).
 */

import { useSyncStore } from '@/store/useSyncStore';
import { getRestServerUrl } from '@/components/dialogs/PreferencesDialog';
import { decideAll, hasNothingToReview } from '@/utils/parkedReview';

/**
 * The owner's parked pushes (17o), into useSyncStore. A push with nothing to
 * review (child order and timestamps only) is settled as discarded here,
 * since it has no row in the review to decide it.
 */
export async function loadParked(projectId: string): Promise<{ ok: true; parked: SyncParkedPush[] } | { ok: false; message: string }> {
  const api = window.api;
  if (!api) return { ok: false, message: 'Sync is not available' };
  const server = getRestServerUrl();
  const r = await api.sync.parked(projectId, server).catch(() => null);
  if (!r || !r.ok) return { ok: false, message: r?.message ?? 'The changes waiting for review could not be loaded.' };
  const parked: SyncParkedPush[] = [];
  for (const p of r.parked) {
    if (!hasNothingToReview(p)) {
      parked.push(p);
      continue;
    }
    const d = await api.sync.reviewParked(projectId, server, p.id, decideAll(p, 'discarded'), p.user.pkey).catch(() => null);
    if (!d?.ok) parked.push(p);
  }
  useSyncStore.getState().update({ parkedCount: r.parked.length, parked });
  return { ok: true, parked };
}
