/**
 * Sync engine (main process): turning sync on and pushing
 *
 * Works on the saved project.json of a synced copy (the app saves before
 * every push, spec v3 16w, so the base never gets ahead of the file).
 * One push run has three phases:
 *   A. upload the originals of micrographs the server does not have yet
 *      (a micrograph is created only after its image is up, 16h)
 *   B. push entity changes (planPush), recording the push in flight first
 *      so a retry after a crash reuses its pushId
 *   C. upload files and set their refs: originals, composite thumbnails,
 *      tile ZIPs (rebuilt only when the original or the affine placement
 *      changed, 16u), attachments; remove refs whose files are gone
 * Turning sync on creates the server project, moves the folder into the
 * account folder, runs a push of everything, and marks the project ready
 * (or leaves that push to the caller, push: false, so it can run in the
 * background after the project reopens from its new folder).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');
const log = require('electron-log');
const { explode } = require('../shared/entityModel.mjs');
const projectFolders = require('../projectFolders');
const { prepareProjectJson } = require('../projectSerializer');
const { moveProjectToAccount } = require('../projectCopies');
const tileGenerator = require('../tileGenerator');
const tileArchive = require('../tileArchive');
const sidecar = require('./sidecar');
const { planPush, batchPush, applyPushResults } = require('./pushBuilder');
const { SyncError } = require('./client');

/** This installation's id (the server skips a client's own pushes when it pulls). */
function getClientId() {
  const file = path.join(app.getPath('userData'), 'sync-client-id');
  try {
    const id = fs.readFileSync(file, 'utf8').trim();
    if (id) return id;
  } catch (_) { /* first use */ }
  const id = crypto.randomUUID();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, id);
  return id;
}

/**
 * The saved project and its point count sessions, as the server stores them.
 * @param {string} folder
 */
async function readProjectFiles(folder) {
  const project = JSON.parse(await fs.promises.readFile(path.join(folder, 'project.json'), 'utf8'));
  const pointCounts = [];
  let names = [];
  try {
    names = (await fs.promises.readdir(path.join(folder, 'point-counts'))).filter((n) => n.endsWith('.json')).sort();
  } catch (_) { /* none */ }
  // Deleting a micrograph leaves its point count files on disk (the session
  // comes back if the delete is undone); sessions of micrographs that are not
  // in the project are not part of it and are not synced
  const micrographIds = new Set();
  for (const d of project.datasets || []) {
    for (const s of d.samples || []) for (const m of s.micrographs || []) micrographIds.add(m.id);
  }
  for (const n of names) {
    const session = JSON.parse(await fs.promises.readFile(path.join(folder, 'point-counts', n), 'utf8'));
    if (session && micrographIds.has(session.micrographId)) pointCounts.push(session);
  }
  return { project, pointCounts };
}

const refKey = (type, id, role) => `${type}:${id}|${role}`;

/**
 * Files the server should have for the current project: one entry per ref.
 * Tile ZIPs are described, not built (built in phase C when needed).
 */
function plannedFiles(folder, current) {
  const files = [];
  for (const key of current.order) {
    const e = current.entities[key];
    if (e.type === 'micrograph') {
      for (const [role, sub] of [['image', 'images'], ['thumbnail', 'compositeThumbnails']]) {
        const rel = path.join(sub, e.id);
        if (fs.existsSync(path.join(folder, rel))) files.push({ type: e.type, id: e.id, role, kind: role, rel });
      }
      if (fs.existsSync(path.join(folder, 'images', e.id))) {
        files.push({ type: e.type, id: e.id, role: 'tiles', kind: 'tiles', tiles: 'original' });
        if (e.body.placementType === 'affine' && typeof e.body.affineTileHash === 'string' && e.body.affineTileHash) {
          files.push({ type: e.type, id: e.id, role: 'tiles_affine', kind: 'tiles_affine', tiles: 'affine', affineTileHash: e.body.affineTileHash });
        }
      }
    }
    if ((e.type === 'micrograph' || e.type === 'spot') && Array.isArray(e.body.associatedFiles)) {
      for (const af of e.body.associatedFiles) {
        const name = af && typeof af.fileName === 'string' ? af.fileName : '';
        if (!name || /[/\\\x00-\x1f]/.test(name) || name === '.' || name === '..' || name.length > 255) continue;
        const rel = path.join('associatedFiles', name);
        if (fs.existsSync(path.join(folder, rel))) {
          files.push({ type: e.type, id: e.id, role: `associated_file:${name}`, kind: 'associated_file', rel });
        }
      }
    }
  }
  return files;
}

