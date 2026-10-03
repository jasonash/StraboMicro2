/**
 * Entity model for sync: project.json <-> entity states
 *
 * Sync works on entities (project, dataset, sample, micrograph, spot, tag,
 * group, preset, point count), each stored on the server as
 * { parentType, parentId, body, childOrder }. A body is the entity's JSON
 * minus its child collections; children are separate entities that point at
 * their parent, and the parent keeps their order.
 *
 * explode() turns a project (plus its point count sessions) into that map;
 * assemble() builds the project back. Both follow the server exactly
 * (StraboBackend microsync/lib/MsModel.php, MsConvert::normalize and
 * ::decompose, MsWorker::assemble), so the client's base snapshot, diff and
 * pushes agree with what the server stores. Per-user fields (tree expansion,
 * preset key bindings, grain analysis selection) never enter an entity;
 * assemble() takes them from the local project instead.
 *
 * Single source for both processes (see deepEqual.mjs for how each loads it).
 */

import { deepEqual } from './deepEqual.mjs';

/** Entity type => type of its structural parent (null: none). */
export const PARENT = Object.freeze({
  project: null,
  dataset: 'project',
  sample: 'dataset',
  micrograph: 'sample',
  spot: 'micrograph',
  tag: 'project',
  group: 'project',
  preset: 'project',
  point_count: 'micrograph', // point-counts/<id>.json, not project.json
});

/**
 * Entity type => child collection key => child entity type. These keys hold
 * separate entities and never appear in a body. Id lists with the same names
 * on other types (group.micrographs, micrograph.tags) are ordinary fields.
 * Key order matters: it is the server's order.
 */
export const CHILD_KEYS = Object.freeze({
  project: Object.freeze({ datasets: 'dataset', tags: 'tag', groups: 'group', presets: 'preset' }),
  dataset: Object.freeze({ samples: 'sample' }),
  sample: Object.freeze({ micrographs: 'micrograph' }),
  micrograph: Object.freeze({ spots: 'spot' }),
  spot: Object.freeze({}),
  tag: Object.freeze({}),
  group: Object.freeze({}),
  preset: Object.freeze({}),
  point_count: Object.freeze({}),
});

const PROJECT_PER_USER = Object.freeze(['presetKeyBindings', 'grainAnalysisSpotFilter', 'grainAnalysisSelectedSpotIds']);
const ENTITY_PER_USER = Object.freeze(['isExpanded', 'isSpotExpanded']);

/** Per-user fields of a type: stay in the local project.json, never synced. */
export function perUserFields(type) {
  return type === 'project' ? PROJECT_PER_USER : ENTITY_PER_USER;
}

/** Entity map key, e.g. 'micrograph:<id>'. */
export function entityKey(type, id) {
  return `${type}:${id}`;
}

/** A usable entity id (server rule: non-empty, at most 200 chars, no control characters). */
export function isEntityId(id) {
  // eslint-disable-next-line no-control-regex
  return typeof id === 'string' && id !== '' && id.length <= 200 && !/[\x00-\x1f\x7f]/.test(id);
}

/** Why a project cannot be turned into entities (the server stops on the same cases). */
export class ExplodeError extends Error {
  /**
   * @param {'bad_json' | 'bad_id' | 'duplicate_differs'} reason
   * @param {string} message
   * @param {object} [details]
   */
  constructor(reason, message, details = {}) {
    super(message);
    this.name = 'ExplodeError';
    this.reason = reason;
    this.details = details;
  }
}

