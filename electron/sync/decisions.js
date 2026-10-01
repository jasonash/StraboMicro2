/**
 * Sync decisions (main process): what the user settles after a pull
 * (collaboration spec v3 16x to 16aa)
 *
 *   listDecisions    the items for the "Sync needs your decision" dialog:
 *                    field conflicts, delete-vs-edit questions, changes the
 *                    server turned down
 *   prepareDecision  what the app must apply to its store for one answer
 *                    (entity changes in the app's form, as a pull returns
 *                    them). Nothing is written.
 *   commitDecision   after the app applied them and saved project.json:
 *                    point count files, then the sync state (entry removed,
 *                    restore queued, files to download)
 *
 * After a pull the base holds the server's states, so "theirs" is always
 * read from the base: taking theirs copies it into the project, keeping
 * mine leaves the project as it is and the next push sends it.
 */

const fs = require('fs');
const crypto = require('crypto');
const { explode, entityKey, DEPTH, diffProjects, applyEntityChanges } = require('../shared/entityModel.mjs');
const { toAppProject } = require('../projectSerializer');
const sidecar = require('./sidecar');
const { valueAt, sameContent } = require('./merge');
const { readProjectFiles } = require('./syncEngine');
const { writePointCounts, downloadTarget } = require('./pull');

const isItemSegment = (s) => typeof s === 'string' && s.startsWith('[') && s.endsWith(']');
const jsonCopy = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

/** An entity state without the base's version. */
function stripVersion(s) {
  if (!s) return s;
  const { version, ...rest } = s;
  return rest;
}

/** Parent and nesting micrograph keys of an entity state. */
function upKeys(s) {
  const out = [];
  if (s.parentType) out.push(entityKey(s.parentType, s.parentId));
  if (s.type === 'micrograph' && typeof s.body.parentID === 'string' && s.body.parentID) {
    out.push(entityKey('micrograph', s.body.parentID));
  }
  return out;
}

/** Keys of an entity and everything beneath it in a set of states, parents first. */
function subtreeOf(rootKey, states) {
  /** @type {Map<string, string[]>} */
  const below = new Map();
  for (const [k, s] of Object.entries(states)) {
    if (!s) continue;
    for (const up of upKeys(s)) {
      if (!below.has(up)) below.set(up, []);
      below.get(up).push(k);
    }
  }
  const out = [];
  const seen = new Set();
  const queue = [rootKey];
  while (queue.length > 0) {
    const k = queue.shift();
    if (seen.has(k) || !states[k]) continue;
    seen.add(k);
    out.push(k);
    queue.push(...(below.get(k) || []));
  }
  return out;
}

/**
 * Set the value at a conflict path (the counterpart of merge.valueAt);
 * undefined removes it. Mutates the state.
 * @param {object} state
 * @param {string[]} p
 * @param {unknown} value
 */
function setValueAt(state, p, value) {
  if (p[0] === '@parent') {
    state.parentType = value && typeof value === 'object' ? value.parentType ?? null : null;
    state.parentId = value && typeof value === 'object' ? value.parentId ?? null : null;
    return;
  }
  /** @type {any} */
  let container = state.body;
  for (let i = 0; i < p.length; i++) {
    const seg = p[i];
    const last = i === p.length - 1;
    if (isItemSegment(seg)) {
      const id = seg.slice(1, -1);
      if (!Array.isArray(container)) return;
      const at = container.findIndex((x) => x && x.id === id);
      if (last) {
        if (value === undefined || value === null) {
          if (at !== -1) container.splice(at, 1);
        } else if (at !== -1) {
          container[at] = jsonCopy(value);
        } else {
          container.push(jsonCopy(value));
        }
        return;
      }
      if (at === -1) {
        if (value === undefined) return;
        container.push({ id });
        container = container[container.length - 1];
      } else {
        container = container[at];
      }
      continue;
    }
    if (container === null || typeof container !== 'object' || Array.isArray(container)) return;
    if (last) {
      if (value === undefined || value === null) delete container[seg];
      else container[seg] = jsonCopy(value);
      return;
    }
    if (container[seg] === null || typeof container[seg] !== 'object') {
      if (value === undefined) return;
      container[seg] = isItemSegment(p[i + 1]) ? [] : {};
    }
    container = container[seg];
  }
}

/** Name of an entity state for display (empty when it has none). */
function nameOf(s) {
  if (!s) return '';
  const b = s.body || {};
  const n = b.name ?? b.label;
  return typeof n === 'string' ? n : '';
}

/**
 * How the dialog names an entity: its type and name, and where it is.
 * @param {string} key
 * @param {(k: string) => object | null} lookup - local state, else the base
 */
