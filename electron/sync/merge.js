/**
 * Three-way merge of synced entities (collaboration spec v3 §4)
 *
 * Inputs are entity states ({ type, id, parentType, parentId, body,
 * childOrder }, see electron/shared/entityModel.mjs):
 *   base    as the server last confirmed it (the sync base)
 *   mine    the local project now
 *   theirs  the server now (pulled changes, or a 409's current state)
 * null means the entity does not exist on that side (deleted or never had).
 *
 * Field rules (§4.1, §4.2):
 *   - Nested objects merge per key, so mineralogy.notes and
 *     mineralogy.minerals are separate fields.
 *   - Other lists are one value (items have no ids), except:
 *     id sets (spot.tags, micrograph.tags, group.micrographs, group.spotIDs,
 *     tag.spotIDs) merge as sets, and id-keyed lists (micrograph
 *     sketchLayers and each layer's strokes and textItems) merge per item.
 *   - modifiedTimestamp: the later value wins, never a conflict.
 *   - null and a missing key are the same (the push protocol's rule).
 *   - Changed on both sides to different values = conflict; the merged
 *     value keeps mine until the user picks.
 * The parent (parentType + parentId) is one field (§4.4). Child order is
 * never a conflict: mine if only mine reordered, else theirs (§4.3).
 *
 * mergeProject also handles deletions (§4.5): a deletion on one side wins
 * when the other side did not touch the entity (or anything beneath it);
 * otherwise it is a delete-vs-edit question for the user and nothing is
 * deleted locally until it is answered.
 */

const { deepEqual } = require('../shared/deepEqual.mjs');
const { entityKey, DEPTH } = require('../shared/entityModel.mjs');

/**
 * @typedef {Object} FieldConflict
 * @property {string[]} path - Body path; '[<id>]' segments address items of
 *   id-keyed lists; ['@parent'] is the parent
 * @property {unknown} base
 * @property {unknown} mine
 * @property {unknown} theirs
 */

const ID_SETS = Object.freeze({
  spot: ['tags'],
  micrograph: ['tags'],
  group: ['micrographs', 'spotIDs'],
  tag: ['spotIDs'],
});

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** null and undefined are both "absent". */
function norm(v) {
  return v === null ? undefined : v;
}

function same(a, b) {
  const x = norm(a);
  const y = norm(b);
  if (x === undefined || y === undefined) return x === y;
  return deepEqual(x, y);
}

const itemSegment = (id) => `[${id}]`;
const isItemSegment = (s) => typeof s === 'string' && s.startsWith('[') && s.endsWith(']');

function isIdSet(type, path) {
  return path.length === 1 && (ID_SETS[type] || []).includes(path[0]);
}

function isIdKeyed(type, path) {
  if (type !== 'micrograph' || path[0] !== 'sketchLayers') return false;
  if (path.length === 1) return true;
  return path.length === 3 && isItemSegment(path[1]) && (path[2] === 'strokes' || path[2] === 'textItems');
}

/** The later of two timestamps (ISO strings or epoch numbers). */
function later(a, b) {
  const t = (v) => (typeof v === 'number' ? v : Date.parse(String(v)));
  const ta = t(a);
  const tb = t(b);
  if (Number.isNaN(ta)) return b;
  if (Number.isNaN(tb)) return a;
  return tb > ta ? b : a;
}

/** base + added by either side - removed by either side; mine's order first. */
function mergeIdSet(base, mine, theirs) {
  const arr = (v) => (Array.isArray(v) ? v : []);
  const b = new Set(arr(base));
  const m = arr(mine);
  const t = arr(theirs);
  const mSet = new Set(m);
  const tSet = new Set(t);
  const out = m.filter((x) => !(b.has(x) && !tSet.has(x)));
  for (const x of t) {
    if (!b.has(x) && !mSet.has(x)) out.push(x);
  }
  if (out.length === 0 && norm(mine) === undefined && norm(theirs) === undefined) return undefined;
  return out;
}

