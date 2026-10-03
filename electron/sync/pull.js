/**
 * Pull (main process): bring the server's changes into a synced copy
 *
 * Two steps, so the app's store and project.json change together:
 *   preparePull  fetches the changes since lastSeq, merges them with the
 *                saved project (merge.js) and works out what the app must
 *                apply to its store. Nothing is written.
 *   commitPull   after the app applied those changes and saved project.json:
 *                writes pulled point count sessions, then the sync state
 *                (base = the server's states, lastSeq, conflicts, delete
 *                questions, files to download). project.json is written
 *                before state.json, so the base never gets ahead of the
 *                file; a crash in between repeats the pull, which is
 *                idempotent (the merge finds the changes already applied).
 * downloadFiles fetches the originals, composite thumbnails and attachments
 * the server has and this copy lacks (tiles are generated locally, 16v).
 *
 * Changes this client pushed come back in the feed; they equal the base and
 * are skipped. Entities with an unresolved conflict or delete question are
 * held: they keep the local values and pushes skip them (spec v3 §4.6).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const log = require('electron-log');
const { explode, assemble, entityKey, CHILD_KEYS, diffProjects, applyEntityChanges, perUserFields } = require('../shared/entityModel.mjs');
const projectFolders = require('../projectFolders');
const { toAppProject } = require('../projectSerializer');
const { writeFileAtomic } = require('../atomicFile');
const tileCache = require('../tileCache');
const sidecar = require('./sidecar');
const { mergeProject, sameState, carryConflicts } = require('./merge');
const { readProjectFiles } = require('./syncEngine');

/** Files a pull downloads, by ref role. */
function downloadTarget(folder, type, id, role) {
  if (role === 'image' && type === 'micrograph') return path.join(folder, 'images', id);
  if (role === 'thumbnail' && type === 'micrograph') return path.join(folder, 'compositeThumbnails', id);
  if (role.startsWith('associated_file:')) {
    const name = role.slice('associated_file:'.length);
    if (!name || /[/\\\x00-\x1f]/.test(name) || name === '.' || name === '..' || name.length > 255) return null;
    return path.join(folder, 'associatedFiles', name);
  }
  return null;
}

/** Entity state from a change feed entry (null for a delete). */
function stateFromEntry(e) {
  if (e.op === 'delete') return null;
  /** @type {object} */
  const s = { type: e.type, id: e.id, parentType: e.parentType ?? null, parentId: e.parentId ?? null, body: e.body || {} };
  if (Object.keys(CHILD_KEYS[e.type] || {}).length > 0) s.childOrder = e.childOrder || {};
  return s;
}

/**
 * Fetch and merge. Returns what the app must apply and the pending commit.
 * @param {{ folder: string, client: object, onProgress?: (p: object) => void }} options
 */