/** JSON copy: drops undefined values and functions the way saving to disk does. */
function jsonCopy(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Normalized copy of a project: per-user fields removed, every child
 * collection a list (missing or null becomes []), identical duplicates of
 * an entity under the same parent collapsed. Throws ExplodeError where the
 * server's converter stops.
 * @param {object} project
 * @returns {{ project: object, duplicatesCollapsed: number }}
 */
export function normalizeProject(project) {
  if (project === null || typeof project !== 'object' || Array.isArray(project) || !isEntityId(project.id)) {
    throw new ExplodeError('bad_id', 'the project has no usable id');
  }
  const root = jsonCopy(project);
  /** @type {Map<string, { parent: string, obj: object }>} */
  const seen = new Map();
  let duplicatesCollapsed = 0;

  const walk = (obj, type) => {
    for (const f of perUserFields(type)) delete obj[f];
    const me = entityKey(type, obj.id);
    for (const [key, childType] of Object.entries(CHILD_KEYS[type])) {
      const value = obj[key];
      if (!Array.isArray(value)) {
        if (value !== undefined && value !== null) {
          throw new ExplodeError('bad_json', `"${key}" of ${type} ${obj.id} is not a list`);
        }
        obj[key] = [];
        continue;
      }
      const list = [];
      for (const child of value) {
        if (child === null || typeof child !== 'object' || Array.isArray(child) || !isEntityId(child.id)) {
          throw new ExplodeError('bad_id', `a ${childType} under ${type} ${obj.id} has no usable id`);
        }
        const k = entityKey(childType, child.id);
        const prior = seen.get(k);
        if (prior) {
          if (prior.parent === me && deepEqual(prior.obj, child)) {
            duplicatesCollapsed++;
            continue;
          }
          throw new ExplodeError('duplicate_differs', `${childType} ${child.id} appears twice with different content`,
            { first: prior.parent, second: me });
        }
        seen.set(k, { parent: me, obj: jsonCopy(child) });
        walk(child, childType);
        list.push(child);
      }
      obj[key] = list;
    }
  };
  walk(root, 'project');
  return { project: root, duplicatesCollapsed };
}

/**
 * @typedef {Object} EntityState
 * @property {string} type
 * @property {string} id
 * @property {string | null} parentType
 * @property {string | null} parentId
 * @property {object} body - Entity JSON without child collections or per-user fields
 * @property {Record<string, string[]>} [childOrder] - Child ids per collection (types with children only)
 */

/**
 * Split a project into entity states.
 *
 * `order` lists entity keys in the order the server's decompose emits them,
 * which is a valid create order: parents before children, a nested
 * micrograph after the micrograph it sits on (a parentID loop is emitted
 * anyway; the server rejects it), point counts last.
 *
 * @param {object} project - The project as saved to project.json
 * @param {object[]} [pointCounts] - Point count sessions (point-counts/<id>.json)
 * @returns {{ entities: Record<string, EntityState>, order: string[], duplicatesCollapsed: number }}
 */
export function explode(project, pointCounts = []) {
  const { project: j, duplicatesCollapsed } = normalizeProject(project);
  /** @type {Record<string, EntityState>} */
  const entities = {};
  const order = [];

  const emit = (type, obj, parentType, parentId) => {
    const body = { ...obj };
    /** @type {Record<string, string[]>} */
    const childOrder = {};
    const keys = Object.keys(CHILD_KEYS[type]);
    for (const key of keys) {
      childOrder[key] = obj[key].map((c) => c.id);
      delete body[key];
    }
    const k = entityKey(type, obj.id);
    /** @type {EntityState} */
    const state = { type, id: obj.id, parentType, parentId, body };
    if (keys.length > 0) state.childOrder = childOrder;
    entities[k] = state;
    order.push(k);
  };

  emit('project', j, null, null);
  for (const [key, type] of [['tags', 'tag'], ['groups', 'group'], ['presets', 'preset']]) {
    for (const x of j[key]) emit(type, x, 'project', j.id);
  }
  for (const d of j.datasets) {
    emit('dataset', d, 'project', j.id);
    for (const s of d.samples) {
      emit('sample', s, 'dataset', d.id);
      const inSample = new Set(s.micrographs.map((m) => m.id));
      const emitMicrograph = (m) => {
        emit('micrograph', m, 'sample', s.id);
        for (const p of m.spots) emit('spot', p, 'micrograph', m.id);
      };
      let pending = s.micrographs;
      const done = new Set();
      for (let guard = 0; pending.length > 0 && guard < 10000; guard++) {
        const next = [];
        for (const m of pending) {
          const nest = typeof m.parentID === 'string' && m.parentID !== '' ? m.parentID : null;
          if (nest === null || done.has(nest) || !inSample.has(nest)) {
            emitMicrograph(m);
            done.add(m.id);
          } else {
            next.push(m);
          }
        }
        if (next.length === pending.length) {
          // A parentID loop: emit anyway, the server rejects it
          for (const m of next) emitMicrograph(m);
          break;
        }
        pending = next;
      }
    }
  }

  for (const raw of pointCounts) {
    if (raw === null || typeof raw !== 'object' || !isEntityId(raw.id)) {
      throw new ExplodeError('bad_id', 'a point count session has no usable id');
    }
    const body = jsonCopy(raw);
    for (const f of perUserFields('point_count')) delete body[f];
    const k = entityKey('point_count', body.id);
    if (entities[k]) {
      throw new ExplodeError('duplicate_differs', `point count ${body.id} appears twice`);
    }
    entities[k] = { type: 'point_count', id: body.id, parentType: 'micrograph', parentId: body.micrographId ?? null, body };
    order.push(k);
  }

  return { entities, order, duplicatesCollapsed };
}

/**
 * Child order as the server reads it: stored ids that are live children
 * (first occurrence), then live children the stored order lacks, in the
 * order given.
 * @param {string} type
 * @param {Record<string, string[]> | undefined} stored
 * @param {Record<string, string[]>} liveByType - child type => live child ids
 * @returns {Record<string, string[]>}
 */
export function normalizeChildOrder(type, stored, liveByType) {
  /** @type {Record<string, string[]>} */
  const out = {};
  for (const [key, childType] of Object.entries(CHILD_KEYS[type])) {
    const live = liveByType[childType] ?? [];
    const liveSet = new Set(live);
    const seen = new Set();
    const list = [];
    const storedList = stored?.[key];
    if (Array.isArray(storedList)) {
      for (const id of storedList) {
        if (liveSet.has(id) && !seen.has(id)) {
          list.push(id);
          seen.add(id);
        }
      }
    }
    for (const id of live) {
      if (!seen.has(id)) {
        list.push(id);
        seen.add(id);
      }
    }
    out[key] = list;
  }
  return out;
}

/**
 * Per-user fields of every entity in a project, to carry over into an
 * assembled one: key => { field: value }.
 * @param {object | null | undefined} project
 * @returns {Map<string, Record<string, unknown>>}
 */
export function collectPerUserFields(project) {
  /** @type {Map<string, Record<string, unknown>>} */
  const out = new Map();
  if (!project || typeof project !== 'object') return out;
  const visit = (obj, type) => {
    if (!obj || typeof obj !== 'object' || !isEntityId(obj.id)) return;
    /** @type {Record<string, unknown>} */
    const fields = {};
    let any = false;
    for (const f of perUserFields(type)) {
      if (obj[f] !== undefined) {
        fields[f] = obj[f];
        any = true;
      }
    }
    if (any) out.set(entityKey(type, obj.id), fields);
    for (const [key, childType] of Object.entries(CHILD_KEYS[type])) {
      if (Array.isArray(obj[key])) for (const c of obj[key]) visit(c, childType);
    }
  };
  visit(project, 'project');
  return out;
}

/**
 * Build the project back from entity states.
 *
 * Children come in the parent's child order (normalized as the server does);
 * among entities missing from that order, `order` (creation order) decides.
 * Point counts are returned separately. Per-user fields are copied from
 * `perUser` (see collectPerUserFields), so a pulled or rebuilt project keeps
 * this user's tree expansion and key bindings.
 *
 * @param {Record<string, EntityState>} entities
 * @param {string} projectId
 * @param {{ order?: string[], perUser?: Map<string, Record<string, unknown>> }} [options]
 * @returns {{ project: object, pointCounts: object[] } | null} null when the project entity is missing
 */
export function assemble(entities, projectId, { order, perUser } = {}) {
  const rootKey = entityKey('project', projectId);
  if (!entities[rootKey]) return null;

  // Live children per parent, in creation order
  let keys = Object.keys(entities);
  if (order) {
    const listed = new Set(order);
    keys = [...order.filter((k) => entities[k]), ...keys.filter((k) => !listed.has(k))];
  }
  /** @type {Map<string, Record<string, string[]>>} */
  const children = new Map();
  for (const k of keys) {
    const e = entities[k];
    if (e.parentType === null || e.parentId === null) continue;
    const pk = entityKey(e.parentType, e.parentId);
    const byType = children.get(pk) ?? {};
    (byType[e.type] ??= []).push(e.id);
    children.set(pk, byType);
  }

  const pointCounts = [];
  const build = (type, id) => {
    const k = entityKey(type, id);
    const e = entities[k];
    const obj = jsonCopy(e.body);
    const extra = perUser?.get(k);
    if (extra) Object.assign(obj, jsonCopy(extra));
    const liveByType = children.get(k) ?? {};
    const childOrder = normalizeChildOrder(type, e.childOrder, liveByType);
    for (const [key, childType] of Object.entries(CHILD_KEYS[type])) {
      obj[key] = childOrder[key].map((cid) => build(childType, cid));
    }
    if (type === 'micrograph') {
      for (const pcId of liveByType.point_count ?? []) {
        pointCounts.push(jsonCopy(entities[entityKey('point_count', pcId)].body));
      }
    }
    return obj;
  };

  return { project: build('project', projectId), pointCounts };
}

// ---------------------------------------------------------------------------
// Entity-level changes between two versions of a project (undo / redo)
// ---------------------------------------------------------------------------
//
// diffProjects() compares two projects entity by entity without copying
// them (the store treats project objects as immutable), and returns only
// the entities that differ, each as a before/after EntityState. The same
// changes applied backwards undo an edit and forwards redo it, touching
// nothing else, so edits by others (pulled changes) survive an undo.

/** Depth of a type in the tree: parents are created before children. */
/** Entity type => depth in the tree (parents before children when sorted). */
export const DEPTH = Object.freeze({
  project: 0, dataset: 1, tag: 1, group: 1, preset: 1, sample: 2, micrograph: 3, spot: 4, point_count: 4,
});

/**
 * Live view of every entity in a project (first occurrence of an id wins):
 * key => { type, id, parentType, parentId, obj, parentObj, parentKey }.
 * obj is the object inside the project, not a copy.
 */
function entityViews(project) {
  const views = new Map();
  if (!project || typeof project !== 'object' || !isEntityId(project.id)) return views;
  const visit = (obj, type, parentType, parentId, parentObj, parentKey) => {
    const k = entityKey(type, obj.id);
    if (views.has(k)) return;
    views.set(k, { type, id: obj.id, parentType, parentId, obj, parentObj, parentKey });
    for (const [key, childType] of Object.entries(CHILD_KEYS[type])) {
      const list = obj[key];
      if (!Array.isArray(list)) continue;
      for (const child of list) {
        if (child && typeof child === 'object' && !Array.isArray(child) && isEntityId(child.id)) {
          visit(child, childType, type, obj.id, obj, key);
        }
      }
    }
  };
  visit(project, 'project', null, null, null, null);
  return views;
}

/** Body keys of an object: everything except child collections and per-user fields. */
function bodyKeys(type, obj) {
  const skip = new Set([...Object.keys(CHILD_KEYS[type]), ...perUserFields(type)]);
  return Object.keys(obj).filter((k) => !skip.has(k) && obj[k] !== undefined && typeof obj[k] !== 'function');
}

/**
 * Same entity body (child collections, per-user fields and modifiedTimestamp
 * ignored: the time is bookkeeping the save stamps, never an edit of its own,
 * so undo and the role checks do not see it change).
 */
function sameBody(type, a, b) {
  const ka = bodyKeys(type, a).filter((k) => k !== 'modifiedTimestamp');
  const kb = bodyKeys(type, b).filter((k) => k !== 'modifiedTimestamp');
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!Object.prototype.hasOwnProperty.call(b, k) || !deepEqual(a[k], b[k])) return false;
  }
  return true;
}