/**
 * Merge one value. Returns the merged value and the conflicts beneath it.
 * @param {unknown} base
 * @param {unknown} mine
 * @param {unknown} theirs
 * @param {string} type - Entity type (for the per-type list rules)
 * @param {string[]} path
 * @returns {{ value: unknown, conflicts: FieldConflict[] }}
 */
function mergeValue(base, mine, theirs, type, path) {
  if (same(mine, theirs)) return { value: mine, conflicts: [] };
  if (same(mine, base)) return { value: theirs, conflicts: [] };
  if (same(theirs, base)) return { value: mine, conflicts: [] };

  // Changed on both sides, to different values
  const last = path[path.length - 1];
  if (last === 'modifiedTimestamp' && norm(mine) !== undefined && norm(theirs) !== undefined) {
    return { value: later(mine, theirs), conflicts: [] };
  }
  if (isIdSet(type, path)) {
    return { value: mergeIdSet(base, mine, theirs), conflicts: [] };
  }
  if (isIdKeyed(type, path) && Array.isArray(norm(mine) ?? []) && Array.isArray(norm(theirs) ?? []) &&
    Array.isArray(norm(base) ?? [])) {
    return mergeIdKeyed(base, mine, theirs, type, path);
  }
  const b = norm(base);
  if (isPlainObject(mine) && isPlainObject(theirs) && (b === undefined || isPlainObject(b))) {
    const bo = b === undefined ? {} : b;
    /** @type {Record<string, unknown>} */
    const out = {};
    const conflicts = [];
    for (const k of new Set([...Object.keys(mine), ...Object.keys(theirs), ...Object.keys(bo)])) {
      const r = mergeValue(bo[k], mine[k], theirs[k], type, [...path, k]);
      conflicts.push(...r.conflicts);
      if (norm(r.value) !== undefined) out[k] = r.value;
    }
    return { value: out, conflicts };
  }
  return { value: mine, conflicts: [{ path, base, mine, theirs }] };
}

/** Lists of objects with unique ids: merge per item, keep mine's order, add theirs' new items. */
function mergeIdKeyed(base, mine, theirs, type, path) {
  const byId = (v) => {
    /** @type {Map<string, object>} */
    const map = new Map();
    for (const item of Array.isArray(v) ? v : []) {
      if (item && typeof item.id === 'string') map.set(item.id, item);
    }
    return map;
  };
  const b = byId(base);
  const m = byId(mine);
  const t = byId(theirs);
  const ids = [...m.keys()];
  for (const id of t.keys()) if (!m.has(id)) ids.push(id);
  for (const id of b.keys()) if (!m.has(id) && !t.has(id)) ids.push(id);
  const out = [];
  const conflicts = [];
  for (const id of ids) {
    const r = mergeValue(b.get(id), m.get(id), t.get(id), type, [...path, itemSegment(id)]);
    conflicts.push(...r.conflicts);
    if (norm(r.value) !== undefined) out.push(r.value);
  }
  if (out.length === 0 && norm(mine) === undefined && norm(theirs) === undefined) return { value: undefined, conflicts };
  return { value: out, conflicts };
}

/** Body, parent and child order equal (versions and refs ignored). */
function sameState(a, b) {
  if (!a || !b) return a === b;
  return a.parentType === b.parentType && a.parentId === b.parentId &&
    same(a.body, b.body) && same(a.childOrder ?? {}, b.childOrder ?? {});
}

/** Body and parent equal: what an edit changes (child order is not an edit of the entity). */
function sameContent(a, b) {
  if (!a || !b) return a === b;
  return a.parentType === b.parentType && a.parentId === b.parentId && same(a.body, b.body);
}

/**
 * Merge one entity that exists on both sides.
 * @param {object | null} base
 * @param {object} mine
 * @param {object} theirs
 * @returns {{ state: object, conflicts: FieldConflict[] }}
 */
