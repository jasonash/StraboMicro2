/**
 * The owner's review of parked changes (collaboration spec v3 §3.2, 17o,
 * 17x to 17aa): each parked change next to the project as it is now, and
 * what accepting it does to the project.
 *
 * - A created item with the items created inside it is one unit.
 * - Accept applies the member's values to the current project: fields the
 *   member changed take the member's value, everything else stays as it is
 *   now (newer work is kept).
 * - A unit that cannot be applied as it is (its parent was deleted since)
 *   is blocked with the reason; accepting never brings deleted items back.
 *   New micrographs and point count sessions are blocked too: their files
 *   (the image, the session) are not part of the parked change.
 * - Child-order-only and timestamp-only updates are not shown; they are
 *   decided with the rest.
 */

import { explode, PARENT, type EntityChange, type EntityState, type EntityType } from '../../electron/shared/entityModel.mjs';
import { containsLabel, fieldLabel, typeLabel, valueText } from './syncDecisionText';

export interface ParkedField {
  id: string;
  label: string;
  /** The member's value */
  theirs: string;
  /** The value in the project now */
  now: string;
}

export interface ParkedUnit {
  /** 'type:id' of the unit's main item */
  key: string;
  /** Every parked item this unit decides */
  keys: string[];
  op: SyncParkedChange['op'] | 'move';
  /** "Added spot 'Garnet 3' to micrograph 'A' (2 spots)" */
  text: string;
  fields: ParkedField[];
  /** Why Accept is not possible now (null: it is) */
  blocked: string | null;
  decided: 'accepted' | 'discarded' | null;
}

export interface ParkedReview {
  units: ParkedUnit[];
  /** Child-order-only and timestamp-only items, decided along with the rest */
  silentKeys: string[];
}

type Entities = Record<string, EntityState>;

/** 'type:id', as entityKey makes it */
const entityKey = (type: string, id: string) => `${type}:${id}`;
const keyOf = (c: { type: string; id: string }) => entityKey(c.type, c.id);

function isEntityType(t: unknown): t is EntityType {
  return typeof t === 'string' && Object.prototype.hasOwnProperty.call(PARENT, t);
}

function nameOfBody(body: Record<string, unknown> | undefined): string | null {
  const n = body?.name ?? body?.sampleID;
  return typeof n === 'string' && n ? n : null;
}

function quoted(type: string, name: string | null): string {
  return name ? `${typeLabel(type)} '${name}'` : `an unnamed ${typeLabel(type)}`;
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function parentText(cur: Entities, type: string | null | undefined, id: string | null | undefined): string | null {
  if (!type || !id || type === 'project') return null;
  const p = cur[entityKey(type, id)];
  return quoted(type, p ? nameOfBody(p.body as Record<string, unknown>) : null);
}

function valueAt(body: unknown, parts: string[]): unknown {
  let v: unknown = body;
  for (const p of parts) {
    if (!v || typeof v !== 'object') return undefined;
    v = (v as Record<string, unknown>)[p];
  }
  return v;
}

/** A body with dotted field changes applied (null removes), as the server applies them */
export function applyFields(body: Record<string, unknown>, fields: Record<string, unknown>): Record<string, unknown> {
  const out = JSON.parse(JSON.stringify(body)) as Record<string, unknown>;
  for (const [p, value] of Object.entries(fields)) {
    const parts = p.split('.');
    let obj = out;
    for (const part of parts.slice(0, -1)) {
      const next = obj[part];
      if (!next || typeof next !== 'object' || Array.isArray(next)) obj[part] = {};
      obj = obj[part] as Record<string, unknown>;
    }
    const last = parts[parts.length - 1];
    if (value === null) delete obj[last];
    else obj[last] = JSON.parse(JSON.stringify(value));
  }
  return out;
}

/** Entities below key in the current project (structural children and nested micrographs), parents first */
function descendants(cur: Entities, key: string): string[] {
  const out: string[] = [];
  const queue = [key];
  while (queue.length > 0) {
    const k = queue.shift()!;
    const sep = k.indexOf(':');
    const type = k.slice(0, sep);
    const id = k.slice(sep + 1);
    for (const [ck, e] of Object.entries(cur)) {
      if (out.includes(ck) || ck === key) continue;
      const nested = type === 'micrograph' && e.type === 'micrograph' && (e.body as Record<string, unknown>).parentID === id;
      if ((e.parentType === type && e.parentId === id) || nested) {
        out.push(ck);
        queue.push(ck);
      }
    }
  }
  return out;
}

function counts(keys: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of keys) {
    const t = k.slice(0, k.indexOf(':'));
    out[t] = (out[t] ?? 0) + 1;
  }
  return out;
}