/** Child ids of a live object, per collection. */
function childIdsOf(type, obj) {
  /** @type {Record<string, string[]>} */
  const out = {};
  for (const key of Object.keys(CHILD_KEYS[type])) {
    out[key] = Array.isArray(obj[key]) ? obj[key].filter((c) => c && isEntityId(c.id)).map((c) => c.id) : [];
  }
  return out;
}

/** EntityState (a JSON copy) of a live view. */
function stateOfView(v) {
  const body = {};
  for (const k of bodyKeys(v.type, v.obj)) body[k] = v.obj[k];
  /** @type {EntityState} */
  const state = { type: v.type, id: v.id, parentType: v.parentType, parentId: v.parentId, body: jsonCopy(body) };
  if (Object.keys(CHILD_KEYS[v.type]).length > 0) state.childOrder = childIdsOf(v.type, v.obj);
  return state;
}

/**
 * @typedef {Object} EntityChange
 * @property {string} key
 * @property {EntityState | null} before - null: the entity did not exist
 * @property {EntityState | null} after - null: the entity was removed
 */

/**
 * Entities that differ between two versions of a project (body, parent or
 * child order). Per-user fields are ignored. Order: parents before children.
 * @param {object | null} prev
 * @param {object | null} next
 * @returns {EntityChange[]}
 */