function mergeEntity(base, mine, theirs) {
  const type = mine.type;
  const body = mergeValue(base ? base.body : {}, mine.body, theirs.body, type, []);
  const conflicts = [...body.conflicts];

  // The parent is one value (type and id together)
  const parentOf = (s) => (s ? { parentType: s.parentType, parentId: s.parentId } : undefined);
  let { parentType, parentId } = mine;
  if (same(parentOf(mine), parentOf(base)) && base) {
    ({ parentType, parentId } = theirs);
  } else if (!same(parentOf(theirs), parentOf(base)) && !same(parentOf(mine), parentOf(theirs)) && base) {
    conflicts.push({ path: ['@parent'], base: parentOf(base), mine: parentOf(mine), theirs: parentOf(theirs) });
  }

  /** @type {object} */
  const state = { type, id: mine.id, parentType, parentId, body: body.value || {} };
  if (mine.childOrder || theirs.childOrder) {
    const baseOrder = base ? base.childOrder ?? {} : {};
    state.childOrder = same(mine.childOrder ?? {}, baseOrder) || !same(theirs.childOrder ?? {}, baseOrder)
      ? theirs.childOrder ?? mine.childOrder
      : mine.childOrder;
  }
  return { state, conflicts };
}

/** Key of the structural parent and of the nesting micrograph (parentID), if any. */
function upKeys(state) {
  const out = [];
  if (state.parentType) out.push(entityKey(state.parentType, state.parentId));
  if (state.type === 'micrograph' && typeof state.body.parentID === 'string' && state.body.parentID) {
    out.push(entityKey('micrograph', state.body.parentID));
  }
  return out;
}

/**
 * @typedef {Object} DeleteQuestion
 * @property {string} key - The topmost entity of the question
 * @property {'theirs_deleted' | 'mine_deleted'} kind - theirs_deleted: they
 *   deleted it and you changed it or added beneath it; mine_deleted: you
 *   deleted it and they changed it
 * @property {string[]} keys - Every entity in the question (held locally),
 *   parents first; mine_deleted: what I deleted with it and what they added
 *   beneath it
 * @property {number} localChanges - theirs_deleted: your edits and additions in it
 * @property {number} [theirChanges] - mine_deleted: their edits and additions in it
 */

/**
 * Merge pulled entity states into the local project.
 * @param {Record<string, object>} base - 'type:id' => state (+ version)
 * @param {{ entities: Record<string, object>, order: string[] }} mine - explode() of the local project
 * @param {Map<string, object | null>} theirs - Changed entities only: 'type:id' => server state, null = deleted
 * @param {{ held?: Set<string> }} [options] - held: entities of earlier unanswered
 *   questions (their membership ids stay, an answer may bring them back)
 * @returns {{
 *   changes: Array<{ key: string, before: object | null, after: object | null }>,
 *   conflicts: Array<{ key: string, fields: FieldConflict[] }>,
 *   questions: DeleteQuestion[],
 * }} changes: what the local project must become (before = mine now);
 *   conflicts: entities whose merged state keeps mine in the listed fields;
 *   questions: deletions held until the user answers
 */