async function preparePull({ folder, client, onProgress = () => {} }) {
  const state = await sidecar.loadState(folder);
  if (!state) throw new Error('This project is not synced');
  const pid = state.binding.pid;

  // The feed since the last pull, all pages
  const entries = [];
  let since = state.lastSeq || 0;
  let headSeq = since;
  for (let guard = 0; guard < 100000; guard++) {
    onProgress({ phase: 'pull', count: entries.length });
    const page = await client.changes(pid, since);
    entries.push(...(page.changes || []));
    headSeq = page.headSeq;
    if (!page.more) break;
    since = page.headSeq;
  }

  // One state per entity: the last entry wins
  /** @type {Map<string, object>} */
  const last = new Map();
  for (const e of entries) last.set(entityKey(e.type, e.id), e);

  // Restores this copy sent (Restore with my changes): the restored states
  // are the server's starting point for my edits, so they join the base
  // rather than being merged as their changes
  const restoring = new Set();
  for (const r of state.restores || []) if (r.sent) for (const k of r.keys) restoring.add(k);
  /** @type {Record<string, object>} */
  const restoredBase = {};
  /** @type {Map<string, object>} */
  const restoreEntries = new Map();
  for (const e of entries) {
    const key = entityKey(e.type, e.id);
    if (e.op === 'restore' && restoring.has(key)) {
      restoredBase[key] = { ...stateFromEntry(e), version: e.version };
      restoreEntries.set(key, e);
    }
  }
  const base = { ...state.base, ...restoredBase };

  const { project, pointCounts } = await readProjectFiles(folder);
  if (project.id !== state.binding.straboId) throw new Error('project.json does not belong to this sync binding');
  const mine = explode(project, pointCounts);

  /** @type {Map<string, object | null>} */
  const theirs = new Map();
  /** @type {Record<string, number>} */
  const versions = {};
  /** @type {Record<string, Record<string, string> | null>} */
  const refs = {};
  for (const [key, e] of last) {
    const s = stateFromEntry(e);
    refs[key] = s === null ? null : (e.refs && typeof e.refs === 'object' ? e.refs : {});
    if (s !== null) versions[key] = e.version;
    if (s === null && !base[key] && !mine.entities[key]) continue; // created and deleted elsewhere
    if (s !== null && base[key] && sameState(base[key], s)) continue; // mine (already in the base) or no change
    if (restoreEntries.get(key) === e) continue; // my restore, now in the base
    theirs.set(key, s);
  }

  const merged = mergeProject(base, mine, theirs, { held: sidecar.heldKeys(state) });

  // Conflicts: fresh ones plus earlier unresolved ones that still differ
  const conflicts = { ...(state.conflicts || {}) };
  const fresh = new Map(merged.conflicts.map((c) => [c.key, c.fields]));
  const after = new Map(merged.changes.map((c) => [c.key, c.after]));
  for (const [key, t] of theirs) {
    if (t === null) {
      delete conflicts[key];
      continue;
    }
    const local = after.has(key) ? after.get(key) : mine.entities[key];
    if (!local) {
      delete conflicts[key];
      continue;
    }
    const fields = carryConflicts(conflicts[key] || [], fresh.get(key) || [], local, t);
    if (fields.length > 0) conflicts[key] = fields;
    else delete conflicts[key];
  }
  const questionKeys = new Set(merged.questions.map((q) => q.key));
  const questions = [...(state.questions || []).filter((q) => !questionKeys.has(q.key)), ...merged.questions];

  // What the app applies: the merged project in the app's form, exactly as a
  // load would produce it (runtime fields such as imagePath included)
  const projectChanges = merged.changes.filter((c) => (c.after ?? c.before).type !== 'point_count');
  const mergedProject = JSON.parse(JSON.stringify(project));
  applyEntityChanges(mergedProject, projectChanges, 'redo');
  const storeChanges = projectChanges.length === 0
    ? []
    : diffProjects(toAppProject(project), toAppProject(mergedProject), { withTimestamps: true });

  // Who created what arrives with create entries (Phase 2 role checks, 17i)
  /** @type {Record<string, number>} */
  const authors = {};
  for (const e of entries) {
    if (e.op === 'create' && e.user && Number(e.user.pkey) > 0) authors[entityKey(e.type, e.id)] = Number(e.user.pkey);
  }

  const pending = {
    id: crypto.randomUUID(),
    since: state.lastSeq || 0,
    headSeq,
    theirs: [...theirs],
    versions,
    refs,
    conflicts,
    questions,
    pointCountChanges: merged.changes.filter((c) => (c.after ?? c.before).type === 'point_count'),
    restoredBase,
    authors,
  };
  return {
    pending,
    storeChanges,
    summary: {
      received: theirs.size,
      applied: merged.changes.length,
      conflicts: Object.keys(conflicts).length,
      questions: questions.length,
      pointCounts: pending.pointCountChanges.length,
    },
  };
}

/**
 * Child order in the base as the server applies it: the server keeps a
 * parent's stored order when children are created or deleted beneath it and
 * fixes it up when reading (deleted ids dropped, new children appended). The
 * base does the same, appending in the local order, so that an order which
 * differs only by those children does not look like a local reorder.
 * @param {Record<string, object>} base - Mutated
 * @param {string} folder
 */