/** Fields a save stamps by itself (never someone's edit) */
const BOOKKEEPING = new Set(['modifiedTimestamp', 'date']);

/** An update with nothing to review: child order or a save's timestamps only */
const isOrderOnly = (c: SyncParkedChange) =>
  c.op === 'update' && c.parentId === undefined &&
  Object.keys(c.fields ?? {}).every((f) => BOOKKEEPING.has(f));

/** The current project as entity states */
export function currentEntities(project: unknown): Entities {
  return project ? (explode(project as object).entities as Entities) : {};
}

/** Review rows for one parked push against the current project. */
export function buildReview(push: SyncParkedPush, cur: Entities): ParkedReview {
  const creates = new Map<string, SyncParkedChange>();
  for (const c of push.changes) if (c.op === 'create') creates.set(keyOf(c), c);
  const createdIn = (c: SyncParkedChange): string | null => {
    const pk = c.parentType && c.parentId ? entityKey(c.parentType, c.parentId) : null;
    if (pk && creates.has(pk)) return pk;
    const nest = c.type === 'micrograph' ? c.body?.parentID : null;
    const nk = typeof nest === 'string' && nest ? entityKey('micrograph', nest) : null;
    return nk && creates.has(nk) ? nk : null;
  };
  const rootOf = (key: string): string => {
    let k = key;
    const seen = new Set<string>();
    for (let up = createdIn(creates.get(k)!); up && !seen.has(up); up = createdIn(creates.get(k)!)) {
      seen.add(k);
      k = up;
    }
    return k;
  };

  const units: ParkedUnit[] = [];
  const silentKeys: string[] = [];
  const byRoot = new Map<string, string[]>();
  for (const k of creates.keys()) {
    const r = rootOf(k);
    if (!byRoot.has(r)) byRoot.set(r, []);
    if (k !== r) byRoot.get(r)!.push(k);
  }
  const decidedOf = (keys: string[]) => {
    const d = keys.map((k) => push.decided[k]).filter(Boolean);
    return d.length === keys.length && d.length > 0 ? d[0] : null;
  };

  for (const c of push.changes) {
    const key = keyOf(c);
    if (c.op === 'create') {
      if (!byRoot.has(key)) continue;
      const inside = byRoot.get(key)!;
      const keys = [key, ...inside];
      const parent = parentText(cur, c.parentType, c.parentId);
      let blocked: string | null = null;
      const memberName = push.user.name || 'the member';
      if (cur[key]) blocked = 'It is in the project already.';
      else if (keys.some((k) => k.startsWith('micrograph:'))) {
        blocked = `A new micrograph's image did not reach StraboSpot with it. Ask ${memberName} to send it as a .smz file.`;
      } else if (keys.some((k) => k.startsWith('point_count:'))) {
        blocked = `A point count session cannot be added from here. Ask ${memberName} to send it as a .smz file.`;
      }
      else if (c.parentType && c.parentType !== 'project' && c.parentId && !cur[entityKey(c.parentType, c.parentId)]) {
        blocked = `Its ${typeLabel(c.parentType)} was deleted since. Restore it from the Activity panel first.`;
      } else if (c.type === 'micrograph' && typeof c.body?.parentID === 'string' && c.body.parentID &&
        !cur[entityKey('micrograph', c.body.parentID)]) {
        blocked = 'The micrograph it was placed on was deleted since. Restore it from the Activity panel first.';
      }
      units.push({
        key, keys, op: 'create', fields: [], blocked, decided: decidedOf(keys),
        text: `Added ${quoted(c.type, nameOfBody(c.body))}${parent ? ` to ${parent}` : ''}${containsLabel(counts(inside))}`,
      });
    } else if (c.op === 'update') {
      if (isOrderOnly(c)) {
        silentKeys.push(key);
        continue;
      }
      const now = cur[key];
      const name = now ? nameOfBody(now.body as Record<string, unknown>) : null;
      const moved = c.parentId !== undefined && c.parentType !== undefined;
      const fields = Object.entries(c.fields ?? {}).map(([p, v]) => {
        const parts = p.split('.');
        return {
          id: p,
          label: fieldLabel(parts),
          theirs: valueText(parts, v).short,
          now: now ? valueText(parts, valueAt(now.body, parts)).short : '(deleted)',
        };
      });
      let blocked: string | null = null;
      if (!now) blocked = 'It was deleted since. Restore it from the Activity panel first.';
      else if (moved && c.parentType !== 'project' && !cur[entityKey(c.parentType!, c.parentId!)]) {
        blocked = `The ${typeLabel(c.parentType!)} it was moved to was deleted since.`;
      }
      const what = quoted(c.type, name);
      const text = moved
        ? `Moved ${what} to ${parentText(cur, c.parentType, c.parentId) ?? 'the top level'}${fields.length ? ' and changed it' : ''}`
        : c.type === 'project' ? 'Changed the project settings' : `Changed ${what}`;
      units.push({ key, keys: [key], op: moved ? 'move' : 'update', fields, blocked, decided: decidedOf([key]), text });
    } else if (c.op === 'delete') {
      const now = cur[key];
      const inside = now ? descendants(cur, key) : [];
      units.push({
        key, keys: [key], op: 'delete', fields: [], blocked: null, decided: decidedOf([key]),
        text: now
          ? `Deleted ${quoted(c.type, nameOfBody(now.body as Record<string, unknown>))}${containsLabel(counts(inside))}`
          : `Deleted ${typeLabel(c.type)} (it is gone already)`,
      });
    } else {
      units.push({
        key, keys: [key], op: c.op, fields: [], decided: decidedOf([key]),
        blocked: 'Restoring is done from the Activity panel.', text: `Restored ${quoted(c.type, null)}`,
      });
    }
  }
  return { units, silentKeys };
}