function mergeProject(base, mine, theirs, options = {}) {
  const changes = [];
  const conflicts = [];
  const questions = [];
  const local = mine.entities;
  const touched = (k) => !base[k] || !sameContent(base[k], local[k]); // local create or edit

  // Children of each local entity (structural and nested), to walk subtrees
  /** @type {Map<string, string[]>} */
  const below = new Map();
  for (const k of mine.order) {
    for (const up of upKeys(local[k])) {
      if (!below.has(up)) below.set(up, []);
      below.get(up).push(k);
    }
  }
  // A deleted entity's local subtree: what they deleted with it, plus what
  // I added beneath it (a child they moved out first is not in it)
  const subtree = (root) => {
    const out = [];
    const seen = new Set();
    const stack = [root];
    while (stack.length > 0) {
      const k = stack.pop();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(k);
      for (const c of below.get(k) || []) {
        if (deleted.has(c) || !base[c]) stack.push(c);
      }
    }
    return out;
  };

  // Their deletions, by topmost deleted entity
  const deleted = new Set([...theirs].filter(([, s]) => s === null).map(([k]) => k));
  const handled = new Set();
  for (const k of deleted) {
    const b = base[k];
    const ups = b ? upKeys(b) : local[k] ? upKeys(local[k]) : [];
    if (ups.some((u) => deleted.has(u))) continue; // not a root
    const keys = local[k] ? subtree(k) : [k];
    for (const x of keys) handled.add(x);
    const localKeys = keys.filter((x) => local[x]);
    const edits = localKeys.filter((x) => touched(x)).length;
    if (edits > 0) {
      questions.push({ key: k, kind: 'theirs_deleted', keys: localKeys, localChanges: edits });
    } else {
      // Children first, so removals never leave a child without its parent
      for (const x of [...localKeys].reverse()) changes.push({ key: x, before: local[x], after: null });
    }
  }
  for (const k of deleted) handled.add(k);

  // My deletions, by topmost entity I deleted: one question when they
  // changed anything in it or added beneath it, else my deletion stands
  // (pushed next). Their entity state wins for the walk up (they may have
  // moved it); an entity they deleted too is simply gone.
  const stateOf = (k) => (theirs.has(k) ? theirs.get(k) : base[k]) || null;
  const missing = (k) => !local[k] && stateOf(k) !== null;
  const rootOfMissing = (k) => {
    let r = k;
    for (let guard = 0; guard < 1000; guard++) {
      const up = upKeys(stateOf(r)).find((u) => missing(u));
      if (!up) return r;
      r = up;
    }
    return r;
  };
  /** @type {Map<string, { keys: string[], theirChanges: number }>} */
  const myDeletes = new Map();
  for (const k of new Set([...Object.keys(base), ...theirs.keys()])) {
    if (handled.has(k) || !missing(k)) continue;
    const root = rootOfMissing(k);
    if (!myDeletes.has(root)) myDeletes.set(root, { keys: [], theirChanges: 0 });
    const g = myDeletes.get(root);
    g.keys.push(k);
    const t = theirs.get(k);
    if (t && (!base[k] || !sameContent(base[k], t))) g.theirChanges++;
  }
  for (const [root, g] of myDeletes) {
    if (!base[root]) continue; // their new entities under something I still have: plain creates
    for (const k of g.keys) handled.add(k);
    if (g.theirChanges === 0) continue;
    const keys = g.keys.sort((x, y) => DEPTH[stateOf(x).type] - DEPTH[stateOf(y).type]);
    questions.push({ key: root, kind: 'mine_deleted', keys, localChanges: 0, theirChanges: g.theirChanges });
  }

  for (const [k, t] of theirs) {
    if (handled.has(k) || t === null) continue;
    const b = base[k] || null;
    const m = local[k] || null;
    if (!m) {
      changes.push({ key: k, before: null, after: t }); // created by them (missing ones were handled above)
      continue;
    }
    const r = mergeEntity(b, m, t);
    if (r.conflicts.length > 0) conflicts.push({ key: k, fields: r.conflicts });
    if (!sameState(r.state, m)) changes.push({ key: k, before: m, after: r.state });
  }
  // Membership ids of entities deleted by them, or by me with no question
  const held = new Set([...(options.held || []), ...questions.flatMap((q) => q.keys)]);
  dropDeadMembers(local, changes, (k) => !held.has(k) && (Boolean(base[k]) || (theirs.has(k) && theirs.get(k) === null)));

  // Removals children first, then the rest parents first (creates need their parent)
  const removals = changes.filter((c) => c.after === null);
  const rest = changes.filter((c) => c.after !== null).sort((x, y) => DEPTH[x.after.type] - DEPTH[y.after.type]);
  return { changes: [...removals, ...rest], conflicts, questions };
}