async function normalizeBaseOrder(base, folder) {
  /** @type {Map<string, Map<string, string[]>>} parent key => list key => live child ids */
  const live = new Map();
  for (const s of Object.values(base)) {
    if (!s.parentType) continue;
    const listKey = Object.entries(CHILD_KEYS[s.parentType] || {}).find(([, t]) => t === s.type)?.[0];
    if (!listKey) continue;
    const pk = entityKey(s.parentType, s.parentId);
    if (!live.has(pk)) live.set(pk, new Map());
    const lists = live.get(pk);
    if (!lists.has(listKey)) lists.set(listKey, []);
    lists.get(listKey).push(s.id);
  }
  let localOrder = {};
  try {
    const { project, pointCounts } = await readProjectFiles(folder);
    localOrder = explode(project, pointCounts).entities;
  } catch (_) { /* order of appended children then stays as found */ }
  for (const [key, s] of Object.entries(base)) {
    const listKeys = Object.keys(CHILD_KEYS[s.type] || {});
    if (listKeys.length === 0) continue;
    /** @type {Record<string, string[]>} */
    const order = {};
    for (const listKey of listKeys) {
      const ids = (live.get(key) && live.get(key).get(listKey)) || [];
      const liveSet = new Set(ids);
      const stored = Array.isArray(s.childOrder?.[listKey]) ? s.childOrder[listKey] : [];
      const out = stored.filter((id) => liveSet.has(id));
      const listed = new Set(out);
      const local = (localOrder[key] && localOrder[key].childOrder && localOrder[key].childOrder[listKey]) || [];
      for (const id of [...local, ...ids]) {
        if (liveSet.has(id) && !listed.has(id)) {
          out.push(id);
          listed.add(id);
        }
      }
      order[listKey] = out;
    }
    base[key] = { ...s, childOrder: order };
  }
}

/**
 * Write point count session changes (files beside project.json; per-user
 * fields of an existing session kept).
 * @param {string} folder
 * @param {Array<{ before: object | null, after: object | null }>} changes - point_count entity changes
 */
async function writePointCounts(folder, changes) {
  for (const c of changes) {
    const id = (c.after ?? c.before).id;
    const file = path.join(folder, 'point-counts', `${id}.json`);
    if (c.after === null) {
      await fs.promises.rm(file, { force: true });
      continue;
    }
    let keep = {};
    try {
      const existing = JSON.parse(await fs.promises.readFile(file, 'utf8'));
      for (const f of perUserFields('point_count')) if (f in existing) keep[f] = existing[f];
    } catch (_) { /* new session */ }
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    await writeFileAtomic(file, JSON.stringify({ ...c.after.body, ...keep }, null, 2));
  }
}

/**
 * Record a prepared pull, after the app saved project.json with its changes.
 * @param {{ folder: string, pending: object }} options
 * @returns {Promise<{ downloads: number }>}
 */
async function commitPull({ folder, pending }) {
  const state = await sidecar.loadState(folder);
  if (!state) throw new Error('This project is not synced');
  if ((state.lastSeq || 0) !== pending.since) throw new Error('The project was pulled again in the meantime');

  await writePointCounts(folder, pending.pointCountChanges);

  // The base takes my restored states, then the server's changes
  for (const [key, s] of Object.entries(pending.restoredBase || {})) state.base[key] = s;
  if (state.restores) {
    state.restores = state.restores.filter((r) => !(r.sent && pending.restoredBase && r.key in pending.restoredBase));
  }
  const theirKeys = new Set(pending.theirs.map(([k]) => k));
  for (const [key, s] of pending.theirs) {
    if (s === null) delete state.base[key];
    else state.base[key] = { ...s, version: pending.versions[key] };
  }
  await normalizeBaseOrder(state.base, folder);
  for (const [key, v] of Object.entries(pending.versions)) {
    if (state.base[key] && !theirKeys.has(key)) state.base[key].version = v;
  }

  // Refs (what the server has) and the files to fetch
  state.refs = state.refs || {};
  state.downloads = state.downloads || {};
  for (const [key, entityRefs] of Object.entries(pending.refs)) {
    const prefix = `${key}|`;
    if (entityRefs === null) {
      for (const rk of Object.keys(state.refs)) if (rk.startsWith(prefix)) delete state.refs[rk];
      for (const rk of Object.keys(state.downloads)) if (rk.startsWith(prefix)) delete state.downloads[rk];
      continue;
    }
    for (const rk of Object.keys(state.refs)) {
      if (rk.startsWith(prefix) && !(rk.slice(prefix.length) in entityRefs)) delete state.refs[rk];
    }
    const sep = key.indexOf(':');
    const type = key.slice(0, sep);
    const id = key.slice(sep + 1);
    for (const [role, sha] of Object.entries(entityRefs)) {
      const rk = `${prefix}${role}`;
      if (state.refs[rk] === sha) continue;
      state.refs[rk] = sha;
      if (downloadTarget(folder, type, id, role)) state.downloads[rk] = sha;
    }
  }

  state.authors = { ...(state.authors || {}), ...(pending.authors || {}) };
  for (const [key, s] of pending.theirs) if (s === null) delete state.authors[key];
  state.lastSeq = pending.headSeq;
  state.conflicts = pending.conflicts;
  state.questions = pending.questions;
  // The app saved the pulled project first: turned-down changes the pull
  // brought as well (the owner accepted them) are settled now
  const { readProjectFiles } = require('./syncEngine');
  const files = await readProjectFiles(folder);
  sidecar.reconcileDecisions(state, explode(files.project, files.pointCounts));
  await sidecar.saveState(folder, state);
  return { downloads: Object.keys(state.downloads).length };
}