function describe(key, lookup) {
  const s = lookup(key);
  const type = s ? s.type : key.slice(0, key.indexOf(':'));
  const out = { key, type, name: nameOf(s), parentType: null, parentName: '' };
  if (s && s.parentType && s.parentType !== 'project') {
    out.parentType = s.parentType;
    out.parentName = nameOf(lookup(entityKey(s.parentType, s.parentId)));
  }
  return out;
}

/** A conflict value for display: a parent becomes its type and name. */
function displayValue(p, value, lookup) {
  if (p[0] !== '@parent' || !value || typeof value !== 'object') return value;
  const pt = value.parentType;
  const pid = value.parentId;
  if (!pt) return { parentType: null, parentId: null, name: '' };
  return { parentType: pt, parentId: pid, name: nameOf(lookup(entityKey(pt, pid))) };
}

async function loadAll(folder) {
  const state = await sidecar.loadState(folder);
  if (!state) throw new Error('This project is not synced');
  const files = await readProjectFiles(folder);
  if (files.project.id !== state.binding.straboId) throw new Error('project.json does not belong to this sync binding');
  const current = explode(files.project, files.pointCounts);
  const lookup = (k) => current.entities[k] || state.base[k] || null;
  return { state, project: files.project, current, lookup };
}

/**
 * Everything waiting for the user, for the dialog.
 * @param {string} folder
 */
async function listDecisions(folder) {
  const { state, current, lookup } = await loadAll(folder);

  const conflicts = [];
  for (const [key, fields] of Object.entries(state.conflicts || {})) {
    const local = current.entities[key] || null;
    const theirs = state.base[key] || null;
    conflicts.push({
      ...describe(key, lookup),
      fields: fields.map((f) => ({
        id: JSON.stringify(f.path),
        path: f.path,
        mine: displayValue(f.path, valueAt(local, f.path), lookup),
        theirs: displayValue(f.path, valueAt(theirs, f.path), lookup),
      })),
    });
  }

  const questions = (state.questions || []).map((q) => {
    /** @type {Record<string, number>} */
    const contains = {};
    for (const k of q.keys) {
      if (k === q.key) continue;
      const type = k.slice(0, k.indexOf(':'));
      contains[type] = (contains[type] || 0) + 1;
    }
    return {
      ...describe(q.key, lookup),
      kind: q.kind,
      contains,
      localChanges: q.localChanges || 0,
      theirChanges: q.theirChanges || 0,
    };
  });

  const refused = (state.refused || []).filter((p) => p && p.change).map((p) => {
    const key = p.key || `${p.change.type}:${p.change.id}`;
    return {
      ...describe(key, lookup),
      op: p.change.op,
      status: p.result ? p.result.status : 'invalid',
      reason: p.result && typeof p.result.reason === 'string' ? p.result.reason : '',
      message: p.result && typeof p.result.message === 'string' ? p.result.message : '',
    };
  });

  return { conflicts, questions, refused };
}

/** Server files of entities brought back whose local copy is missing: queued for download. */
function queueDownloads(state, folder, keys) {
  state.downloads = state.downloads || {};
  for (const key of keys) {
    const prefix = `${key}|`;
    const sep = key.indexOf(':');
    for (const [rk, sha] of Object.entries(state.refs || {})) {
      if (!rk.startsWith(prefix)) continue;
      const target = downloadTarget(folder, key.slice(0, sep), key.slice(sep + 1), rk.slice(prefix.length));
      if (target && !fs.existsSync(target)) state.downloads[rk] = sha;
    }
  }
}

/**
 * @typedef {{ kind: 'conflict', key: string, choices: Record<string, 'mine' | 'theirs'> }
 *   | { kind: 'question', key: string, answer: 'restore' | 'delete' | 'keep_deleted' | 'bring_back' }
 *   | { kind: 'refused', key: string, answer: 'discard' }} Decision
 */

/**
 * Work out one answer. Throws when the item no longer exists (a pull
 * replaced it) or the answer does not fit it.
 * @param {string} folder
 * @param {Decision} decision
 * @returns {Promise<{ id: string, storeChanges: object[], undoable: boolean, pending: object }>}
 */
