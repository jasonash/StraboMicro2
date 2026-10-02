/**
 * Opening one of my StraboSpot projects on this computer (spec v3 16ao),
 * shared by Open Remote Project and deep links:
 *   a synced copy here      open it
 *   a local-only copy here  open it, then the one-time prompt connects it (16an)
 *   nothing here            download it as a synced copy: converted projects
 *                           are cloned, older uploads imported and adopted
 */

import { getRestServerUrl } from '@/components/dialogs/PreferencesDialog';
import { describeProgress } from '@/utils/syncChipState';
import { offerLink } from './syncLinking';
import { requestFirstSync } from './syncActions';

export type RemoteProject = SyncServerProject & { here: 'synced' | 'local' | null };

/** Open a server project that is on this computer (p.here is set). */
export async function openRemoteHere(p: RemoteProject, onOpenProject: (projectId: string) => Promise<void> | void): Promise<void> {
  await onOpenProject(p.straboId);
  if (p.here === 'local') offerLink({ projectId: p.straboId, pid: p.pid, syncFormat: p.syncFormat, updatedAt: p.updatedAt });
}

/**
 * Download a server project as a synced copy (or use the synced copy of it
 * already here, existing). Reports progress as text; returns the project id
 * to open, or the reason it failed.
 */
export async function downloadRemote(
  p: RemoteProject,
  mode: SyncMode,
  onStatus: (status: string) => void
): Promise<{ ok: true; projectId: string; existing: boolean } | { ok: false; message: string }> {
  const api = window.api;
  if (!api) return { ok: false, message: 'The app is not ready.' };
  const off = api.sync.onProgress((progress) => {
    if (progress.projectId !== `remote:${p.pid}`) return;
    onStatus(describeProgress(progress) ?? 'Downloading…');
  });
  try {
    const r = await api.sync.openRemote(p.pid, getRestServerUrl(), mode);
    if (!r.ok) return { ok: false, message: r.message };
    // An older upload was adopted: its first upload into the same project runs now
    if (r.adopted) requestFirstSync(r.projectId);
    return { ok: true, projectId: r.projectId, existing: r.existing === true };
  } finally {
    off();
  }
}

/**
 * The project a strabospot.org deep link (pkey = server project number)
 * points at, when it is one of mine; null when it is someone else's, the
 * app is set to another server (project numbers are per server) or logged out.
 */
export async function findMyRemoteProject(pkey: string): Promise<RemoteProject | null> {
  const server = getRestServerUrl();
  let host = '';
  try {
    host = new URL(server).hostname.replace(/^www\./, '');
  } catch (_) {
    return null;
  }
  if (host !== 'strabospot.org' || !window.api) return null;
  const r = await window.api.sync.serverProjects(server);
  if (!r.ok) return null;
  return r.projects.find((p) => String(p.pid) === pkey) ?? null;
}
