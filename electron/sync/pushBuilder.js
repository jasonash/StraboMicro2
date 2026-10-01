/**
 * Push builder: local changes as server push operations
 *
 * Compares the current project (exploded into entity states) with the base
 * (entity states as the server last confirmed them) and produces the
 * changes for POST projects/{pid}/push (phase 0 design §4.2), then folds the
 * server's answers back into the base.
 *
 * Order inside a push: creates (parents first, as explode orders them),
 * versioned updates (field changes and moves, one op per entity), deletes
 * (only the topmost deleted entity; the server cascades to its children and
 * nested micrographs), then child order (separate, unversioned ops, so
 * ordering never conflicts and new children already exist when it applies).
 *
 * Field changes are dotted paths into the body; a value replaces the whole
 * value at its path (lists are atomic) and null removes the key, so a null
 * and a missing key count as the same here.
 */

const { deepEqual } = require('../shared/deepEqual.mjs');
const { CHILD_KEYS } = require('../shared/entityModel.mjs');

const MAX_CHANGES = 500;
const MAX_BYTES = 5 * 1024 * 1024 - 64 * 1024; // the server's 5 MB, with room for the envelope

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}
function isNullish(v) {
  return v === null || v === undefined;
}

/**
 * Field changes from one body to another: { 'a.b': value | null }.
 * @param {object} base
 * @param {object} cur
 * @returns {Record<string, unknown>}
 */
function fieldChanges(base, cur) {
  /** @type {Record<string, unknown>} */
  const out = {};
  const walk = (b, c, prefix) => {
    for (const k of new Set([...Object.keys(b), ...Object.keys(c)])) {
      const bv = b[k];
      const cv = c[k];
      if (isNullish(bv) && isNullish(cv)) continue;
      const canDescend = isPlainObject(bv) && isPlainObject(cv) && !k.includes('.') &&
        ![...Object.keys(bv), ...Object.keys(cv)].some((x) => x.includes('.'));
      if (canDescend) {
        walk(bv, cv, `${prefix}${k}.`);
      } else if (!deepEqual(bv, cv)) {
        out[`${prefix}${k}`] = cv === undefined ? null : cv;
      }
    }
  };
  walk(base, cur, '');
  return out;
}

/**
 * A body with field changes applied (the server's rule: null removes).
 * @param {object} body
 * @param {Record<string, unknown>} fields
 */
function applyFields(body, fields) {
  const out = JSON.parse(JSON.stringify(body));
  for (const [p, value] of Object.entries(fields)) {
    const parts = p.split('.');
    let obj = out;
    for (const part of parts.slice(0, -1)) {
      if (!isPlainObject(obj[part])) obj[part] = {};
      obj = obj[part];
    }
    const last = parts[parts.length - 1];
    if (value === null) delete obj[last];
    else obj[last] = JSON.parse(JSON.stringify(value));
  }
  return out;
}

/**
 * @typedef {Object} PlannedChange
 * @property {object} change - What goes to the server
 * @property {string} key - 'type:id'
 * @property {'create' | 'update' | 'delete' | 'order'} kind
 * @property {object} [target] - Entity state the base takes when accepted
 * @property {string[]} [cascade] - Keys removed from the base with an accepted delete
 */

/**
 * Plan the push from base to current.
 * @param {Record<string, object>} base - 'type:id' => state + version
 * @param {{ entities: Record<string, object>, order: string[] }} current - explode() of the project
 * @param {{ skip?: Set<string> }} [options] - keys to hold back (e.g. micrographs whose image is not uploaded yet)
 * @returns {PlannedChange[]}
 */