/**
 * Push local changes of a synced copy (and finish its first upload).
 * @param {{ folder: string, client: ReturnType<import('./client').createSyncClient>, onProgress?: (p: object) => void }} options
 * @returns {Promise<{ pushed: number, problems: object[], conflicts: number, filesUploaded: number, ready: boolean, restored: number }>}
 *   conflicts: changes the server turned down because the entity changed or was deleted there (a pull merges them);
 *   restored: restores sent and waiting for a pull to bring their states (the caller pulls)
 */
async function pushProject({ folder, client, onProgress = () => {} }) {
  const state = await sidecar.loadState(folder);
  if (!state) throw new Error('This project is not synced');
  const pid = state.binding.pid;
  const clientId = getClientId();
  const hashes = await sidecar.createHashIndex(folder);
  state.tileSources = state.tileSources || {};

  // A push that was in flight when the app stopped: send it again (same pushId)
  if (state.outgoingPush) {
    const { pushId, planned } = state.outgoingPush;
    const res = await client.push(pid, pushId, clientId, planned.map((p) => p.change));
    applyPushResults(state.base, planned, res.results);
    state.outgoingPush = null;
    await sidecar.saveState(folder, state);
  }

  const { project, pointCounts } = await readProjectFiles(folder);
  if (project.id !== state.binding.straboId) throw new Error('project.json does not belong to this sync binding');
  const current = explode(project, pointCounts);
  if (sidecar.reconcileDecisions(state, current)) await sidecar.saveState(folder, state);
  let filesUploaded = 0;

  // A. Originals of micrographs the server does not have yet (byte progress:
  // these are most of a first upload, and the status chip shows a percentage)
  const held = new Set();
  const originals = [];
  for (const key of current.order) {
    const e = current.entities[key];
    if (e.type !== 'micrograph' || state.base[key]) continue;
    const rel = path.join('images', e.id);
    const size = await fs.promises.stat(path.join(folder, rel)).then((st) => st.size, () => null);
    if (size !== null) originals.push({ key, e, rel, size });
  }
  const bytesTotal = originals.reduce((sum, o) => sum + o.size, 0);
  let bytesDone = 0;
  // Removed from the project (17k): the entity changes still go up, the
  // server parks them for the owner's review and answers access_removed
  let removed = null;
  for (const { key, e, rel, size } of originals) {
    const item = e.body.name || e.id;
    try {
      const sha256 = await hashes.hash(rel);
      onProgress({ phase: 'images', item, bytesDone, bytesTotal });
      const up = await client.uploadFile(pid, path.join(folder, rel), 'image', {
        sha256,
        onProgress: (sent) => onProgress({ phase: 'images', item, bytesDone: bytesDone + sent, bytesTotal }),
      });
      if (up.uploaded) filesUploaded++;
      bytesDone += size;
    } catch (err) {
      if (err instanceof SyncError && err.kind === 'access_removed') {
        removed = err;
        break;
      }
      if (err instanceof SyncError) throw err;
      log.warn(`[Sync] Image of ${e.id} not uploaded yet: ${err.message}`);
      held.add(key);
    }
  }
  await hashes.save();

  // Restores the user asked for (Restore with my changes): the server brings
  // the entities back as they were deleted; they stay held until a pull puts
  // those states into the base, and then my changes push as edits
  for (const r of removed ? [] : state.restores || []) {
    if (r.sent) continue;
    const sep = r.key.indexOf(':');
    const change = { op: 'restore', type: r.key.slice(0, sep), id: r.key.slice(sep + 1), cascade: true };
    const res = await client.push(pid, crypto.randomUUID(), clientId, [change]);
    const result = (res.results || [])[0] || { status: 'missing' };
    if (result.status === 'accepted' || (result.status === 'invalid' && result.reason === 'not_deleted')) {
      r.sent = true;
    } else {
      // Not restored: the entities stay as they are locally, turned down
      state.restores = state.restores.filter((x) => x !== r);
      state.refused = [...(state.refused || []), { key: r.key, change, result, local: current.entities[r.key] ?? null }];
    }
    await sidecar.saveState(folder, state);
  }
  const restored = (state.restores || []).filter((r) => r.sent).length;

  // B. Entity changes (unresolved conflicts, delete questions, restores
  // waiting for a pull, and turned-down changes not edited since wait, spec v3 §4.6)
  for (const k of sidecar.heldKeys(state)) held.add(k);
  const keptRefused = sidecar.stillRefused(state, current);
  for (const p of keptRefused) held.add(p.key);
  const planned = planPush(state.base, current, { skip: held });
  // Parked changes the owner accepted go up on behalf of their member (17y)
  const onBehalf = state.onBehalf || {};
  for (const p of planned) if (onBehalf[p.key]) p.change.onBehalfOf = onBehalf[p.key].pkey;
  const problems = [];
  let pushed = 0;
  for (const batch of batchPush(planned)) {
    const pushId = crypto.randomUUID();
    state.outgoingPush = { pushId, planned: batch };
    await sidecar.saveState(folder, state);
    onProgress({ phase: 'push', count: batch.length });
    const res = await client.push(pid, pushId, clientId, batch.map((p) => p.change));
    const r = applyPushResults(state.base, batch, res.results);
    pushed += r.accepted;
    problems.push(...r.problems.map((x) => ({ change: x.planned.change, result: x.result })));
    state.outgoingPush = null;
    await sidecar.saveState(folder, state);
  }
  if (removed) throw removed;
  // Marks stay for changes still waiting to go up; one not planned yet (the
  // accepted change was not saved when this push started) for up to an hour
  if (state.onBehalf) {
    const sent = new Set(planned.map((p) => p.key));
    const waiting = new Set([...held, ...problems.map((p) => `${p.change.type}:${p.change.id}`)]);
    const hourAgo = Date.now() - 3600_000;
    state.onBehalf = Object.fromEntries(Object.entries(state.onBehalf).filter(([k, v]) =>
      waiting.has(k) || (!sent.has(k) && v && v.at > hourAgo)));
  }
  state.refused = [
    ...keptRefused,
    ...problems
      .filter((p) => p.result.status === 'invalid' || p.result.status === 'forbidden')
      .map((p) => {
        const key = `${p.change.type}:${p.change.id}`;
        return { key, change: p.change, result: p.result, local: current.entities[key] ?? null };
      }),
  ];

  // C. Files and refs, for entities the server has. A file waiting to be
  // downloaded (a pull brought a newer one) is neither uploaded nor unref'd,
  // and nor are the other files of its entity (tiles of a missing original)
  const downloads = state.downloads || {};
  const downloading = new Set(Object.keys(downloads).map((rk) => rk.slice(0, rk.indexOf('|'))));
  const tmpDir = path.join(sidecar.syncDir(folder), 'tmp');
  const wanted = new Set();
  // A Viewer may not change files: no uploads, no ref changes (17h)
  const filesAllowed = state.role !== 'viewer';
  for (const f of filesAllowed ? plannedFiles(folder, current) : []) {
    const ek = `${f.type}:${f.id}`;
    if (!state.base[ek]) continue;
    const rk = refKey(f.type, f.id, f.role);
    wanted.add(rk);
    if (downloads[rk] || downloading.has(ek)) continue;
    let filePath = f.rel ? path.join(folder, f.rel) : null;
    let sha256;
    try {
      if (f.tiles) {
        const imageSha = await hashes.hash(path.join('images', f.id));
        const source = f.tiles === 'affine' ? `${imageSha}|${f.affineTileHash}` : imageSha;
        const known = state.tileSources[rk];
        if (known && known.source === source && state.refs[rk] === known.sha256) continue;
        // Tiles this copy did not make (a download, or someone else's
        // upload) of the same original the server has: the server's tiles
        // are those, nothing to make or send (16v). Tiles go up again only
        // when this copy changes the original (rotate, flip) or placement.
        if (!known && state.refs[rk] && state.refs[refKey(f.type, f.id, 'image')] === imageSha) {
          state.tileSources[rk] = { source, sha256: state.refs[rk] };
          await sidecar.saveState(folder, state);
          continue;
        }
        const imagePath = path.join(folder, 'images', f.id);
        onProgress({ phase: 'tiles', item: f.id });
        await tileGenerator.processImageComplete(imagePath);
        const entries = f.tiles === 'affine'
          ? await tileArchive.collectAffineTileEntries(f.affineTileHash, f.id)
          : await tileArchive.collectTileEntries(imagePath, f.id);
        if (entries.length === 0) continue;
        await fs.promises.mkdir(tmpDir, { recursive: true });
        filePath = path.join(tmpDir, `${f.id}.${f.role}.zip`);
        sha256 = (await tileArchive.writeTileZip(entries, filePath)).sha256;
        state.tileSources[rk] = { source, sha256 };
      } else {
        sha256 = await hashes.hash(f.rel);
      }
      if (state.refs[rk] === sha256) continue;
      onProgress({ phase: 'files', item: `${f.id} ${f.role}` });
      const up = await client.uploadFile(pid, filePath, f.kind, { sha256 });
      if (up.skipped) {
        log.warn(`[Sync] File ${f.role} of ${f.type} ${f.id} not uploaded (${up.skipped})`);
        continue;
      }
      if (up.uploaded) filesUploaded++;
      const set = await client.setRef(pid, f.type, f.id, f.role, sha256);
      if (set && set.skipped) {
        // Deleted on the server (the next pull brings that), or my role may
        // not change it: not recorded, so it is offered again only if still wanted
        log.warn(`[Sync] File ${f.role} of ${f.type} ${f.id} not set (${set.skipped}${set.reason ? `: ${set.reason}` : ''})`);
        continue;
      }
      state.refs[rk] = sha256;
      if (f.role === 'image') {
        // This copy sent a new original: its tiles are owed, never taken
        // from the server (whose tiles are of the old original)
        for (const role of ['tiles', 'tiles_affine']) state.tileSources[refKey(f.type, f.id, role)] = { source: null, sha256: null };
      }
      await sidecar.saveState(folder, state);
    } finally {
      if (f.tiles && filePath) await fs.promises.rm(filePath, { force: true });
    }
  }
  // Refs of live entities whose file is gone (an attachment was removed)
  for (const rk of filesAllowed ? Object.keys(state.refs) : []) {
    if (wanted.has(rk)) continue;
    const [ek, role] = rk.split('|');
    if (downloading.has(ek)) continue;
    const sep = ek.indexOf(':');
    const type = ek.slice(0, sep);
    const id = ek.slice(sep + 1);
    if (state.base[ek]) {
      const del = await client.deleteRef(pid, type, id, role);
      if (del && del.skipped) {
        log.warn(`[Sync] File ${role} of ${type} ${id} not removed (${del.skipped})`);
        continue;
      }
    }
    delete state.refs[rk];
    delete state.tileSources[rk];
  }
  await hashes.save();

  let ready = state.phase === 'ready';
  if (!ready && planned.length === pushed && !state.outgoingPush) {
    await client.ready(pid);
    state.phase = 'ready';
    ready = true;
  }
  await sidecar.saveState(folder, state);
  const conflicts = problems.filter((p) => p.result.status === 'conflict' || p.result.status === 'deleted').length;
  return { pushed, problems, conflicts, filesUploaded, ready, restored };
}

