/**
 * Linking (main process): a local-only copy of a project the server already
 * has becomes a synced copy of it (collaboration spec v3 §3.5, 16an, 16am,
 * 16s), instead of a second project being made.
 *
 *   compareWithServer  converted (entity) server project: the snapshot vs
 *                      the local copy, entity by entity (the changes a push
 *                      would send) and originals by SHA-256 (hashed here,
 *                      once, with progress). Nothing is written.
 *   linkToServer       the user's answer:
 *                        mine    (also "identical") the server's states
 *                                become the base; the next push sends the
 *                                local differences, deletions included
 *                        theirs  the local copy goes to version history,
 *                                then the server's project replaces it;
 *                                only files whose hash differs download
 *   adoptLegacy        legacy (not converted) server project: the row is
 *                      adopted (P1-1) and the local copy becomes its first
 *                      upload into the same project number
 *
 * The folder moves into the account folder (§11.4), so the project must
 * not be loaded while linkToServer or adoptLegacy runs.
 */

const fs = require('fs');
const path = require('path');
const log = require('electron-log');
const { explode, assemble, entityKey } = require('../shared/entityModel.mjs');
const projectFolders = require('../projectFolders');
const { writeFileAtomic } = require('../atomicFile');
const sidecar = require('./sidecar');
const { planPush } = require('./pushBuilder');
const { readProjectFiles } = require('./syncEngine');
const { stateFromEntry, downloadTarget, downloadFiles, normalizeBaseOrder } = require('./pull');
const { hashFile } = require('./client');
const { moveProjectToAccount } = require('../projectCopies');

/** The local-only folder of a project (linking starts from there) */
function localFolder(projectId) {
  return path.join(projectFolders.getStraboMicro2DataPath(), projectId);
}

/** The server's project as a base: 'type:id' => state + version */
async function serverBase(client, pid, folder) {
  const snap = await client.snapshot(pid);
  const root = (snap.entities || []).find((e) => e.type === 'project');
  if (!root) throw new Error('The server project has no project entity');
  /** @type {Record<string, object>} */
  const base = {};
  for (const e of snap.entities) {
    const s = stateFromEntry({ ...e, op: 'update' });
    base[entityKey(e.type, e.id)] = { ...s, version: e.version };
  }
  await normalizeBaseOrder(base, folder);
  return { snap, base, projectId: root.id };
}

/**
 * The local copy vs the server's. Read-only.
 * @param {{ projectId: string, pid: number, client: object, onProgress?: (p: object) => void }} options
 * @returns {Promise<{ identical: boolean, total: number, byType: Record<string, number>, localChanged: string | null, serverChanged: string | null }>}
 *   total: items that differ (an item whose fields and original both differ counts once);
 *   localChanged / serverChanged: the project's modifiedTimestamp on each side
 */
async function compareWithServer({ projectId, pid, client, onProgress = () => {} }) {
  const folder = localFolder(projectId);
  const { base, snap, projectId: serverProjectId } = await serverBase(client, pid, folder);
  if (serverProjectId !== projectId) throw new Error('The server project is a different project');
  const { project, pointCounts } = await readProjectFiles(folder);
  const current = explode(project, pointCounts);

  const differing = new Set(planPush(base, current).map((p) => p.key));

  // Originals of micrographs on both sides, by hash
  const serverImages = new Map();
  for (const r of snap.refs || []) {
    if (r.type === 'micrograph' && r.role === 'image') serverImages.set(r.id, r.sha256);
  }
  const toHash = [];
  for (const key of current.order) {
    const e = current.entities[key];
    if (e.type !== 'micrograph' || !serverImages.has(e.id)) continue;
    const file = path.join(folder, 'images', e.id);
    const size = await fs.promises.stat(file).then((st) => st.size, () => null);
    if (size === null) differing.add(key);
    else toHash.push({ key, id: e.id, file, size });
  }
  const bytesTotal = toHash.reduce((sum, f) => sum + f.size, 0);
  let bytesDone = 0;
  onProgress({ phase: 'compare', bytesDone, bytesTotal });
  for (const f of toHash) {
    if ((await hashFile(f.file)) !== serverImages.get(f.id)) differing.add(f.key);
    bytesDone += f.size;
    onProgress({ phase: 'compare', bytesDone, bytesTotal });
  }

  /** @type {Record<string, number>} */
  const byType = {};
  for (const key of differing) {
    const type = key.slice(0, key.indexOf(':'));
    byType[type] = (byType[type] || 0) + 1;
  }
  const serverRoot = base[entityKey('project', projectId)];
  return {
    identical: differing.size === 0,
    total: differing.size,
    byType,
    localChanged: project.modifiedTimestamp || null,
    serverChanged: (serverRoot && serverRoot.body && serverRoot.body.modifiedTimestamp) || null,
  };
}