function planPush(base, current, { skip = new Set() } = {}) {
  const creates = [];
  const updates = [];
  const deletes = [];
  const orders = [];

  const skipped = new Set(skip);
  for (const key of current.order) {
    const cur = current.entities[key];
    if (base[key]) continue;
    // Creates under a held-back create are held back too
    const parentKey = cur.parentType ? `${cur.parentType}:${cur.parentId}` : null;
    const nestKey = cur.type === 'micrograph' && cur.body.parentID ? `micrograph:${cur.body.parentID}` : null;
    if (skipped.has(key) || (parentKey && skipped.has(parentKey)) || (nestKey && skipped.has(nestKey))) {
      skipped.add(key);
      continue;
    }
    const change = { op: 'create', type: cur.type, id: cur.id, body: cur.body };
    if (cur.parentType) {
      change.parentType = cur.parentType;
      change.parentId = cur.parentId;
    }
    if (cur.childOrder) change.childOrder = cur.childOrder;
    creates.push({ change, key, kind: 'create', target: { ...cur } });
  }

  for (const key of current.order) {
    const cur = current.entities[key];
    const was = base[key];
    if (!was || skipped.has(key)) continue;
    const fields = fieldChanges(was.body, cur.body);
    const moved = was.parentType !== cur.parentType || was.parentId !== cur.parentId;
    if (Object.keys(fields).length > 0 || moved) {
      const change = { op: 'update', type: cur.type, id: cur.id, baseVersion: was.version };
      if (Object.keys(fields).length > 0) change.fields = fields;
      if (moved) {
        change.parentType = cur.parentType;
        change.parentId = cur.parentId;
      }
      updates.push({
        change, key, kind: 'update',
        target: { ...was, parentType: cur.parentType, parentId: cur.parentId, body: applyFields(was.body, fields) },
      });
    }
    if (cur.childOrder && !deepEqual(cur.childOrder, was.childOrder ?? {})) {
      // The base records only children that exist on the server, so the
      // order is sent again once held-back children are created
      /** @type {Record<string, string[]>} */
      const sentOrder = {};
      for (const [k, ids] of Object.entries(cur.childOrder)) {
        sentOrder[k] = ids.filter((id) => !skipped.has(`${CHILD_KEYS[cur.type][k]}:${id}`));
      }
      orders.push({
        change: { op: 'update', type: cur.type, id: cur.id, childOrder: cur.childOrder },
        key, kind: 'order', target: { childOrder: sentOrder },
      });
    }
  }

  // Deletes: only entities whose parent (and nesting micrograph) stay
  const gone = Object.keys(base).filter((k) => !current.entities[k]);
  const goneSet = new Set(gone);
  const rootOf = (k) => {
    let r = k;
    for (let guard = 0; guard < 1000; guard++) {
      const e = base[r];
      const parent = e.parentType ? `${e.parentType}:${e.parentId}` : null;
      const nest = e.type === 'micrograph' && e.body.parentID ? `micrograph:${e.body.parentID}` : null;
      const up = (parent && goneSet.has(parent)) ? parent : (nest && goneSet.has(nest)) ? nest : null;
      if (!up) return r;
      r = up;
    }
    return r;
  };
  /** @type {Map<string, string[]>} */
  const byRoot = new Map();
  for (const k of gone) {
    const r = rootOf(k);
    if (!byRoot.has(r)) byRoot.set(r, []);
    if (k !== r) byRoot.get(r).push(k);
  }
  for (const [root, cascade] of byRoot) {
    const e = base[root];
    deletes.push({ change: { op: 'delete', type: e.type, id: e.id, baseVersion: e.version }, key: root, kind: 'delete', cascade });
  }

  return [...creates, ...updates, ...deletes, ...orders];
}

/**
 * Split planned changes into pushes within the server's limits (500
 * changes, 5 MB), keeping their order.
 * @param {PlannedChange[]} planned
 * @returns {PlannedChange[][]}
 */
function batchPush(planned) {
  const batches = [];
  let batch = [];
  let bytes = 0;
  for (const p of planned) {
    const size = Buffer.byteLength(JSON.stringify(p.change));
    if (batch.length > 0 && (batch.length >= MAX_CHANGES || bytes + size > MAX_BYTES)) {
      batches.push(batch);
      batch = [];
      bytes = 0;
    }
    batch.push(p);
    bytes += size;
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
}

/**
 * Fold a push's results into the base. Accepted changes update it; the rest
 * are returned for the merge / conflict handling.
 * @param {Record<string, object>} base - Mutated
 * @param {PlannedChange[]} sent
 * @param {object[]} results - The server's results, one per change, in order
 * @returns {{ accepted: number, problems: Array<{ planned: PlannedChange, result: object }> }}
 */
function applyPushResults(base, sent, results) {
  let accepted = 0;
  const problems = [];
  sent.forEach((planned, i) => {
    const result = results[i];
    if (!result || result.type !== planned.change.type || result.id !== planned.change.id) {
      problems.push({ planned, result: result ?? { status: 'missing' } });
      return;
    }
    if (result.status !== 'accepted') {
      problems.push({ planned, result });
      return;
    }
    accepted++;
    if (planned.kind === 'create') {
      base[planned.key] = { ...planned.target, version: result.version };
    } else if (planned.kind === 'update') {
      base[planned.key] = { ...planned.target, childOrder: base[planned.key]?.childOrder ?? planned.target.childOrder, version: result.version };
    } else if (planned.kind === 'order') {
      if (base[planned.key]) base[planned.key] = { ...base[planned.key], childOrder: planned.target.childOrder };
    } else if (planned.kind === 'delete') {
      delete base[planned.key];
      for (const k of planned.cascade ?? []) delete base[k];
    }
  });
  return { accepted, problems };
}

module.exports = { fieldChanges, applyFields, planPush, batchPush, applyPushResults, MAX_CHANGES, MAX_BYTES };