/**
 * Entity changes the server does not have yet (entities held by a conflict
 * or delete question are not counted), in the given project (the
 * app's current one, which can be ahead of the file in Manual mode) or else
 * in the saved project.json. File uploads are not counted.
 * @param {string} folder
 * @param {object | null} [unsavedProject]
 * @returns {Promise<number>}
 */
async function countPendingChanges(folder, unsavedProject = null) {
  const state = await sidecar.loadState(folder);
  if (!state) return 0;
  const saved = await readProjectFiles(folder);
  // The app's project is counted as a save would write it (rounded, cleaned,
  // modifiedTimestamp kept unless changed), else save-time differences count
  const project = unsavedProject && unsavedProject.id === saved.project.id
    ? await prepareProjectJson(unsavedProject, path.join(folder, 'project.json'))
    : saved.project;
  const { pointCounts } = saved;
  // A push in flight is still in the diff (the base takes it only once the
  // server answers), unless a later edit reverted it; it still has to be sent
  const inFlight = state.outgoingPush ? state.outgoingPush.planned.length : 0;
  const current = explode(project, pointCounts);
  sidecar.reconcileDecisions(state, current); // as the next push will see it (not saved here)
  const skip = sidecar.heldKeys(state);
  for (const p of sidecar.stillRefused(state, current)) skip.add(p.key);
  return Math.max(inFlight, planPush(state.base, current, { skip }).length);
}