/**
 * Fetch files the server has and this copy lacks. The transfers run outside
 * exclusive (the project's sync queue, so pushes and pulls are not held up
 * by big downloads); reading the list and recording each file run inside
 * it, since state.json and images.json are written whole. Each file goes to
 * a temp file and is renamed into place once verified; pushes leave an
 * entity alone while any of its downloads is listed (pushProject), so a
 * file arriving during a push is never mistaken for a local change. A file
 * a pull replaced or dropped meanwhile is not recorded (the newer one comes
 * next round). Rounds repeat until nothing is left, so files a pull added
 * during the run are fetched too. Each file is recorded as done, so an
 * interrupted run resumes.
 * @param {{ folder: string, client: object, onProgress?: (p: object) => void,
 *   exclusive?: <T>(fn: () => Promise<T>) => Promise<T> }} options
 * @returns {Promise<{ downloaded: number, images: string[], thumbnails: string[] }>} micrograph ids
 *   whose original or composite thumbnail arrived
 */
async function downloadFiles({ folder, client, onProgress = () => {}, exclusive = (fn) => fn() }) {
  let downloaded = 0;
  const images = [];
  const thumbnails = [];
  for (let round = 0; round < 100; round++) {
    const listed = await exclusive(async () => {
      const state = await sidecar.loadState(folder);
      if (!state || !state.downloads) return { pid: null, items: [] };
      const items = Object.entries(state.downloads).map(([rk, sha]) => {
        const key = rk.slice(0, rk.indexOf('|'));
        const role = rk.slice(rk.indexOf('|') + 1);
        const sep = key.indexOf(':');
        const type = key.slice(0, sep);
        const id = key.slice(sep + 1);
        const dest = state.base[key] && state.refs[rk] === sha ? downloadTarget(folder, type, id, role) : null;
        return { rk, sha, role, key, id, dest };
      });
      return { pid: state.binding.pid, items };
    });
    if (listed.items.length === 0) break;
    const hashes = await sidecar.createHashIndex(folder); // read only here; recorded inside exclusive
    for (const item of listed.items) {
      let fetched = false;
      let created = false; // nothing was at dest before this download
      if (item.dest) {
        const rel = path.relative(folder, item.dest);
        let have = false;
        try {
          have = (await hashes.hash(rel)) === item.sha;
        } catch (_) { /* missing */ }
        if (!have) {
          onProgress({ phase: 'download', item: item.role === 'image' ? item.id : path.basename(item.dest) });
          if (item.role === 'image' && fs.existsSync(item.dest)) {
            // A replaced original (rotated or edited elsewhere): its tiles are stale
            try {
              await tileCache.clearImageCache(await tileCache.generateImageHash(item.dest));
            } catch (err) {
              log.warn(`[Sync] Could not clear the tiles of ${item.id}: ${err.message}`);
            }
          }
          created = !fs.existsSync(item.dest);
          await client.downloadFile(listed.pid, item.sha, item.dest);
          fetched = true;
        }
      }
      await exclusive(async () => {
        const state = await sidecar.loadState(folder);
        if (!state || !state.downloads || state.downloads[item.rk] !== item.sha) {
          // A pull changed it meanwhile. If it deleted the micrograph, drop the
          // image or thumbnail this download created (paths are per micrograph;
          // associated files are named by file name and may be shared)
          if (created && state && !state.base[item.key] && (item.role === 'image' || item.role === 'thumbnail')) {
            await fs.promises.rm(item.dest, { force: true });
            log.info(`[Sync] Removed the ${item.role} of ${item.id}, deleted while it downloaded`);
          }
          return;
        }
        delete state.downloads[item.rk];
        if (fetched) {
          const index = await sidecar.createHashIndex(folder);
          await index.record(path.relative(folder, item.dest), item.sha);
          await index.save();
        }
        await sidecar.saveState(folder, state);
      });
      if (fetched) {
        downloaded++;
        if (item.role === 'image') images.push(item.id);
        if (item.role === 'thumbnail') thumbnails.push(item.id);
      }
    }
  }
  return { downloaded, images: [...new Set(images)], thumbnails: [...new Set(thumbnails)] };
}