/** The store changes that accepting a unit makes to the current project (none when there is nothing to do). */
export function acceptChanges(push: SyncParkedPush, unit: ParkedUnit, cur: Entities): EntityChange[] {
  const byKey = new Map(push.changes.map((c) => [keyOf(c), c]));
  const c = byKey.get(unit.key);
  if (!c || unit.blocked) return [];
  if (c.op === 'create') {
    // Parents first: the parked push lists them in that order
    const out: EntityChange[] = [];
    for (const x of push.changes) {
      if (x.op !== 'create' || !unit.keys.includes(keyOf(x)) || !isEntityType(x.type)) continue;
      const parentType = isEntityType(x.parentType) ? x.parentType : null;
      out.push({
        key: keyOf(x),
        before: null,
        after: {
          type: x.type, id: x.id, parentType, parentId: parentType ? x.parentId ?? null : null,
          body: JSON.parse(JSON.stringify(x.body ?? {})),
          ...(x.childOrder ? { childOrder: x.childOrder } : {}),
        },
      });
    }
    return out;
  }
  const now = cur[unit.key];
  if (!now) return [];
  if (c.op === 'update') {
    const moved = c.parentId !== undefined && c.parentType !== undefined;
    const after: EntityState = {
      ...now,
      body: applyFields(now.body as Record<string, unknown>, c.fields ?? {}),
      ...(moved && (c.parentType === null || isEntityType(c.parentType)) ? { parentType: c.parentType, parentId: c.parentId ?? null } : {}),
    };
    return [{ key: unit.key, before: now, after }];
  }
  if (c.op === 'delete') {
    return [unit.key, ...descendants(cur, unit.key)].map((k) => ({ key: k, before: cur[k], after: null }));
  }
  return [];
}

/** "Dan Smith's 4 unsynced changes are waiting for your review" */
export function waitingText(pushes: Array<Pick<SyncParkedPush, 'user' | 'changes'>>): string {
  const per = new Map<string, number>();
  for (const p of pushes) {
    const n = p.changes.filter((c) => !isOrderOnly(c)).length;
    const who = p.user.name || 'Someone';
    per.set(who, (per.get(who) ?? 0) + n);
  }
  const parts = [...per].map(([who, n]) => `${who}'s ${n} unsynced ${n === 1 ? 'change' : 'changes'}`);
  if (parts.length === 0) return '';
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `${capitalize(list)} ${parts.length === 1 && [...per.values()][0] === 1 ? 'is' : 'are'} waiting for your review`;
}