/**
 * Turn sync on for a local-only project: create the server project, move
 * the folder into the account's folder, upload everything, mark it ready.
 * Resumes an interrupted first upload (the server project already exists
 * in state initializing and is ours).
 * @param {{ projectId: string, restServer: string, user: { pkey: number, email: string },
 *   mode?: 'automatic' | 'manual', client: object, push?: boolean, onProgress?: (p: object) => void }} options
 *   push: false leaves the first upload to a later pushProject
 * @returns {Promise<{ status: 'synced', pid: number, folder: string } | { status: 'exists', pid: number, syncFormat: string, syncState: string }>}
 */
async function turnSyncOn({ projectId, restServer, user, mode = 'automatic', client, push = true, onProgress = () => {} }) {
  const accountFolder = projectFolders.getAccountCopyPath(projectId, restServer, user.pkey);
  const existingState = await sidecar.loadState(accountFolder).catch(() => null);
  if (existingState) {
    projectFolders.useProjectCopy(projectId, accountFolder);
    if (push) await pushProject({ folder: accountFolder, client, onProgress });
    return { status: 'synced', pid: existingState.binding.pid, folder: accountFolder };
  }

  // Normally the local-only folder; the account folder if an earlier attempt
  // moved it but stopped before writing the sync state
  const localFolder = path.join(projectFolders.getStraboMicro2DataPath(), projectId);
  const sourceFolder = fs.existsSync(path.join(localFolder, 'project.json')) ? localFolder : accountFolder;
  const { project } = await readProjectFiles(sourceFolder);
  const created = await client.createProject(project.id, project.name || 'Untitled Project');
  let pid;
  if (created.status === 201) {
    pid = created.data.pid;
  } else if (created.status === 409 && created.data && created.data.syncFormat === 'entity' &&
    created.data.syncState === 'initializing') {
    pid = created.data.pid; // our own first upload, interrupted before the folder moved
  } else if (created.status === 409) {
    return { status: 'exists', pid: created.data.pid, syncFormat: created.data.syncFormat, syncState: created.data.syncState };
  } else {
    throw new SyncError('server', `Could not create the project on the server (${created.status})`, created);
  }

  const folder = sourceFolder === localFolder ? await moveProjectToAccount(projectId, restServer, user.pkey) : accountFolder;
  projectFolders.useProjectCopy(projectId, folder);
  const state = sidecar.newState({ server: restServer, pkey: user.pkey, email: user.email, pid, straboId: project.id }, mode);
  await sidecar.saveState(folder, state);
  log.info(`[Sync] Turning sync on for ${projectId} (server project ${pid})`);
  if (push) await pushProject({ folder, client, onProgress });
  return { status: 'synced', pid, folder };
}

/**
 * Bytes a first upload of this folder sends, for the turn-on dialog: the
 * originals and the other files (thumbnails, attachments). Tile ZIPs are
 * built during the upload and not counted, so this is a lower estimate.
 * @param {string} folder
 * @returns {Promise<number>}
 */
async function estimateUploadBytes(folder) {
  const { project, pointCounts } = await readProjectFiles(folder);
  let bytes = 0;
  for (const f of plannedFiles(folder, explode(project, pointCounts))) {
    if (!f.rel) continue;
    bytes += await fs.promises.stat(path.join(folder, f.rel)).then((st) => st.size, () => 0);
  }
  return bytes;
}

module.exports = { pushProject, turnSyncOn, countPendingChanges, estimateUploadBytes, readProjectFiles, plannedFiles, getClientId };
