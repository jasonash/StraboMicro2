/**
 * The activity panel's lines (collaboration spec v3 §6.3, 17m, 17v): the
 * server's brief history (newest first) grouped into bursts and worded
 * ("Maya added 3 spots to micrograph 'A'").
 *
 * - A cascaded delete or restore folds into its topmost item: "deleted
 *   micrograph 'A' (40 spots)".
 * - A burst is consecutive changes by the same person, of the same kind,
 *   on the same type under the same parent, the oldest at most 10 minutes
 *   before the newest; changes not in my copy yet never join changes that are.
 * - Names come from the change itself, else from my copy.
 */

import { containsLabel, fieldLabel, typeLabel, typePlural } from './syncDecisionText';

/** Changes this far apart (or closer) form one burst */
export const BURST_MS = 10 * 60_000;

export interface ActivityGroup {
  /** The newest change's seq */
  key: string;
  user: SyncUser;
  /** Changed by my account (on any computer) */
  you: boolean;
  /** An accepted parked change: whose it was */
  onBehalfOf: SyncUser | null;
  /** "added 3 spots to micrograph 'A'" */
  text: string;
  /** The newest change's time (ISO) */
  at: string;
  /** Not in my copy yet */
  pending: boolean;
  /** What a click selects (null: nothing to show) */
  target: { type: string; id: string } | null;
  /** Deleted items the group names (topmost of each cascade), for Restore (17n) */
  deleted: Array<{ type: string; id: string; name: string | null }>;
  seqs: number[];
}

export interface ActivityLookup {
  /** My account's pkey */
  me: number;
  /** The name of an entity in my copy (null: not there or unnamed) */
  nameOf: (type: string, id: string) => string | null;
  /** Is the entity in my copy */
  exists: (type: string, id: string) => boolean;
}

interface Item {
  row: SyncHistoryRow;
  /** Folded cascade: type => count beneath */
  contains: Record<string, number>;
}

const key = (type: string | null, id: string | null) => `${type ?? ''}:${id ?? ''}`;

/** Cascaded rows (same push, parent deleted/restored in it too) fold into the topmost. */
function foldCascades(rows: SyncHistoryRow[]): Item[] {
  const byPush = new Map<string, Map<string, SyncHistoryRow>>();
  for (const r of rows) {
    if ((r.op !== 'delete' && r.op !== 'restore') || !r.pushId) continue;
    const k = `${r.pushId}|${r.op}`;
    if (!byPush.has(k)) byPush.set(k, new Map());
    byPush.get(k)!.set(key(r.type, r.id), r);
  }
  const items = new Map<SyncHistoryRow, Item>();
  const folded = new Set<SyncHistoryRow>();
  for (const r of rows) {
    const same = (r.op === 'delete' || r.op === 'restore') && r.pushId ? byPush.get(`${r.pushId}|${r.op}`) : undefined;
    if (!same) continue;
    let root = r;
    const seen = new Set<SyncHistoryRow>([r]);
    for (let up = same.get(key(root.parentType, root.parentId)); up && !seen.has(up); up = same.get(key(root.parentType, root.parentId))) {
      seen.add(up);
      root = up;
    }
    if (root === r) continue;
    folded.add(r);
    if (!items.has(root)) items.set(root, { row: root, contains: {} });
    const c = items.get(root)!.contains;
    c[r.type] = (c[r.type] ?? 0) + 1;
  }
  return rows.filter((r) => !folded.has(r)).map((r) => items.get(r) ?? { row: r, contains: {} });
}

/** The kind of change, for grouping and wording */
function kindOf(r: SyncHistoryRow): string {
  return r.op === 'update' && r.movedFrom ? 'move' : r.op;
}

function burstKey(it: Item): string {
  const r = it.row;
  return [r.user.pkey, r.onBehalfOf?.pkey ?? '', kindOf(r), r.type, key(r.parentType, r.parentId), r.pending ? 'p' : ''].join('|');
}

function quoted(type: string, name: string | null): string {
  return name ? `${typeLabel(type)} '${name}'` : `an unnamed ${typeLabel(type)}`;
}

/** "Name, Notes"; a file ref reads as its kind ("Image") */
function fieldsText(paths: string[]): string {
  const labels: string[] = [];
  for (const p of paths) {
    const [top, sub] = p.split('.');
    const label = top === 'refs' && sub ? fieldLabel([sub]) : fieldLabel([top]);
    if (!labels.includes(label)) labels.push(label);
  }
  if (labels.length > 3) return `${labels.slice(0, 3).join(', ')} and ${labels.length - 3} more`;
  return labels.join(', ');
}

function sumContains(items: Item[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of items) for (const [t, n] of Object.entries(it.contains)) out[t] = (out[t] ?? 0) + n;
  return out;
}