/**
 * Make a synced copy of a server project on this computer (a project synced
 * from another computer): the snapshot becomes project.json, point count
 * files and the base, then the files download. Tiles are generated locally
 * when the project opens (16v).
 * @param {{ pid: number, restServer: string, user: { pkey: number | string, email: string },
 *   mode?: 'automatic' | 'manual', client: object, onProgress?: (p: object) => void }} options
 * @returns {Promise<{ projectId: string, folder: string, downloaded: number }>}
 */
async function cloneProject({ pid, restServer, user, mode = 'automatic', client, onProgress = () => {} }) {
  onProgress({ phase: 'pull', count: 0 });
  const snap = await client.snapshot(pid);
  const root = (snap.entities || []).find((e) => e.type === 'project');
  if (!root) throw new Error('The server project has no project entity');
  const projectId = root.id;
  const folder = projectFolders.getAccountCopyPath(projectId, restServer, user.pkey);
  if (fs.existsSync(path.join(folder, 'project.json'))) {
    throw new Error('This computer already has a synced copy of this project for this account');
  }

  /** @type {Record<string, object>} */
  const base = {};
  /** @type {Record<string, number>} */
  const authors = {};
  for (const e of snap.entities) {
    const s = stateFromEntry({ ...e, op: 'update' });
    base[entityKey(e.type, e.id)] = { ...s, version: e.version };
    if (Number(e.createdBy) > 0) authors[entityKey(e.type, e.id)] = Number(e.createdBy);
  }
  const assembled = assemble(base, projectId);
  if (!assembled) throw new Error('The server project could not be assembled');

  projectFolders.useProjectCopy(projectId, folder);
  await projectFolders.createProjectFolders(projectId);
  for (const pc of assembled.pointCounts) {
    const file = path.join(folder, 'point-counts', `${pc.id}.json`);
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    await writeFileAtomic(file, JSON.stringify(pc, null, 2));
  }

  const state = sidecar.newState({ server: restServer, pkey: Number(user.pkey), email: user.email, pid, straboId: projectId }, mode);
  state.phase = 'ready';
  state.lastSeq = snap.headSeq;
  state.base = base;
  state.authors = authors;
  state.downloads = {};
  for (const r of snap.refs || []) {
    const rk = `${entityKey(r.type, r.id)}|${r.role}`;
    state.refs[rk] = r.sha256;
    if (base[entityKey(r.type, r.id)] && downloadTarget(folder, r.type, r.id, r.role)) state.downloads[rk] = r.sha256;
  }
  await normalizeBaseOrder(state.base, folder);
  // project.json last of the folder's files: a copy is usable once it exists
  await sidecar.saveState(folder, state);
  await writeFileAtomic(path.join(folder, 'project.json'), JSON.stringify(assembled.project, null, 2));
  log.info(`[Sync] Made a synced copy of server project ${pid} (${projectId}) in ${folder}`);

  const d = await downloadFiles({ folder, client, onProgress });
  return { projectId, folder, downloaded: d.downloaded };
}

module.exports = { preparePull, commitPull, downloadFiles, downloadTarget, cloneProject, writePointCounts, stateFromEntry, normalizeBaseOrder };
