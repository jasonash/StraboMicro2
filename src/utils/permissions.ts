/**
 * Role checks of a synced project shared with collaborators (collaboration
 * spec v3 §3.1, decisions 17h, 17i). The same rules the server applies to
 * every push (MsSync::writeDenied and the cascade rule), worked out in the
 * app so that nothing it would refuse can be changed here:
 *
 *   Owner, Editor   everything
 *   Contributor     creates anything anywhere; changes, moves and deletes
 *                   only what they created (a delete takes everything
 *                   beneath, so all of that must be theirs too); never the
 *                   project settings. A change of child order alone (adding
 *                   a child reorders its parent) is not an edit.
 *   Viewer          nothing
 *
 * An entity with no recorded creator was made on this computer, so it is
 * mine. A local-only project, or a synced copy whose role is not known yet,
 * has no restrictions (the server still checks every push).
 */

import { deepEqual } from './deepEqual';
import { explode, type EntityChange, type EntityType } from '../../electron/shared/entityModel.mjs';

export interface Permissions {
  role: SyncRole | null;
  me: number | null;
  /** 'type:id' => pkey of who created it */
  authors: Record<string, number>;
}

/** Why a change is not allowed */
export type PermissionProblem = 'viewer' | 'settings' | 'not_creator';

/** Any restriction at all (Viewer or Contributor) */
export function isRestricted(p: Permissions): boolean {
  return p.role === 'viewer' || p.role === 'contributor';
}

/** Can I add new things (anywhere) */
export function canCreate(p: Permissions): boolean {
  return p.role !== 'viewer';
}

/** Who created an entity, when it was not me (null: mine, or not known) */
export function creatorOf(p: Permissions, type: EntityType | string, id: string): number | null {
  const a = p.authors[`${type}:${id}`];
  return a === undefined || a === p.me ? null : a;
}

/** Can I change or delete this existing entity (its own fields, its place) */
export function canEditEntity(p: Permissions, type: EntityType | string, id: string): boolean {
  if (p.role === null || p.role === 'owner' || p.role === 'editor') return true;
  if (p.role === 'viewer') return false;
  if (type === 'project') return false;
  return creatorOf(p, type, id) === null;
}

/** Only the child order changed (not an edit, v3 §4.3) */
function orderOnly(c: EntityChange): boolean {
  return c.before !== null && c.after !== null &&
    c.before.parentType === c.after.parentType && c.before.parentId === c.after.parentId &&
    deepEqual(c.before.body, c.after.body);
}

/** Why this change (one entity, from diffProjects) is not allowed, or null */
export function changeProblem(p: Permissions, c: EntityChange): PermissionProblem | null {
  if (p.role === null || p.role === 'owner' || p.role === 'editor') return null;
  if (p.role === 'viewer') return 'viewer';
  if (c.before === null) return null; // a create
  if (c.after !== null && orderOnly(c)) return null;
  if (c.before.type === 'project') return 'settings';
  return canEditEntity(p, c.before.type, c.before.id) ? null : 'not_creator';
}

/** Split changes into the allowed and the refused ones */
export function splitChanges(p: Permissions, changes: EntityChange[]): {
  allowed: EntityChange[];
  refused: Array<{ change: EntityChange; problem: PermissionProblem }>;
} {
  const allowed: EntityChange[] = [];
  const refused: Array<{ change: EntityChange; problem: PermissionProblem }> = [];
  for (const c of changes) {
    const problem = changeProblem(p, c);
    if (problem === null) allowed.push(c);
    else refused.push({ change: c, problem });
  }
  return { allowed, refused };
}

/** The message for refused changes */
export function refusalMessage(problem: PermissionProblem): string {
  switch (problem) {
    case 'viewer':
      return "You're a Viewer on this project, so it can't be changed here.";
    case 'settings':
      return 'Only the owner or an Editor can change the project settings.';
    default:
      return 'Only the person who added it, or an Editor, can change or delete it.';
  }
}

/**
 * How many entities beneath this one (what deleting it takes along, as the
 * server cascades: children and micrographs nested under a micrograph)
 * someone else created. A Contributor can delete only when this is 0.
 */
export function othersBeneath(p: Permissions, project: unknown, type: EntityType | string, id: string): number {
  if (p.role !== 'contributor') return 0;
  let entities;
  try {
    entities = explode(project).entities;
  } catch (_) {
    return 0; // the server still checks
  }
  const children = new Map<string, string[]>();
  const add = (parent: string, child: string) => {
    const list = children.get(parent);
    if (list) list.push(child);
    else children.set(parent, [child]);
  };
  for (const [key, e] of Object.entries(entities)) {
    if (e.parentType && e.parentId) add(`${e.parentType}:${e.parentId}`, key);
    const nest = e.type === 'micrograph' ? e.body.parentID : null;
    if (typeof nest === 'string' && nest !== '') add(`micrograph:${nest}`, key);
  }
  const seen = new Set<string>();
  const stack = [...(children.get(`${type}:${id}`) ?? [])];
  let count = 0;
  while (stack.length > 0) {
    const key = stack.pop() as string;
    if (seen.has(key)) continue;
    seen.add(key);
    const sep = key.indexOf(':');
    if (creatorOf(p, key.slice(0, sep), key.slice(sep + 1)) !== null) count++;
    stack.push(...(children.get(key) ?? []));
  }
  return count;
}

/** The message when a Contributor's delete would take other people's items along */
export function othersBeneathMessage(what: string, count: number): string {
  return `This ${what} contains ${count} item${count === 1 ? '' : 's'} other people added, so you can't delete it. ` +
    'Ask the owner or an Editor.';
}

/** Why I can't change or delete this entity (the message), or null when I can */
export function editRefusal(p: Permissions, type: EntityType | string, id: string): string | null {
  if (canEditEntity(p, type, id)) return null;
  return refusalMessage(p.role === 'viewer' ? 'viewer' : type === 'project' ? 'settings' : 'not_creator');
}