export function diffProjects(prev, next) {
  const a = entityViews(prev);
  const b = entityViews(next);
  /** @type {EntityChange[]} */
  const changes = [];
  for (const [k, va] of a) {
    const vb = b.get(k);
    if (!vb) {
      changes.push({ key: k, before: stateOfView(va), after: null });
      continue;
    }
    if (va.obj === vb.obj) continue;
    const same = va.parentType === vb.parentType && va.parentId === vb.parentId &&
      sameBody(va.type, va.obj, vb.obj) && deepEqual(childIdsOf(va.type, va.obj), childIdsOf(vb.type, vb.obj));
    if (!same) changes.push({ key: k, before: stateOfView(va), after: stateOfView(vb) });
  }
  for (const [k, vb] of b) {
    if (!a.has(k)) changes.push({ key: k, before: null, after: stateOfView(vb) });
  }
  const depthOf = (c) => DEPTH[(c.after ?? c.before).type];
  return changes.sort((x, y) => depthOf(x) - depthOf(y));
}

/**
 * Whether changes can be applied to a project in a direction: every
 * entity must still be as the changes left it (body and parent; child
 * order is not checked, so others adding or removing siblings never block),
 * and every entity to re-create must have a parent.
 * @param {object} project
 * @param {EntityChange[]} changes
 * @param {'undo' | 'redo'} direction
 * @returns {{ ok: true } | { ok: false, key: string }}
 */
