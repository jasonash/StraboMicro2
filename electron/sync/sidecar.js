/**
 * Sync sidecar: the sync/ folder inside a synced project copy
 *
 *   sync/state.json   binding (server, account, server project id), sync
 *                     mode, last pulled seq, the base (entity states as the
 *                     server last confirmed them, with versions), server
 *                     file refs, the push in flight, refused changes.
 *                     Always written whole (temp file + rename), so the base
 *                     and the seq can never disagree.
 *   sync/images.json  SHA-256 of local files, keyed by path relative to the
 *                     project folder, reused while size and mtime match.
 *   sync/tmp/         tile ZIPs waiting to upload.
 *
 * .smz export and version history never include sync/ (collaboration spec
 * v3 §7.2). A local-only project has no sync/ folder.
 */

const fs = require('fs');
const path = require('path');
const { writeFileAtomic } = require('../atomicFile');
const { hashFile } = require('./client');

const FORMAT_VERSION = 1;

function syncDir(projectFolder) {
  return path.join(projectFolder, 'sync');
}

/**
 * @typedef {Object} SyncState
 * @property {number} formatVersion
 * @property {{ server: string, pkey: number, email: string, pid: number, straboId: string }} binding
 * @property {'automatic' | 'manual'} mode
 * @property {'uploading' | 'ready'} phase - uploading until the first upload finished
 * @property {number} lastSeq
 * @property {Record<string, object>} base - 'type:id' => EntityState + { version }
 * @property {Record<string, string>} refs - 'type:id|role' => sha256 the server has
 * @property {{ pushId: string, changes: object[] } | null} outgoingPush
 * @property {object[]} refused - changes the server did not accept: { key, change, result, local }
 *   (local = the entity as it was when turned down, null if absent; held until it changes)
 * @property {object[]} [restores] - Restore with my changes: { key, keys, sent } (restore op
 *   for key, keys held until a pull brings the restored states into the base)
 * @property {Record<string, object[]>} [conflicts] - 'type:id' => unresolved field conflicts (pull)
 * @property {object[]} [questions] - delete-vs-edit questions waiting for the user (pull)
 * @property {Record<string, string>} [downloads] - 'type:id|role' => sha256 to fetch (pull)
 */

/**
 * A fresh state for a project that is being turned on.
 * @returns {SyncState}
 */
function newState(binding, mode) {
  return {
    formatVersion: FORMAT_VERSION,
    binding,
    mode,
    phase: 'uploading',
    lastSeq: 0,
    base: {},
    refs: {},
    outgoingPush: null,
    refused: [],
  };
}

/**
 * @param {string} projectFolder
 * @returns {Promise<SyncState | null>} null for a local-only project
 */
