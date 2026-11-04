/**
 * Sync test tools (main process, dev and -dev. builds only): the Debug menu's
 * "Sync Test" scenarios run in one window.
 *
 *   otherComputerPush  pushes changes to the server as another computer of
 *                      the same account (its own client id), with versions
 *                      read from the server, so a scenario can make "their"
 *                      change without a second copy of the app
 *   compareWithServer  the saved project vs the server, entity by entity, to
 *                      catch copies that silently disagree
 */

const crypto = require('crypto');
const { explode, entityKey } = require('../shared/entityModel.mjs');
const { deepEqual } = require('../shared/deepEqual.mjs');
const sidecar = require('./sidecar');
const { sameContent } = require('./merge');
const { readProjectFiles } = require('./syncEngine');

const OTHER_CLIENT_ID = 'sync-test-other-computer';

/** The server's live entities by key. */
async function serverEntities(client, pid) {
  const snap = await client.snapshot(pid);
  /** @type {Map<string, object>} */
  const out = new Map();
  for (const e of snap.entities || []) out.set(entityKey(e.type, e.id), e);
  return out;
}

/** Keys of everything beneath an entity (structural and nested micrographs). */
function descendantKeys(rootKey, entities) {
  /** @type {Map<string, string[]>} */
  const below = new Map();
  for (const [k, e] of entities) {
    const ups = [];
    if (e.parentType) ups.push(entityKey(e.parentType, e.parentId));
    if (e.type === 'micrograph' && e.body && typeof e.body.parentID === 'string' && e.body.parentID) {
      ups.push(entityKey('micrograph', e.body.parentID));
    }
    for (const u of ups) {
      if (!below.has(u)) below.set(u, []);
      below.get(u).push(k);
    }
  }
  const out = [];
  const seen = new Set([rootKey]);
  const queue = [...(below.get(rootKey) || [])];
  while (queue.length > 0) {
    const k = queue.shift();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
    queue.push(...(below.get(k) || []));
  }
  return out;
}

/**
 * Push changes as another computer. Each change names op, type, id and
 * fields (update) or nothing more (delete); versions come from the server.
 * @param {{ folder: string, client: object, changes: object[] }} options
 * @returns {Promise<object[]>} the server's results
 */
async function otherComputerPush({ folder, client, changes }) {
  const state = await sidecar.loadState(folder);
  if (!state) throw new Error('This project is not synced');
  const pid = state.binding.pid;
  const live = await serverEntities(client, pid);
  const out = [];
  for (const c of changes) {
    const key = entityKey(c.type, c.id);
    const e = live.get(key);
    if (!e) throw new Error(`The server has no ${key}`);
    const change = { ...c, baseVersion: e.version };
    if (c.op === 'delete') {
      change.cascadeVersions = {};
      for (const k of descendantKeys(key, live)) change.cascadeVersions[k] = live.get(k).version;
    }
    out.push(change);
  }
  const res = await client.push(pid, crypto.randomUUID(), OTHER_CLIENT_ID, out);
  return res.results || [];
}

/** Name of an entity for the report. */
function nameOf(e) {
  const b = (e && e.body) || {};
  const n = b.name ?? b.label;
  return typeof n === 'string' && n ? `'${n}'` : '(unnamed)';
}

/**
 * The saved project vs the server.
 * @param {{ folder: string, client: object }} options
 * @returns {Promise<{ same: number, differences: string[], held: number }>}
 */
async function compareWithServer({ folder, client }) {
  const state = await sidecar.loadState(folder);
  if (!state) throw new Error('This project is not synced');
  const live = await serverEntities(client, state.binding.pid);
  const { project, pointCounts } = await readProjectFiles(folder);
  const local = explode(project, pointCounts).entities;
  const differences = [];
  let same = 0;
  for (const [k, l] of Object.entries(local)) {
    const s = live.get(k);
    if (!s) {
      differences.push(`Only on this computer: ${l.type} ${nameOf(l)}`);
      continue;
    }
    const server = { type: s.type, id: s.id, parentType: s.parentType ?? null, parentId: s.parentId ?? null, body: s.body || {} };
    if (!sameContent(l, server)) {
      const fields = [...new Set([...Object.keys(l.body), ...Object.keys(server.body)])]
        .filter((f) => !deepEqual(l.body[f] ?? null, server.body[f] ?? null));
      const moved = l.parentId !== server.parentId ? ' (location)' : '';
      differences.push(`Different: ${l.type} ${nameOf(l)}${moved}${fields.length ? `: ${fields.join(', ')}` : ''}`);
    } else {
      same++;
    }
  }
  for (const [k, s] of live) {
    if (!local[k]) differences.push(`Only on the server: ${s.type} ${nameOf(s)}`);
  }
  return { same, differences, held: sidecar.heldKeys(state).size + (state.refused || []).length };
}

module.exports = { otherComputerPush, compareWithServer, OTHER_CLIENT_ID };