/**
 * Link the local-only copy to server project pid.
 * @param {{ projectId: string, pid: number, restServer: string, user: { pkey: string | number, email: string },
 *   mode: 'automatic' | 'manual', use: 'mine' | 'theirs', client: object,
 *   saveVersion?: (projectId: string, label: string) => Promise<void>, onProgress?: (p: object) => void }} options
 *   saveVersion: puts the local project into version history (called before "theirs" replaces it)
 * @returns {Promise<{ folder: string, downloaded: number }>}
 */
async function linkToServer({ projectId, pid, restServer, user, mode, use, client, saveVersion = async () => {}, onProgress = () => {} }) {
  const from = localFolder(projectId);
  if (!fs.existsSync(path.join(from, 'project.json'))) throw new Error('There is no local-only copy of this project');
  const { snap, base, projectId: serverProjectId } = await serverBase(client, pid, from);
  if (serverProjectId !== projectId) throw new Error('The server project is a different project');

  let assembled = null;
  if (use === 'theirs') {
    assembled = assemble(base, projectId);
    if (!assembled) throw new Error('The server project could not be assembled');
    await saveVersion(projectId, 'Before using the StraboSpot copy');
  }

  const folder = await moveProjectToAccount(projectId, restServer, user.pkey);
  const state = sidecar.newState({ server: restServer, pkey: Number(user.pkey), email: user.email, pid, straboId: projectId }, mode);
  state.phase = 'ready';
  state.lastSeq = snap.headSeq;
  state.base = base;
  state.downloads = {};
  for (const r of snap.refs || []) {
    const ek = entityKey(r.type, r.id);
    const rk = `${ek}|${r.role}`;
    state.refs[rk] = r.sha256;
    if (!base[ek]) continue;
    const target = downloadTarget(folder, r.type, r.id, r.role);
    if (!target) continue;
    const have = fs.existsSync(target);
    // Mine: only what is missing here (else the push would remove the server's file);
    // theirs: also files whose content differs
    if (!have || (use === 'theirs' && (await hashFile(target)) !== r.sha256)) state.downloads[rk] = r.sha256;
  }

  if (use === 'theirs') {
    const keep = new Set(assembled.pointCounts.map((pc) => pc.id));
    const pcDir = path.join(folder, 'point-counts');
    for (const name of await fs.promises.readdir(pcDir).catch(() => [])) {
      if (name.endsWith('.json') && !keep.has(name.slice(0, -5))) await fs.promises.rm(path.join(pcDir, name), { force: true });
    }
    for (const pc of assembled.pointCounts) {
      await fs.promises.mkdir(pcDir, { recursive: true });
      await writeFileAtomic(path.join(pcDir, `${pc.id}.json`), JSON.stringify(pc, null, 2));
    }
  }
  // state.json before project.json, as a pull writes them
  await sidecar.saveState(folder, state);
  if (use === 'theirs') await writeFileAtomic(path.join(folder, 'project.json'), JSON.stringify(assembled.project, null, 2));
  log.info(`[Sync] Linked ${projectId} to server project ${pid} (${use === 'theirs' ? 'server copy' : 'local copy'}, ` +
    `${Object.keys(state.downloads).length} files to download)`);

  const d = Object.keys(state.downloads).length > 0 ? await downloadFiles({ folder, client, onProgress }) : { downloaded: 0 };
  return { folder, downloaded: d.downloaded };
}

/**
 * Adopt a legacy server project (P1-1): the local-only copy becomes the
 * first upload into the same project number (the first push sends it all;
 * POST ready then retires the old upload on the server).
 * @param {{ projectId: string, pid: number, restServer: string, user: { pkey: string | number, email: string },
 *   mode: 'automatic' | 'manual', client: object }} options
 * @returns {Promise<{ folder: string }>}
 */
async function adoptLegacy({ projectId, pid, restServer, user, mode, client }) {
  if (!fs.existsSync(path.join(localFolder(projectId), 'project.json'))) throw new Error('There is no local-only copy of this project');
  await client.adopt(pid);
  const folder = await moveProjectToAccount(projectId, restServer, user.pkey);
  const state = sidecar.newState({ server: restServer, pkey: Number(user.pkey), email: user.email, pid, straboId: projectId }, mode);
  await sidecar.saveState(folder, state);
  log.info(`[Sync] Adopting legacy server project ${pid} with the local copy of ${projectId}`);
  return { folder };
}

module.exports = { compareWithServer, linkToServer, adoptLegacy };