/** Id set field => type of the entity its ids point at. */
const MEMBER_TARGET = Object.freeze({
  spot: Object.freeze({ tags: 'tag' }),
  micrograph: Object.freeze({ tags: 'tag' }),
  group: Object.freeze({ micrographs: 'micrograph', spotIDs: 'spot' }),
  tag: Object.freeze({ spotIDs: 'spot' }),
});

/**
 * Drop membership ids that point at an entity gone after these changes
 * (§4.5): a tag deleted on a spot tagged meanwhile, a deleted micrograph
 * still listed by a group. Only ids of entities isDead accepts are dropped,
 * so old dangling ids (never synced entities) are left alone. Rewrites or
 * adds to changes; the result is pushed like any local change.
 * @param {Record<string, object>} local - Entity states before the changes
 * @param {Array<{ key: string, before: object | null, after: object | null }>} changes - Mutated
 * @param {(key: string) => boolean} isDead - For an entity absent after the changes
 */
function dropDeadMembers(local, changes, isDead) {
  /** @type {Map<string, object | null>} */
  const final = new Map(Object.entries(local));
  for (const c of changes) final.set(c.key, c.after);
  const dead = (k) => !final.get(k) && isDead(k);
  const byKey = new Map(changes.map((c, i) => [c.key, i]));
  for (const [k, s] of final) {
    const fields = s && MEMBER_TARGET[s.type];
    if (!fields) continue;
    let body = null;
    for (const [field, targetType] of Object.entries(fields)) {
      const ids = s.body[field];
      if (!Array.isArray(ids)) continue;
      const kept = ids.filter((id) => !dead(entityKey(targetType, id)));
      if (kept.length === ids.length) continue;
      body = body || { ...s.body };
      body[field] = kept;
    }
    if (!body) continue;
    const after = { ...s, body };
    if (byKey.has(k)) changes[byKey.get(k)].after = after;
    else changes.push({ key: k, before: local[k] ?? null, after });
  }
}

/**
 * The value at a conflict path in an entity state (undefined if absent).
 * @param {object | null} state
 * @param {string[]} path
 */
function valueAt(state, path) {
  if (!state) return undefined;
  if (path[0] === '@parent') return { parentType: state.parentType, parentId: state.parentId };
  let v = state.body;
  for (const seg of path) {
    if (v === null || v === undefined) return undefined;
    if (isItemSegment(seg)) {
      const id = seg.slice(1, -1);
      v = Array.isArray(v) ? v.find((x) => x && x.id === id) : undefined;
    } else {
      v = typeof v === 'object' ? v[seg] : undefined;
    }
  }
  return norm(v);
}

/**
 * Conflicts of an entity after a new merge: the new ones, plus earlier
 * unresolved ones that still differ (mine kept vs their latest value), so a
 * later pull that does not touch a conflicted field cannot drop the conflict
 * and let mine be pushed over theirs.
 * @param {FieldConflict[]} previous - Stored, unresolved
 * @param {FieldConflict[]} fresh - From this merge
 * @param {object} mineState - The entity as merged locally
 * @param {object} theirsState - Their latest
 * @returns {FieldConflict[]}
 */
function carryConflicts(previous, fresh, mineState, theirsState) {
  const out = [...fresh];
  const seen = new Set(fresh.map((c) => JSON.stringify(c.path)));
  for (const c of previous) {
    const id = JSON.stringify(c.path);
    if (seen.has(id)) continue;
    const mine = valueAt(mineState, c.path);
    const theirs = valueAt(theirsState, c.path);
    if (!same(mine, theirs)) {
      out.push({ path: c.path, base: c.base, mine, theirs });
      seen.add(id);
    }
  }
  return out;
}

module.exports = { mergeValue, mergeEntity, mergeProject, dropDeadMembers, mergeIdSet, sameState, sameContent, valueAt, carryConflicts };