export function checkEntityChanges(project, changes, direction) {
  const views = entityViews(project);
  const creating = new Set();
  for (const c of changes) {
    const expected = direction === 'undo' ? c.after : c.before;
    const target = direction === 'undo' ? c.before : c.after;
    const cur = views.get(c.key);
    if (expected === null) {
      if (cur) return { ok: false, key: c.key };
    } else {
      if (!cur || cur.parentType !== expected.parentType || cur.parentId !== expected.parentId ||
        !sameBody(expected.type, cur.obj, expected.body)) {
        return { ok: false, key: c.key };
      }
    }
    if (target !== null && expected === null) creating.add(c.key);
  }
  for (const c of changes) {
    const target = direction === 'undo' ? c.before : c.after;
    if (target === null || target.parentType === null || !creating.has(c.key)) continue;
    const pk = entityKey(target.parentType, target.parentId);
    if (!views.has(pk) && !creating.has(pk)) return { ok: false, key: c.key };
  }
  return { ok: true };
}

/**
 * Apply changes to a project in place (the caller passes a copy): undo
 * restores each entity's `before`, redo its `after`. Entities not in the
 * changes are untouched, and so are per-user fields of entities that stay.
 * Call checkEntityChanges first.
 * @param {object} project - Mutated
 * @param {EntityChange[]} changes
 * @param {'undo' | 'redo'} direction
 */
export function applyEntityChanges(project, changes, direction) {
  const targetOf = (c) => (direction === 'undo' ? c.before : c.after);
  const views = entityViews(project);
  /** @type {Map<string, object>} */
  const objs = new Map([...views].map(([k, v]) => [k, v.obj]));

  const detach = (v) => {
    const list = v.parentObj?.[v.parentKey];
    if (Array.isArray(list)) {
      const i = list.indexOf(v.obj);
      if (i !== -1) list.splice(i, 1);
    }
  };
  const attach = (obj, target) => {
    const parent = objs.get(entityKey(target.parentType, target.parentId));
    if (!parent) return;
    const key = Object.entries(CHILD_KEYS[target.parentType]).find(([, t]) => t === target.type)?.[0];
    if (!key) return;
    if (!Array.isArray(parent[key])) parent[key] = [];
    parent[key].push(obj);
  };

  // Removals: children first
  for (const c of [...changes].reverse()) {
    if (targetOf(c) !== null) continue;
    const v = views.get(c.key);
    if (v) {
      detach(v);
      objs.delete(c.key);
    }
  }
  // Updates and re-creations: parents first
  for (const c of changes) {
    const target = targetOf(c);
    if (target === null) continue;
    const v = views.get(c.key);
    if (v && objs.has(c.key)) {
      for (const k of bodyKeys(target.type, v.obj)) delete v.obj[k];
      Object.assign(v.obj, jsonCopy(target.body));
      if (v.parentType !== target.parentType || v.parentId !== target.parentId) {
        detach(v);
        attach(v.obj, target);
      }
    } else if (target.parentType !== null) {
      const obj = jsonCopy(target.body);
      for (const key of Object.keys(CHILD_KEYS[target.type])) obj[key] = [];
      objs.set(c.key, obj);
      attach(obj, target);
    }
  }
  // Child order: the target order first, then any others (added since) in their current order
  for (const c of changes) {
    const target = targetOf(c);
    if (!target?.childOrder) continue;
    const obj = objs.get(c.key);
    if (!obj) continue;
    for (const [key, ids] of Object.entries(target.childOrder)) {
      if (!Array.isArray(obj[key])) continue;
      const rank = new Map(ids.map((id, i) => [id, i]));
      const listed = obj[key].filter((x) => rank.has(x?.id)).sort((x, y) => rank.get(x.id) - rank.get(y.id));
      const others = obj[key].filter((x) => !rank.has(x?.id));
      obj[key] = [...listed, ...others];
    }
  }
}