async function prepareDecision(folder, decision) {
  const { state, project, current } = await loadAll(folder);
  const key = decision && typeof decision.key === 'string' ? decision.key : '';
  /** Entity changes (states) the project takes */
  const changes = [];
  /** @type {object} */
  const pending = { id: crypto.randomUUID(), decision, downloadKeys: [] };

  if (decision.kind === 'conflict') {
    const fields = (state.conflicts || {})[key];
    if (!fields) throw new Error('This conflict was already settled');
    const local = current.entities[key];
    if (!local) throw new Error('The item with this conflict is gone');
    const choices = decision.choices && typeof decision.choices === 'object' ? decision.choices : {};
    const after = jsonCopy(local);
    let decided = 0;
    for (const f of fields) {
      const choice = choices[JSON.stringify(f.path)];
      if (choice !== 'mine' && choice !== 'theirs') continue;
      decided++;
      if (choice === 'theirs') setValueAt(after, f.path, jsonCopy(valueAt(state.base[key] || null, f.path)));
    }
    if (decided === 0) throw new Error('No field was decided');
    if (!sameContent(local, after)) changes.push({ key, before: local, after });
  } else if (decision.kind === 'question') {
    const q = (state.questions || []).find((x) => x.key === key);
    if (!q) throw new Error('This question was already answered');
    const fits = q.kind === 'theirs_deleted' ? ['restore', 'delete'] : ['keep_deleted', 'bring_back'];
    if (!fits.includes(decision.answer)) throw new Error(`"${decision.answer}" does not answer this question`);
    if (decision.answer === 'delete') {
      for (const k of q.keys) if (current.entities[k]) changes.push({ key: k, before: current.entities[k], after: null });
    } else if (decision.answer === 'bring_back') {
      for (const k of q.keys) {
        if (current.entities[k] || !state.base[k]) continue;
        changes.push({ key: k, before: null, after: stripVersion(state.base[k]) });
        pending.downloadKeys.push(k);
      }
    }
  } else if (decision.kind === 'refused') {
    if (!(state.refused || []).some((p) => p && (p.key || `${p.change.type}:${p.change.id}`) === key)) {
      throw new Error('This change was already dealt with');
    }
    const local = current.entities[key] || null;
    const was = state.base[key] || null;
    if (local && was) {
      // Back to the server's version; children stay where they are
      const after = { ...stripVersion(was) };
      if (local.childOrder) after.childOrder = local.childOrder;
      else delete after.childOrder;
      if (!sameContent(local, after)) changes.push({ key, before: local, after });
    } else if (local) {
      // New here and turned down: removed with everything beneath it
      for (const k of subtreeOf(key, current.entities)) changes.push({ key: k, before: current.entities[k], after: null });
    } else if (was) {
      // Deleted here and turned down: back with what was deleted with it
      const missing = Object.fromEntries(Object.entries(state.base).filter(([k]) => !current.entities[k]));
      for (const k of subtreeOf(key, missing)) {
        changes.push({ key: k, before: null, after: stripVersion(state.base[k]) });
        pending.downloadKeys.push(k);
      }
    }
  } else {
    throw new Error('Unknown kind of decision');
  }

  const depth = (c) => DEPTH[(c.after ?? c.before).type];
  changes.sort((x, y) => depth(x) - depth(y));
  const projectChanges = changes.filter((c) => (c.after ?? c.before).type !== 'point_count');
  pending.pointCountChanges = changes.filter((c) => (c.after ?? c.before).type === 'point_count');
  let storeChanges = [];
  if (projectChanges.length > 0) {
    const next = JSON.parse(JSON.stringify(project));
    applyEntityChanges(next, projectChanges, 'redo');
    storeChanges = diffProjects(toAppProject(project), toAppProject(next));
  }
  return { id: pending.id, storeChanges, undoable: decision.kind === 'conflict', pending };
}

/**
 * Record an answer, after the app applied its changes and saved project.json.
 * @param {string} folder
 * @param {object} pending - From prepareDecision
 * @returns {Promise<{ downloads: number }>}
 */
async function commitDecision(folder, pending) {
  await writePointCounts(folder, pending.pointCountChanges || []);
  const state = await sidecar.loadState(folder);
  if (!state) throw new Error('This project is not synced');
  const { decision } = pending;
  const key = decision.key;

  if (decision.kind === 'conflict') {
    const fields = (state.conflicts || {})[key] || [];
    const left = fields.filter((f) => {
      const c = decision.choices[JSON.stringify(f.path)];
      return c !== 'mine' && c !== 'theirs';
    });
    state.conflicts = { ...(state.conflicts || {}) };
    if (left.length > 0) state.conflicts[key] = left;
    else delete state.conflicts[key];
  } else if (decision.kind === 'question') {
    const q = (state.questions || []).find((x) => x.key === key);
    state.questions = (state.questions || []).filter((x) => x.key !== key);
    if (q && decision.answer === 'restore') {
      state.restores = [...(state.restores || []).filter((r) => r.key !== key), { key, keys: q.keys, sent: false }];
    }
  } else if (decision.kind === 'refused') {
    state.refused = (state.refused || []).filter((p) => p && (p.key || `${p.change.type}:${p.change.id}`) !== key);
  }

  // Turned-down changes whose entity changed with this answer are sent again
  const files = await readProjectFiles(folder);
  state.refused = sidecar.stillRefused(state, explode(files.project, files.pointCounts));
  if (pending.downloadKeys.length > 0) queueDownloads(state, folder, pending.downloadKeys);
  await sidecar.saveState(folder, state);
  return { downloads: Object.keys(state.downloads || {}).length };
}

module.exports = { listDecisions, prepareDecision, commitDecision, setValueAt, subtreeOf };