function describe(items: Item[], look: ActivityLookup): { text: string; target: ActivityGroup['target'] } {
  const first = items[0].row;
  const ids = [...new Set(items.map((it) => it.row.id))];
  const n = ids.length;
  const type = first.type;
  const name = first.name ?? look.nameOf(type, first.id);
  const parentKnown = first.parentType && first.parentId && first.parentType !== 'project';
  const parentName = parentKnown ? look.nameOf(first.parentType!, first.parentId!) : null;
  const parent = parentKnown ? quoted(first.parentType!, parentName) : null;
  const parentTarget = parentKnown && look.exists(first.parentType!, first.parentId!)
    ? { type: first.parentType!, id: first.parentId! } : null;
  const self = look.exists(type, first.id) ? { type, id: first.id } : parentTarget;
  const many = `${n} ${typePlural(type)}`;
  const on = first.parentType === 'micrograph' ? 'on' : 'in';
  switch (kindOf(first)) {
    case 'create':
      return n === 1
        ? { text: `added ${quoted(type, name)}${parent ? ` to ${parent}` : ''}`, target: self }
        : { text: `added ${many}${parent ? ` to ${parent}` : ''}`, target: parentTarget };
    case 'delete':
    case 'restore': {
      const verb = first.op === 'delete' ? 'deleted' : 'restored';
      const contains = containsLabel(sumContains(items));
      return n === 1
        ? { text: `${verb} ${quoted(type, name)}${contains}`, target: first.op === 'delete' ? parentTarget : self }
        : { text: `${verb} ${many}${parent ? ` ${first.op === 'delete' ? 'from' : 'in'} ${parent}` : ''}${contains}`, target: parentTarget };
    }
    case 'move':
      return n === 1
        ? { text: `moved ${quoted(type, name)}${parent ? ` to ${parent}` : ''}`, target: self }
        : { text: `moved ${many}${parent ? ` to ${parent}` : ''}`, target: parentTarget };
    case 'update': {
      const paths = items.flatMap((it) => it.row.changedPaths ?? []);
      if (type === 'project') return { text: `changed the project settings${paths.length ? ` (${fieldsText(paths)})` : ''}`, target: null };
      return n === 1
        ? { text: `changed ${paths.length ? `${fieldsText(paths)} of ` : ''}${quoted(type, name)}`, target: self }
        : { text: `changed ${many}${parent ? ` ${on} ${parent}` : ''}`, target: parentTarget };
    }
    case 'import':
      return { text: 'imported the project', target: null };
    case 'replace_project':
      return { text: 'replaced the whole project', target: null };
    default:
      return { text: `changed ${quoted(type, name)}`, target: self };
  }
}

/** Group a page of brief history rows (newest first) into the panel's lines. */
export function groupActivity(rows: SyncHistoryRow[], look: ActivityLookup): ActivityGroup[] {
  const items = foldCascades(rows);
  const bursts: Item[][] = [];
  for (const it of items) {
    const cur = bursts[bursts.length - 1];
    if (cur && burstKey(cur[0]) === burstKey(it) &&
      Date.parse(cur[0].row.at) - Date.parse(it.row.at) <= BURST_MS) {
      cur.push(it);
    } else {
      bursts.push([it]);
    }
  }
  return bursts.map((b) => {
    const r = b[0].row;
    const { text, target } = describe(b, look);
    return {
      key: String(r.seq),
      user: r.user,
      you: r.user.pkey === look.me,
      onBehalfOf: r.onBehalfOf,
      text,
      at: r.at,
      pending: r.pending,
      target,
      deleted: r.op === 'delete'
        ? b.filter((it) => !look.exists(it.row.type, it.row.id)).map((it) => ({ type: it.row.type, id: it.row.id, name: it.row.name }))
        : [],
      seqs: b.flatMap((it) => [it.row.seq]),
    };
  });
}

/** "Maya", "You", or "Jason (for Dan)"-style: the line's subject */
export function whoText(g: Pick<ActivityGroup, 'you' | 'user'>): string {
  return g.you ? 'You' : g.user.name || 'Someone';
}

/** The whole line: "Maya added 3 spots to micrograph 'A'"; an accepted parked change names both */
export function lineText(g: ActivityGroup): string {
  const who = whoText(g);
  if (g.onBehalfOf) return `${who} accepted ${g.onBehalfOf.name || 'someone'}'s change: ${g.text}`;
  return `${who} ${g.text}`;
}

/** "just now", "5 min ago", "today 14:05", "yesterday 14:05", "Oct 1, 14:05" (year when not this year) */
export function whenText(iso: string, now: Date = new Date()): string {
  const t = new Date(iso);
  const ms = now.getTime() - t.getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 60 * 60_000) return `${Math.floor(ms / 60_000)} min ago`;
  const hm = t.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(now) - day(t)) / 86_400_000);
  if (days === 0) return `today ${hm}`;
  if (days === 1) return `yesterday ${hm}`;
  const date = t.toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', ...(t.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
  return `${date}, ${hm}`;
}

/**
 * May I offer Restore on this line (17n, 17w): Owners and Editors for any
 * deletion; a Contributor for their own (the server also checks that they
 * created everything in it).
 */
export function canRestore(g: Pick<ActivityGroup, 'deleted' | 'you'>, role: SyncRole | null): boolean {
  if (g.deleted.length === 0) return false;
  if (role === 'owner' || role === 'editor') return true;
  return role === 'contributor' && g.you;
}

/** Why a restore was turned down, in plain words */
export function restoreFailureText(reason: string): string {
  switch (reason) {
    case 'parent_deleted':
      return 'What it was in is deleted too. Restore that first.';
    case 'editor_required':
      return 'Only owners and editors can restore what someone else deleted.';
    case 'cascade_includes_others':
      return 'It holds items other people created, which your role cannot restore.';
    case 'viewer':
      return 'Your role in this project does not allow changes.';
    default:
      return 'It could not be restored.';
  }
}

/**
 * The website history page of a synced project (17ae): on the server the
 * copy is bound to, where its project number means something. The website
 * asks for a login when needed and comes back to the page. Null without a
 * server or project number.
 */
export function historyPageUrl(server: string | null, pid: number | string | null): string | null {
  const base = String(server ?? '').trim().replace(/\/+$/, '');
  const n = pid === null || pid === '' ? NaN : Number(pid);
  if (!base || !Number.isInteger(n) || n <= 0) return null;
  return `${base}/micro_history?project_id=${n}`;
}