async function loadState(projectFolder) {
  try {
    const state = JSON.parse(await fs.promises.readFile(path.join(syncDir(projectFolder), 'state.json'), 'utf8'));
    if (!state || state.formatVersion !== FORMAT_VERSION) {
      throw new Error(`Unsupported sync state format ${state && state.formatVersion}`);
    }
    return state;
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/** @param {string} projectFolder @param {SyncState} state */
async function saveState(projectFolder, state) {
  await fs.promises.mkdir(syncDir(projectFolder), { recursive: true });
  await writeFileAtomic(path.join(syncDir(projectFolder), 'state.json'), JSON.stringify(state));
}

/**
 * SHA-256 of files in a project folder, cached in sync/images.json while a
 * file's size and modification time are unchanged (hashing is lazy: it
 * happens at first sync, never at import; spec v3 §7.2).
 */
async function createHashIndex(projectFolder) {
  const indexPath = path.join(syncDir(projectFolder), 'images.json');
  /** @type {Record<string, { size: number, mtimeMs: number, sha256: string }>} */
  let index = {};
  try {
    index = JSON.parse(await fs.promises.readFile(indexPath, 'utf8'));
  } catch (_) { /* first use */ }
  let dirty = false;
  return {
    /** @param {string} relPath - e.g. 'images/<micrographId>' */
    async hash(relPath) {
      const full = path.join(projectFolder, relPath);
      const st = await fs.promises.stat(full);
      const known = index[relPath];
      if (known && known.size === st.size && known.mtimeMs === st.mtimeMs) return known.sha256;
      const sha256 = await hashFile(full);
      index[relPath] = { size: st.size, mtimeMs: st.mtimeMs, sha256 };
      dirty = true;
      return sha256;
    },
    /** A file whose SHA-256 is known (a download that was verified on arrival). */
    async record(relPath, sha256) {
      const st = await fs.promises.stat(path.join(projectFolder, relPath));
      index[relPath] = { size: st.size, mtimeMs: st.mtimeMs, sha256 };
      dirty = true;
    },
    async save() {
      if (!dirty) return;
      await fs.promises.mkdir(syncDir(projectFolder), { recursive: true });
      await writeFileAtomic(indexPath, JSON.stringify(index));
      dirty = false;
    },
  };
}

/**
 * Entities held from pushes: unresolved conflicts and delete questions
 * (spec v3 §4.6); they keep the local values until the user decides.
 * @param {SyncState} state
 * @returns {Set<string>}
 */
function heldKeys(state) {
  const out = new Set(Object.keys(state.conflicts || {}));
  for (const q of state.questions || []) for (const k of q.keys) out.add(k);
  for (const r of state.restores || []) for (const k of r.keys) out.add(k);
  return out;
}

/**
 * Turned-down changes that stay held: the entity is still as it was when
 * the server turned it down (an edit since then sends it again). Entries
 * written before this rule (no local) are sent again once.
 * @param {SyncState} state
 * @param {{ entities: Record<string, object> }} current - explode() of the project
 * @returns {object[]}
 */
function stillRefused(state, current) {
  const { sameContent } = require('./merge');
  return (state.refused || []).filter((p) => p && typeof p.key === 'string' && p.local !== undefined &&
    sameContent(current.entities[p.key] ?? null, p.local));
}

/**
 * Waiting decisions the user overtook by deleting locally (mutates state):
 *   - a conflict on an entity deleted here becomes a "you deleted it, they
 *     changed it" question (mine_deleted), one per topmost entity deleted
 *     here, joining such a question when one is there; the answer is then
 *     Keep deleted or Bring back with their changes (the base holds theirs)
 *   - a "they deleted it" question whose entities are all deleted here too
 *     is settled (both sides agree)
 * @param {SyncState} state
 * @param {{ entities: Record<string, object> }} current - explode() of the project
 * @returns {boolean} whether state changed (the caller saves it)
 */
function reconcileDecisions(state, current) {
  const { entityKey, DEPTH } = require('../shared/entityModel.mjs');
  let changed = false;
  const here = (k) => Boolean(current.entities[k]);

  const before = (state.questions || []).length;
  state.questions = (state.questions || []).filter((q) => q.kind !== 'theirs_deleted' || q.keys.some(here));
  if (state.questions.length !== before) changed = true;

  const stale = Object.keys(state.conflicts || {}).filter((k) => !here(k));
  if (stale.length === 0) return changed;
  const missing = (k) => !here(k) && Boolean(state.base[k]);
  const ups = (k) => {
    const s = state.base[k];
    if (!s) return [];
    const out = s.parentType ? [entityKey(s.parentType, s.parentId)] : [];
    if (s.type === 'micrograph' && typeof s.body.parentID === 'string' && s.body.parentID) {
      out.push(entityKey('micrograph', s.body.parentID));
    }
    return out;
  };
  const rootOf = (k) => {
    let r = k;
    for (let guard = 0; guard < 1000; guard++) {
      const up = ups(r).find(missing);
      if (!up) return r;
      r = up;
    }
    return r;
  };
  /** @type {Map<string, number>} root => conflicts in it */
  const roots = new Map();
  for (const k of stale) {
    delete state.conflicts[k];
    if (!state.base[k]) continue; // never on the server: nothing of theirs to lose
    const r = rootOf(k);
    roots.set(r, (roots.get(r) || 0) + 1);
  }
  changed = true;
  if (roots.size === 0) return changed;
  const all = Object.keys(state.base).filter(missing);
  for (const [root, n] of roots) {
    const keys = all.filter((k) => rootOf(k) === root);
    const q = state.questions.find((x) => x.key === root && x.kind === 'mine_deleted');
    if (q) {
      q.keys = [...new Set([...q.keys, ...keys])];
      q.theirChanges = (q.theirChanges || 0) + n;
    } else {
      state.questions.push({ key: root, kind: 'mine_deleted', keys, localChanges: 0, theirChanges: n });
    }
  }
  for (const q of state.questions) {
    if (roots.has(q.key)) q.keys.sort((x, y) => DEPTH[state.base[x].type] - DEPTH[state.base[y].type]);
  }
  return changed;
}

module.exports = { syncDir, newState, loadState, saveState, createHashIndex, heldKeys, stillRefused, reconcileDecisions, FORMAT_VERSION };
