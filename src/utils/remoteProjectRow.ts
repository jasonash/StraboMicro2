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

/**
 * What the deep-link dialog (Open in StraboMicro) says about a project I am
 * in: "your project" only for the owner; a collaborator reads whose it is.
 */
export function deepLinkMineText(p: Pick<SyncServerProject, 'role' | 'owner'> & { here: 'synced' | 'local' | null }): string {
  const whose = p.role === 'owner'
    ? 'This is your project on StraboSpot'
    : p.owner?.name
      ? `You are a collaborator on ${p.owner.name}'s project on StraboSpot`
      : 'You are a collaborator on this project on StraboSpot';
  if (p.here === 'synced') return `${whose}, and your synced copy is on this computer.`;
  if (p.here === 'local') return `${whose}, and a copy of it is on this computer.`;
  return `${whose}. Download it as a synced copy: changes sync with StraboSpot automatically.`;
}
