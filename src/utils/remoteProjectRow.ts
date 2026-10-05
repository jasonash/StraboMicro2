/**
 * The second line of a row in Open Remote Project: when it changed, what
 * this computer has, whose it is, and who is in it. Same-named projects
 * (e.g. a restored project and the owner's re-synced kept copy) also get
 * their StraboSpot project number, so they can be told apart.
 */

import { formatSyncDate } from '@/utils/formatSyncDate';

type Row = Pick<SyncServerProject, 'pid' | 'name' | 'role' | 'updatedAt' | 'owner' | 'members'> & { here: 'synced' | 'local' | null };

export function remoteRowText(p: Row, all: Array<Pick<SyncServerProject, 'name'>>): string {
  const parts = [p.updatedAt ? `Changed ${formatSyncDate(p.updatedAt)}` : 'On StraboSpot'];
  if (p.here === 'synced') parts.push('synced copy on this computer');
  else if (p.here === 'local') parts.push('a copy on this computer (it will be connected)');
  if (p.role !== 'owner' && p.owner?.name) parts.push(`${p.owner.name}'s project`);
  // An older server leaves members out
  if (typeof p.members === 'number' && p.members > 0) parts.push(p.members === 1 ? 'only you' : `${p.members} people`);
  const key = (n: string) => n.trim().toLowerCase();
  if (all.filter((x) => key(x.name || '') === key(p.name || '')).length > 1) parts.push(`StraboSpot project ${p.pid}`);
  return parts.join(' · ');
}
