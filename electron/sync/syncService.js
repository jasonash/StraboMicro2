/**
 * Sync service (main process): the IPC side of syncing
 *
 *   sync:status    is the project synced; mode, binding, changes waiting
 *                  (counted in the app's current project when it is passed)
 *   sync:turn-on   create the server project and move the folder into the
 *                  account folder (the first upload runs as the first push)
 *   sync:push      push local changes of a synced project
 *   sync:set-mode  automatic or manual
 *   sync:preflight upload size + is the project on the server (turn-on dialog)
 *   sync:activity  changes waiting on the server for this copy (chip count, sync on open)
 *   sync:server-project / sync:server-projects / sync:prompt-answer / sync:compare / sync:link / sync:open-remote
 *                  projects already on the server: one-time prompt, Open Remote Project, linking
 *   sync:pull      fetch and merge the server's changes; returns what the
 *                  app must apply to its store (kept pending in memory)
 *   sync:pull-commit  after the app applied them and saved project.json:
 *                  record the pull (base, lastSeq, conflicts, downloads)
 *   sync:pull-discard drop a pending pull (the user edited meanwhile)
 *   sync:download  fetch files a pull brought (originals, thumbnails, attachments);
 *                  runs beside pushes and pulls, see download()
 *   sync:clone     make a synced copy of a server project on this computer
 *   sync:members / sync:change-members   the open synced project's
 *                  collaborators: list, invite, role, remove (Phase 2, 17a)
 *   sync:invites / sync:answer-invite   invitations waiting for me (17f)
 *   sync:decisions what waits for the user (conflicts, delete questions,
 *                  changes the server turned down), for the dialog
 *   sync:decide    work out one answer; returns what the app must apply
 *   sync:decide-commit / sync:decide-discard   record it after the app
 *                  applied it and saved project.json, or drop it
 *   sync:test-other / sync:test-compare   dev and -dev. builds only: push
 *                  as another computer, compare with the server (testTools.js)
 * Events to the renderer:
 *   sync:progress      { projectId, phase, ... } while pushing
 *   sync:local-change  projectId, after a file-only change (point counts,
 *                      composite thumbnails) the renderer cannot see
 *
 * A local-only project is recognized by the missing sync/state.json and
 * never loads the sync engine (spec v3 §3.4). Work on one project runs one
 * call at a time, so pushes never overlap. Sync runs only when the logged-in
 * account and the configured server match the copy's binding (§11.3).
 * Failures come back as { ok: false, kind, message } (no exceptions over
 * IPC); kinds: offline, server, auth, disabled, old_server, account,
 * wrong_server, exists, not_synced, error.
 */

const fs = require('fs');
const path = require('path');
const log = require('electron-log');
const projectFolders = require('../projectFolders');
const tokenService = require('../tokenService');

/** @type {null | { syncEngine: typeof import('./syncEngine'), sidecar: typeof import('./sidecar'), client: typeof import('./client'), pull: typeof import('./pull'), decisions: typeof import('./decisions'), link: typeof import('./link') }} */
let engine = null;

/** The sync modules, loaded on first use by a synced project. */
function loadEngine() {
  if (!engine) {
    engine = {
      syncEngine: require('./syncEngine'),
      sidecar: require('./sidecar'),
      client: require('./client'),
      pull: require('./pull'),
      decisions: require('./decisions'),
      link: require('./link'),
    };
  }
  return engine;
}

function isSyncedFolder(folder) {
  return fs.existsSync(path.join(folder, 'sync', 'state.json'));
}

/** projectId => tail of its queue of sync calls */
const queues = new Map();

/**
 * Run fn after the project's earlier sync calls finished.
 * @template T
 * @param {string} projectId
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
function serialize(projectId, fn) {
  const prev = queues.get(projectId) || Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.catch(() => {});
  queues.set(projectId, tail);
  tail.then(() => {
    if (queues.get(projectId) === tail) queues.delete(projectId);
  });
  return run;
}

function sameServer(a, b) {
  const norm = (u) => String(u || '').trim().replace(/\/+$/, '').toLowerCase();
  return norm(a) === norm(b);
}

/**
 * A sync client whose token comes from tokenService. No login = null
 * (SyncError auth); server unreachable = SyncError offline.
 * @param {string} restServer
 */
function makeClient(restServer) {
  const { createSyncClient, SyncError } = loadEngine().client;
  const tokenFrom = (r) => {
    if (r.success && r.accessToken) return r.accessToken;
    if (r.sessionExpired) return null;
    if (r.unreachable) throw new SyncError('offline', r.error || 'Could not reach the StraboSpot server');
    throw new SyncError('server', r.error || 'Could not refresh the login');
  };
  return createSyncClient({
    restServer,
    getAccessToken: async () => tokenFrom(await tokenService.getValidAccessToken(restServer)),
    refreshAccessToken: async () => tokenFrom(await tokenService.refreshAccessToken(restServer)),
  });
}

/**
 * Why sync cannot run for this binding right now, or null.
 * @param {{ server: string, pkey: number | string, email: string }} binding
 * @param {string} restServer
 */
async function bindingProblem(binding, restServer) {
  if (!sameServer(binding.server, restServer)) {
    return {
      kind: 'wrong_server',
      message: `This project syncs with ${binding.server}, but the app is set to ${restServer} (Preferences).`,
    };
  }
  const tokens = await tokenService.getTokens();
  if (!tokens || !tokens.user) {
    return { kind: 'auth', message: `Log in as ${binding.email} to sync this project.` };
  }
  if (String(tokens.user.pkey) !== String(binding.pkey)) {
    return {
      kind: 'account',
      message: `This copy belongs to ${binding.email}. Log in as ${binding.email} to sync it.`,
    };
  }
  return null;
}

/** A thrown error as an IPC failure result. */
function failure(err) {
  const { SyncError } = loadEngine().client;
  if (err instanceof SyncError) {
    log.warn(`[Sync] ${err.kind}: ${err.message}`);
    return { ok: false, kind: err.kind, message: err.message };
  }
  log.error('[Sync] Unexpected error:', err);
  return { ok: false, kind: 'error', message: err && err.message ? err.message : String(err) };
}

/**
 * @param {string} projectId
 * @param {object | null} [project] - The app's current project, to count
 *   changes not saved yet (else the saved project.json is counted)
 * @returns {Promise<{ synced: false } | { synced: true, mode: string, phase: string, server: string,
 *   email: string, pkey: string, pid: number, pending: number | null, refused: number }>}
 */
async function getStatus(projectId, project = null) {
  const folder = projectFolders.getProjectFolderPath(projectId);
  if (!isSyncedFolder(folder)) return { synced: false };
  const { sidecar, syncEngine } = loadEngine();
  const state = await sidecar.loadState(folder);
  if (!state) return { synced: false };
  let pending = null;
  try {
    pending = await syncEngine.countPendingChanges(folder, project);
  } catch (err) {
    log.warn(`[Sync] Could not count pending changes for ${projectId}: ${err.message}`);
  }
  return {
    synced: true,
    mode: state.mode,
    phase: state.phase,
    server: state.binding.server,
    email: state.binding.email,
    pkey: String(state.binding.pkey),
    pid: state.binding.pid,
    pending,
    refused: Array.isArray(state.refused) ? state.refused.length : 0,
    conflicts: Object.keys(state.conflicts || {}).length,
    questions: (state.questions || []).length,
    downloads: Object.keys(state.downloads || {}).length,
  };
}

/**
 * What the turn-on dialog needs before sync is turned on (spec v3 16aj):
 * the upload size, and, when logged in, whether the server can sync and
 * already has this project (then linking is needed, step 8 stage 4).
 * Not queued with the project's sync calls: it only reads.
 * @param {string} projectId
 * @param {string} restServer
 */
async function preflight(projectId, restServer) {
  try {
    const folder = projectFolders.getProjectFolderPath(projectId);
    if (isSyncedFolder(folder)) return { ok: false, kind: 'exists', message: 'This project is already synced.' };
    const bytes = await loadEngine().syncEngine.estimateUploadBytes(folder);
    const tokens = await tokenService.getTokens();
    if (!tokens || !tokens.user) return { ok: true, bytes, loggedIn: false, problem: null, onServer: null };
    try {
      const list = await makeClient(restServer).listProjects({ includeLegacy: true });
      const row = (Array.isArray(list) ? list : []).find((p) => p && p.straboId === projectId);
      const onServer = row ? { pid: row.pid, syncFormat: row.syncFormat, syncState: row.syncState, updatedAt: row.updatedAt } : null;
      return { ok: true, bytes, loggedIn: true, problem: null, onServer };
    } catch (err) {
      const f = failure(err);
      return { ok: true, bytes, loggedIn: true, problem: { kind: f.kind, message: f.message }, onServer: null };
    }
  } catch (err) {
    return failure(err);
  }
}

/**
 * Turn sync on for a local-only project that is not loaded (the folder
 * moves). The first upload is left to the first push.
 * @param {string} projectId
 * @param {string} restServer
 * @param {'automatic' | 'manual'} mode
 */
function turnOn(projectId, restServer, mode) {
  return serialize(projectId, async () => {
    serverListCache = null; // the server is about to have this project
    try {
      const tokens = await tokenService.getTokens();
      if (!tokens || !tokens.user) return { ok: false, kind: 'auth', message: 'Log in to sync this project.' };
      const client = makeClient(restServer);
      await client.ping();
      const result = await loadEngine().syncEngine.turnSyncOn({
        projectId,
        restServer,
        user: { pkey: Number(tokens.user.pkey), email: tokens.user.email },
        mode: mode === 'manual' ? 'manual' : 'automatic',
        client,
        push: false,
      });
      if (result.status === 'exists') {
        return {
          ok: false,
          kind: 'exists',
          message: 'This project is already on the StraboSpot server. Linking a local copy to it is not available yet.',
        };
      }
      return { ok: true, folder: result.folder, pid: result.pid };
    } catch (err) {
      return failure(err);
    }
  });
}

/**
 * Push the saved project.json and files of a synced project.
 * @param {string} projectId
 * @param {string} restServer
 * @param {(p: object) => void} onProgress
 */
function push(projectId, restServer, onProgress) {
  return serialize(projectId, async () => {
    const folder = projectFolders.getProjectFolderPath(projectId);
    if (!isSyncedFolder(folder)) return { ok: false, kind: 'not_synced', message: 'This project is not synced.' };
    try {
      const { sidecar, syncEngine } = loadEngine();
      const state = await sidecar.loadState(folder);
      if (!state) return { ok: false, kind: 'not_synced', message: 'This project is not synced.' };
      const problem = await bindingProblem(state.binding, restServer);
      if (problem) return { ok: false, ...problem };
      const started = Date.now();
      const r = await syncEngine.pushProject({ folder, client: makeClient(restServer), onProgress });
      if (r.pushed || r.filesUploaded || r.problems.length) {
        log.info(`[Sync] Pushed ${projectId}: ${r.pushed} changes, ${r.filesUploaded} files, ` +
          `${r.problems.length} not accepted (${Date.now() - started} ms)`);
      }
      return {
        ok: true, pushed: r.pushed, filesUploaded: r.filesUploaded, notAccepted: r.problems.length,
        conflicts: r.conflicts, restored: r.restored, ready: r.ready,
      };
    } catch (err) {
      return failure(err);
    }
  });
}

/**
 * Changes waiting on the server for this copy (spec v3 16ah): the activity
 * poll since the last pull, without this computer's own pushes. Read-only,
 * so not queued with the project's sync calls. Phase 1 uses the count only.
 * @param {string} projectId
 * @param {string} restServer
 * @param {'active' | 'away'} [presence]
 */
async function activity(projectId, restServer, presence = 'active') {
  const folder = projectFolders.getProjectFolderPath(projectId);
  if (!isSyncedFolder(folder)) return { ok: false, kind: 'not_synced', message: 'This project is not synced.' };
  try {
    const { sidecar, syncEngine } = loadEngine();
    const state = await sidecar.loadState(folder);
    if (!state) return { ok: false, kind: 'not_synced', message: 'This project is not synced.' };
    const problem = await bindingProblem(state.binding, restServer);
    if (problem) return { ok: false, ...problem };
    const r = await makeClient(restServer).activity(state.binding.pid, {
      since: state.lastSeq || 0,
      clientId: syncEngine.getClientId(),
      state: presence === 'away' ? 'away' : 'active',
    });
    const pending = r && Array.isArray(r.pending) ? r.pending : [];
    const me = String(state.binding.pkey);
    const others = pending
      .filter((p) => p && p.user && String(p.user.pkey) !== me)
      .map((p) => ({ name: (p.user && p.user.name) || 'Someone', count: Number(p.count) || 0 }));
    const incoming = pending.reduce((sum, p) => sum + (Number(p && p.count) || 0), 0);
    return { ok: true, incoming, others };
  } catch (err) {
    return failure(err);
  }
}

// ---------------------------------------------------------------------------
// Projects already on the server (spec v3 §3.5, 16an to 16ao)
// ---------------------------------------------------------------------------

/** How long the list of my server projects is reused (16q) */
const SERVER_LIST_MAX_AGE_MS = 5 * 60_000;
/** @type {{ key: string, at: number, rows: object[] } | null} */
let serverListCache = null;

/** userData/sync-prompts.json: projectId => the one-time prompt's answer (16r) */
function promptsFile() {
  return path.join(require('electron').app.getPath('userData'), 'sync-prompts.json');
}

async function readPrompts() {
  try {
    const data = JSON.parse(await fs.promises.readFile(promptsFile(), 'utf8'));
    return data && typeof data === 'object' ? data : {};
  } catch (_) {
    return {};
  }
}

/**
 * Record the one-time prompt's answer for a project ('automatic' | 'manual' | 'local').
 * @param {string} projectId
 * @param {string} answer
 */
async function setPromptAnswer(projectId, answer) {
  if (!['automatic', 'manual', 'local'].includes(answer)) return { ok: false, kind: 'error', message: 'Unknown answer' };
  const prompts = await readPrompts();
  prompts[projectId] = answer;
  const { writeFileAtomic } = require('../atomicFile');
  await writeFileAtomic(promptsFile(), JSON.stringify(prompts, null, 2));
  return { ok: true };
}

/**
 * My server projects (all formats), from the cache unless older than
 * SERVER_LIST_MAX_AGE_MS or refresh is asked for. Null when logged out.
 * @param {string} restServer
 * @param {{ refresh?: boolean }} [options]
 */
async function myServerProjects(restServer, { refresh = false } = {}) {
  const tokens = await tokenService.getTokens();
  if (!tokens || !tokens.user) return null;
  const key = `${String(restServer).trim().replace(/\/+$/, '').toLowerCase()}|${tokens.user.pkey}`;
  if (!refresh && serverListCache && serverListCache.key === key && Date.now() - serverListCache.at < SERVER_LIST_MAX_AGE_MS) {
    return serverListCache.rows;
  }
  const rows = await makeClient(restServer).listProjects({ includeLegacy: true });
  serverListCache = { key, at: Date.now(), rows: Array.isArray(rows) ? rows : [] };
  return serverListCache.rows;
}

/** A server row as the app sees it */
function serverRow(r) {
  return {
    pid: r.pid, straboId: r.straboId, name: r.name, role: r.role, syncFormat: r.syncFormat,
    syncState: r.syncState, updatedAt: r.updatedAt || null, owner: r.owner || null,
  };
}

/**
 * The server project with this local-only project's id, and the one-time
 * prompt's answer, for the prompt on open (16an). row is null when the
 * server has none, the project is synced already, or the user is logged out.
 * @param {string} projectId
 * @param {string} restServer
 */
async function serverProject(projectId, restServer) {
  try {
    const answer = (await readPrompts())[projectId] || null;
    if (isSyncedFolder(projectFolders.getProjectFolderPath(projectId))) return { ok: true, row: null, answer };
    const rows = await myServerProjects(restServer);
    // Only my own server project can be this local copy's: a project shared
    // with me under the same id is someone else's (a share-code copy, 17b)
    const row = rows && rows.find((r) => r && r.straboId === projectId && r.role === 'owner');
    return { ok: true, row: row ? serverRow(row) : null, answer };
  } catch (err) {
    return failure(err);
  }
}

/**
 * My server projects for Open Remote Project (16ao), each with what this
 * computer has: 'synced' (my synced copy), 'local' (a local-only copy) or null.
 * @param {string} restServer
 */
async function listServerProjects(restServer) {
  try {
    const rows = await myServerProjects(restServer, { refresh: true });
    if (rows === null) return { ok: false, kind: 'auth', message: 'Log in to see your projects on StraboSpot.' };
    const tokens = await tokenService.getTokens();
    const pkey = tokens && tokens.user ? tokens.user.pkey : null;
    const projects = rows.filter(Boolean).map((r) => {
      const mine = projectFolders.getAccountCopyPath(r.straboId, restServer, pkey);
      // A local-only copy counts only for my own projects (17b): never offer
      // to connect it to a project someone shared with me
      const here = fs.existsSync(path.join(mine, 'project.json')) ? 'synced'
        : r.role === 'owner' && fs.existsSync(path.join(projectFolders.getStraboMicro2DataPath(), r.straboId, 'project.json')) ? 'local' : null;
      return { ...serverRow(r), here };
    });
    return { ok: true, projects };
  } catch (err) {
    return failure(err);
  }
}

/**
 * Local-only projects the intro dialog offers to sync (16aq): those whose id
 * the server does not have (projects it has get the one-time prompt when
 * opened, 16an), with their upload size. Fails (logged out, offline, sync
 * switched off on the server) rather than guessing, so the intro waits.
 * @param {string} restServer
 */
async function introCandidates(restServer) {
  try {
    const rows = await myServerProjects(restServer, { refresh: true });
    if (rows === null) return { ok: false, kind: 'auth', message: 'Log in to sync projects.' };
    const onServer = new Set(rows.filter(Boolean).map((r) => r.straboId));
    const projects = [];
    for (const id of await projectFolders.listProjectFolders()) {
      if (onServer.has(id)) continue;
      const folder = path.join(projectFolders.getStraboMicro2DataPath(), id);
      let name;
      try {
        const project = JSON.parse(await fs.promises.readFile(path.join(folder, 'project.json'), 'utf8'));
        if (!project || project.id !== id) continue;
        name = project.name || 'Untitled Project';
      } catch (_) {
        continue; // not a project folder (e.g. _replaced)
      }
      const bytes = await loadEngine().syncEngine.estimateUploadBytes(folder).catch(() => null);
      projects.push({ id, name, bytes });
    }
    projects.sort((a, b) => a.name.localeCompare(b.name));
    return { ok: true, projects };
  } catch (err) {
    return failure(err);
  }
}

/**
 * The local-only copy vs the converted server project (read-only, 16s).
 * @param {string} projectId
 * @param {string} restServer
 * @param {number} pid
 * @param {(p: object) => void} onProgress
 */
async function compare(projectId, restServer, pid, onProgress) {
  try {
    const r = await loadEngine().link.compareWithServer({ projectId, pid, client: makeClient(restServer), onProgress });
    return { ok: true, ...r };
  } catch (err) {
    return failure(err);
  }
}

/** The signed-in user, or an auth failure */
async function signedInUser() {
  const tokens = await tokenService.getTokens();
  if (!tokens || !tokens.user) return { failure: { ok: false, kind: 'auth', message: 'Log in to sync this project.' } };
  return { user: tokens.user };
}

/** The local project into version history (before the server's copy replaces it) */
async function saveLocalVersion(projectId, label) {
  const versionHistory = require('../versionHistory');
  const { loadProjectJson } = require('../projectSerializer');
  await versionHistory.createVersion(projectId, await loadProjectJson(projectId), label, null);
}

/**
 * Link a local-only copy (not loaded) to the server project pid (16an, 16am):
 * converted rows link with mine or theirs; legacy rows are adopted, theirs
 * first replacing the local copy with the server's upload (the local folder
 * is set aside in StraboMicro2Data/_replaced, since the import clears
 * version history).
 * @param {string} projectId
 * @param {string} restServer
 * @param {number} pid
 * @param {'automatic' | 'manual'} mode
 * @param {'mine' | 'theirs'} use
 * @param {(p: object) => void} onProgress
 */
function link(projectId, restServer, pid, mode, use, onProgress) {
  return serialize(projectId, async () => {
    try {
      if (mode !== 'automatic' && mode !== 'manual') return { ok: false, kind: 'error', message: 'Unknown sync mode' };
      if (use !== 'mine' && use !== 'theirs') return { ok: false, kind: 'error', message: 'Unknown choice' };
      if (isSyncedFolder(projectFolders.getProjectFolderPath(projectId))) {
        return { ok: false, kind: 'exists', message: 'This project is already synced.' };
      }
      const { user, failure: noUser } = await signedInUser();
      if (noUser) return noUser;
      const client = makeClient(restServer);
      const rows = await myServerProjects(restServer, { refresh: true });
      const row = (rows || []).find((r) => r && r.pid === pid && r.straboId === projectId);
      if (!row) return { ok: false, kind: 'error', message: 'This project is not on StraboSpot any more.' };
      const { link: linker } = loadEngine();
      let folder;
      if (row.syncFormat === 'legacy') {
        if (use === 'theirs') await importLegacyUpload(projectId, restServer, onProgress, { setAside: true });
        folder = (await linker.adoptLegacy({ projectId, pid, restServer, user, mode, client })).folder;
      } else {
        folder = (await linker.linkToServer({
          projectId, pid, restServer, user, mode, use, client, onProgress,
          saveVersion: saveLocalVersion,
        })).folder;
      }
      serverListCache = null;
      return { ok: true, folder, adopted: row.syncFormat === 'legacy' };
    } catch (err) {
      return failure(err);
    }
  });
}

/**
 * A legacy row's upload (the old door, on the configured server), imported
 * as a local-only copy. setAside: "Use the server copy", the local folder is
 * set aside first (renamed into StraboMicro2Data/_replaced, nothing deleted).
 */
async function importLegacyUpload(projectId, restServer, onProgress, { setAside = false } = {}) {
  const serverDownload = require('../serverDownload');
  const smzImport = require('../smzImport');
  const token = await tokenService.getValidAccessToken(restServer);
  if (!token.success) throw new Error(token.error || 'Log in to download the StraboSpot copy.');
  // The old door finds a project by its id (strabo_id), not the server project number
  const dl = await serverDownload.downloadProject(projectId, token.accessToken,
    (p) => onProgress({ phase: 'download', item: p.message }), restServer);
  if (!dl.success) {
    // The old door answers 404 when the project has no upload file on the server
    throw new Error(dl.error === 'Project not found on server.'
      ? 'StraboSpot has no file for this project, so it cannot be downloaded. Its upload may never have finished.'
      : dl.error || 'The StraboSpot copy could not be downloaded.');
  }
  try {
    const inspect = await smzImport.inspectSmz(dl.zipPath);
    if (!inspect.success || inspect.projectId !== projectId) throw new Error('The StraboSpot copy is a different project.');
    const local = path.join(projectFolders.getStraboMicro2DataPath(), projectId);
    let aside = null;
    if (setAside) {
      aside = path.join(projectFolders.getStraboMicro2DataPath(), '_replaced', `${projectId}-${new Date().toISOString().replace(/[:.]/g, '-')}`);
      await fs.promises.mkdir(path.dirname(aside), { recursive: true });
      await fs.promises.rename(local, aside);
      log.info(`[Sync] Local copy of ${projectId} set aside in ${aside} before using the StraboSpot copy`);
    } else if (fs.existsSync(local)) {
      throw new Error('This computer already has a copy of this project.');
    }
    const imp = await smzImport.importSmz(dl.zipPath, (p) => onProgress({ phase: 'download', item: p.detail }));
    if (!imp.success) {
      if (aside) {
        // Put the local copy back
        await fs.promises.rm(local, { recursive: true, force: true }).catch(() => {});
        await fs.promises.rename(aside, local);
      }
      throw new Error(imp.error || 'The StraboSpot copy could not be imported.');
    }
  } finally {
    await serverDownload.cleanupDownload(dl.zipPath).catch(() => {});
  }
}

/** How long a set-aside copy (_replaced) is kept for rescue by hand */
const REPLACED_KEEP_DAYS = 30;

/**
 * Remove copies set aside by "Use the StraboSpot copy" (StraboMicro2Data/
 * _replaced/<projectId>-<time>) once they are older than REPLACED_KEEP_DAYS.
 * The age comes from the time in the folder name; folders without one are
 * left alone. Runs at startup.
 * @returns {Promise<string[]>} Removed folder names
 */
async function cleanupReplaced(now = Date.now()) {
  const dir = path.join(projectFolders.getStraboMicro2DataPath(), '_replaced');
  let names;
  try {
    names = await fs.promises.readdir(dir);
  } catch (_) {
    return []; // nothing set aside
  }
  const removed = [];
  for (const name of names) {
    const m = /(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/.exec(name);
    if (!m) continue;
    const at = Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`);
    if (!Number.isFinite(at) || now - at < REPLACED_KEEP_DAYS * 24 * 3600 * 1000) continue;
    try {
      await fs.promises.rm(path.join(dir, name), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      removed.push(name);
      log.info(`[Sync] Removed ${name} from _replaced (set aside more than ${REPLACED_KEEP_DAYS} days ago)`);
    } catch (err) {
      log.warn(`[Sync] Could not remove ${name} from _replaced: ${err.message}`);
    }
  }
  return removed;
}

/** projectId => the pull waiting for the app to apply it */
const pendingPulls = new Map();

/** Shared checks of pull and download: synced folder, state, binding. */
async function openSynced(projectId, restServer) {
  const folder = projectFolders.getProjectFolderPath(projectId);
  if (!isSyncedFolder(folder)) return { failure: { ok: false, kind: 'not_synced', message: 'This project is not synced.' } };
  const state = await loadEngine().sidecar.loadState(folder);
  if (!state) return { failure: { ok: false, kind: 'not_synced', message: 'This project is not synced.' } };
  const problem = await bindingProblem(state.binding, restServer);
  if (problem) return { failure: { ok: false, ...problem } };
  return { folder, state };
}

/**
 * Fetch and merge the server's changes. The result's changes are entity
 * changes in the app's form, for the store's applyRemoteChanges.
 * @param {string} projectId
 * @param {string} restServer
 * @param {(p: object) => void} onProgress
 */
function pull(projectId, restServer, onProgress) {
  return serialize(projectId, async () => {
    try {
      const opened = await openSynced(projectId, restServer);
      if (opened.failure) return opened.failure;
      const r = await loadEngine().pull.preparePull({ folder: opened.folder, client: makeClient(restServer), onProgress });
      pendingPulls.set(projectId, { folder: opened.folder, pending: r.pending });
      return { ok: true, pullId: r.pending.id, changes: r.storeChanges, summary: r.summary };
    } catch (err) {
      return failure(err);
    }
  });
}

/**
 * @param {string} projectId
 * @param {string} pullId
 */
function commitPull(projectId, pullId) {
  return serialize(projectId, async () => {
    const entry = pendingPulls.get(projectId);
    if (!entry || entry.pending.id !== pullId) {
      return { ok: false, kind: 'error', message: 'No such pull to finish (it was replaced or discarded).' };
    }
    pendingPulls.delete(projectId);
    try {
      const r = await loadEngine().pull.commitPull({ folder: entry.folder, pending: entry.pending });
      const s = entry.pending;
      log.info(`[Sync] Pulled ${projectId}: ${s.theirs.length} changes received, seq ${s.since} -> ${s.headSeq}, ` +
        `${Object.keys(s.conflicts).length} conflicts, ${s.questions.length} delete questions, ${r.downloads} files to download`);
      return { ok: true, downloads: r.downloads };
    } catch (err) {
      return failure(err);
    }
  });
}

/** @param {string} projectId @param {string} pullId */
function discardPull(projectId, pullId) {
  const entry = pendingPulls.get(projectId);
  if (entry && entry.pending.id === pullId) pendingPulls.delete(projectId);
  return { ok: true };
}

/**
 * @param {string} projectId
 * @param {string} restServer
 * @param {(p: object) => void} onProgress
 */
function download(projectId, restServer, onProgress) {
  // Its own queue: transfers do not hold up pushes and pulls; only reading
  // and recording state.json join the sync queue (downloadFiles' exclusive)
  return serialize(`download:${projectId}`, async () => {
    try {
      const opened = await openSynced(projectId, restServer);
      if (opened.failure) return opened.failure;
      const r = await loadEngine().pull.downloadFiles({
        folder: opened.folder,
        client: makeClient(restServer),
        onProgress,
        exclusive: (fn) => serialize(projectId, fn),
      });
      if (r.downloaded > 0) log.info(`[Sync] Downloaded ${r.downloaded} files for ${projectId}`);
      return { ok: true, downloaded: r.downloaded, images: r.images, thumbnails: r.thumbnails };
    } catch (err) {
      return failure(err);
    }
  });
}

/**
 * Make a synced copy of a server project (synced from another computer).
 * @param {number} pid - Server project id
 * @param {string} restServer
 * @param {'automatic' | 'manual'} mode
 * @param {(p: object) => void} onProgress
 */
function clone(pid, restServer, mode, onProgress) {
  return serialize(`clone:${pid}`, async () => {
    try {
      if (!Number.isInteger(pid) || pid <= 0) return { ok: false, kind: 'error', message: 'Not a server project number.' };
      const tokens = await tokenService.getTokens();
      if (!tokens || !tokens.user) return { ok: false, kind: 'auth', message: 'Log in to download a synced project.' };
      const client = makeClient(restServer);
      await client.ping();
      const r = await loadEngine().pull.cloneProject({
        pid, restServer, user: { pkey: tokens.user.pkey, email: tokens.user.email },
        mode: mode === 'manual' ? 'manual' : 'automatic', client, onProgress,
      });
      return { ok: true, projectId: r.projectId, downloaded: r.downloaded };
    } catch (err) {
      return failure(err);
    }
  });
}

/**
 * Open Remote Project (16ao) for a project this computer has no copy of:
 * a converted project becomes a synced copy (clone); a legacy one is
 * downloaded, imported and adopted (P1-1), its first upload left to the
 * first sync.
 * @param {number} pid
 * @param {string} restServer
 * @param {'automatic' | 'manual'} mode
 * @param {(p: object) => void} onProgress
 */
async function openRemote(pid, restServer, mode, onProgress) {
  try {
    const rows = await myServerProjects(restServer, { refresh: true });
    if (rows === null) return { ok: false, kind: 'auth', message: 'Log in to download projects from StraboSpot.' };
    const row = rows.find((r) => r && r.pid === pid);
    if (!row) return { ok: false, kind: 'error', message: 'This project is not on StraboSpot any more.' };
    if (row.syncFormat !== 'legacy') {
      const r = await clone(pid, restServer, mode, onProgress);
      return r.ok ? { ok: true, projectId: r.projectId, adopted: false } : r;
    }
    await importLegacyUpload(row.straboId, restServer, onProgress);
    const linked = await link(row.straboId, restServer, pid, mode, 'mine', onProgress);
    return linked.ok ? { ok: true, projectId: row.straboId, adopted: true } : linked;
  } catch (err) {
    return failure(err);
  }
}

/**
 * The server project number of a synced project whose binding matches the
 * login and server, or a failure result.
 * @param {string} projectId
 * @param {string} restServer
 * @returns {Promise<{ ok: true, pid: number } | { ok: false, kind: string, message: string }>}
 */
async function boundPid(projectId, restServer) {
  const folder = projectFolders.getProjectFolderPath(projectId);
  const state = isSyncedFolder(folder) ? await loadEngine().sidecar.loadState(folder) : null;
  if (!state) return { ok: false, kind: 'not_synced', message: 'This project is not synced with StraboSpot.' };
  const problem = await bindingProblem(state.binding, restServer);
  if (problem) return { ok: false, ...problem };
  return { ok: true, pid: Number(state.binding.pid) };
}

/** A members answer as an IPC result: 2xx data, or the server's reason for a 4xx. */
function memberResult(r) {
  if (r.status >= 200 && r.status < 300) return { ok: true, ...(r.data || {}) };
  const data = r.data && typeof r.data === 'object' ? r.data : {};
  return { ok: false, kind: data.error || 'refused', message: data.message || `The server refused this (${r.status}).` };
}

/** Collaborators of the open synced project (Phase 2, 17a). */
async function members(projectId, restServer) {
  try {
    const b = await boundPid(projectId, restServer);
    if (!b.ok) return b;
    return { ok: true, ...(await makeClient(restServer).members(b.pid)) };
  } catch (err) {
    return failure(err);
  }
}

/**
 * Change the collaborators of the open synced project (owner):
 * action invite {email, role}, role {pkey, role}, remove {pkey}.
 * @param {string} projectId
 * @param {string} restServer
 * @param {{ action: 'invite' | 'role' | 'remove', email?: string, role?: string, pkey?: number }} change
 */
async function changeMembers(projectId, restServer, change) {
  try {
    const b = await boundPid(projectId, restServer);
    if (!b.ok) return b;
    const client = makeClient(restServer);
    if (change.action === 'invite') return memberResult(await client.invite(b.pid, String(change.email || ''), change.role));
    if (change.action === 'role') return memberResult(await client.setMemberRole(b.pid, Number(change.pkey), change.role));
    if (change.action === 'remove') return memberResult(await client.removeMember(b.pid, Number(change.pkey)));
    return { ok: false, kind: 'error', message: 'Unknown change.' };
  } catch (err) {
    return failure(err);
  }
}

/** Invitations (and ownership offers) waiting for the logged-in account (17f). */
async function invites(restServer) {
  try {
    const tokens = await tokenService.getTokens();
    if (!tokens || !tokens.user) return { ok: false, kind: 'auth', message: 'Log in to see your invitations.' };
    const r = await makeClient(restServer).invites();
    return { ok: true, invitations: r.invitations || [], transfers: r.transfers || [] };
  } catch (err) {
    return failure(err);
  }
}

/** Accept or decline an invitation; accepting answers { pid, straboId, name, role }. */
async function answerInvite(restServer, pid, accept) {
  try {
    const r = memberResult(await makeClient(restServer).answerInvite(Number(pid), Boolean(accept)));
    if (r.ok) serverListCache = null; // the project list changed
    return r;
  } catch (err) {
    return failure(err);
  }
}

/** The folder of a synced project, or a failure result. */
function syncedFolder(projectId) {
  const folder = projectFolders.getProjectFolderPath(projectId);
  if (!isSyncedFolder(folder)) return { failure: { ok: false, kind: 'not_synced', message: 'This project is not synced.' } };
  return { folder };
}

/** @param {string} projectId */
function listDecisions(projectId) {
  return serialize(projectId, async () => {
    const opened = syncedFolder(projectId);
    if (opened.failure) return opened.failure;
    try {
      return { ok: true, ...(await loadEngine().decisions.listDecisions(opened.folder)) };
    } catch (err) {
      return failure(err);
    }
  });
}

/** projectId => the answer waiting for the app to apply it */
const pendingDecisions = new Map();

/**
 * Work out one answer (nothing is written until decideCommit).
 * @param {string} projectId
 * @param {object} decision
 */
function decide(projectId, decision) {
  return serialize(projectId, async () => {
    const opened = syncedFolder(projectId);
    if (opened.failure) return opened.failure;
    if (!decision || typeof decision !== 'object') return { ok: false, kind: 'error', message: 'No decision given' };
    try {
      const r = await loadEngine().decisions.prepareDecision(opened.folder, decision);
      pendingDecisions.set(projectId, { folder: opened.folder, pending: r.pending });
      return { ok: true, decisionId: r.id, changes: r.storeChanges, undoable: r.undoable };
    } catch (err) {
      return failure(err);
    }
  });
}

/** @param {string} projectId @param {string} decisionId */
function decideCommit(projectId, decisionId) {
  return serialize(projectId, async () => {
    const entry = pendingDecisions.get(projectId);
    if (!entry || entry.pending.id !== decisionId) {
      return { ok: false, kind: 'error', message: 'No such decision to finish (it was replaced or discarded).' };
    }
    pendingDecisions.delete(projectId);
    try {
      const r = await loadEngine().decisions.commitDecision(entry.folder, entry.pending);
      const d = entry.pending.decision;
      log.info(`[Sync] Decided ${projectId}: ${d.kind} ${d.key} ${d.answer || Object.values(d.choices || {}).join(',')}`);
      return { ok: true, downloads: r.downloads };
    } catch (err) {
      return failure(err);
    }
  });
}

/** @param {string} projectId @param {string} decisionId */
function decideDiscard(projectId, decisionId) {
  const entry = pendingDecisions.get(projectId);
  if (entry && entry.pending.id === decisionId) pendingDecisions.delete(projectId);
  return { ok: true };
}

/**
 * Dev test tool: push changes as another computer of the same account.
 * @param {string} projectId
 * @param {string} restServer
 * @param {object[]} changes
 */
function testOther(projectId, restServer, changes) {
  return serialize(projectId, async () => {
    try {
      const opened = await openSynced(projectId, restServer);
      if (opened.failure) return opened.failure;
      const results = await require('./testTools').otherComputerPush({
        folder: opened.folder, client: makeClient(restServer), changes: Array.isArray(changes) ? changes : [],
      });
      log.info(`[Sync] Test: other computer pushed ${results.length} changes: ${results.map((r) => r.status).join(', ')}`);
      return { ok: true, results };
    } catch (err) {
      return failure(err);
    }
  });
}

/**
 * Dev test tool: the saved project vs the server.
 * @param {string} projectId
 * @param {string} restServer
 */
function testCompare(projectId, restServer) {
  return serialize(projectId, async () => {
    try {
      const opened = await openSynced(projectId, restServer);
      if (opened.failure) return opened.failure;
      return { ok: true, ...(await require('./testTools').compareWithServer({ folder: opened.folder, client: makeClient(restServer) })) };
    } catch (err) {
      return failure(err);
    }
  });
}

/**
 * @param {string} projectId
 * @param {'automatic' | 'manual'} mode
 */
function setMode(projectId, mode) {
  return serialize(projectId, async () => {
    if (mode !== 'automatic' && mode !== 'manual') return { ok: false, kind: 'error', message: `Unknown sync mode ${mode}` };
    const folder = projectFolders.getProjectFolderPath(projectId);
    if (!isSyncedFolder(folder)) return { ok: false, kind: 'not_synced', message: 'This project is not synced.' };
    try {
      const { sidecar } = loadEngine();
      const state = await sidecar.loadState(folder);
      if (!state) return { ok: false, kind: 'not_synced', message: 'This project is not synced.' };
      state.mode = mode;
      await sidecar.saveState(folder, state);
      log.info(`[Sync] ${projectId} now syncs ${mode === 'automatic' ? 'automatically' : 'when the user clicks Sync'}`);
      return { ok: true };
    } catch (err) {
      return failure(err);
    }
  });
}

/** @type {() => (import('electron').BrowserWindow | null)} */
let getWindow = () => null;

function send(channel, payload) {
  const win = getWindow();
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

/**
 * Tell the renderer that a synced project changed on disk in a way the
 * project in its store does not show. No-op for local-only projects.
 * @param {string} projectId
 */
function notifyLocalChange(projectId) {
  if (!projectId || typeof projectId !== 'string') return;
  if (!isSyncedFolder(projectFolders.getProjectFolderPath(projectId))) return;
  send('sync:local-change', projectId);
}

/**
 * @param {import('electron').IpcMain} ipcMain
 * @param {() => (import('electron').BrowserWindow | null)} getMainWindow
 * @param {{ devTools?: boolean }} [options] - devTools: register the Sync Test handlers
 */
function registerSyncIpc(ipcMain, getMainWindow, { devTools = false } = {}) {
  getWindow = getMainWindow;
  ipcMain.handle('sync:status', async (_event, projectId, project) => {
    try {
      return await getStatus(projectId, project && typeof project === 'object' ? project : null);
    } catch (err) {
      log.error('[Sync] Status failed:', err);
      return { synced: false, error: err.message };
    }
  });
  ipcMain.handle('sync:turn-on', (_event, projectId, restServer, mode) => turnOn(projectId, restServer, mode));
  ipcMain.handle('sync:push', (_event, projectId, restServer) =>
    push(projectId, restServer, (p) => send('sync:progress', { projectId, ...p })));
  ipcMain.handle('sync:activity', (_event, projectId, restServer, presence) => activity(projectId, restServer, presence));
  ipcMain.handle('sync:server-project', (_event, projectId, restServer) => serverProject(projectId, restServer));
  ipcMain.handle('sync:server-projects', (_event, restServer) => listServerProjects(restServer));
  ipcMain.handle('sync:prompt-answer', (_event, projectId, answer) => setPromptAnswer(projectId, answer));
  ipcMain.handle('sync:compare', (_event, projectId, restServer, pid) =>
    compare(projectId, restServer, pid, (p) => send('sync:progress', { projectId, ...p })));
  ipcMain.handle('sync:open-remote', (_event, pid, restServer, mode) =>
    openRemote(pid, restServer, mode, (p) => send('sync:progress', { projectId: `remote:${pid}`, ...p })));
  ipcMain.handle('sync:link', (_event, projectId, restServer, pid, mode, use) =>
    link(projectId, restServer, pid, mode, use, (p) => send('sync:progress', { projectId, ...p })));
  ipcMain.handle('sync:preflight', (_event, projectId, restServer) => preflight(projectId, restServer));
  ipcMain.handle('sync:set-mode', (_event, projectId, mode) => setMode(projectId, mode));
  ipcMain.handle('sync:pull', (_event, projectId, restServer) =>
    pull(projectId, restServer, (p) => send('sync:progress', { projectId, ...p })));
  ipcMain.handle('sync:pull-commit', (_event, projectId, pullId) => commitPull(projectId, pullId));
  ipcMain.handle('sync:pull-discard', (_event, projectId, pullId) => discardPull(projectId, pullId));
  ipcMain.handle('sync:clone', (_event, pid, restServer, mode) =>
    clone(Number(pid), restServer, mode, (p) => send('sync:progress', { projectId: `server:${pid}`, ...p })));
  ipcMain.handle('sync:download', (_event, projectId, restServer) =>
    download(projectId, restServer, (p) => send('sync:progress', { projectId, ...p })));
  ipcMain.handle('sync:members', (_event, projectId, restServer) => members(projectId, restServer));
  ipcMain.handle('sync:change-members', (_event, projectId, restServer, change) => changeMembers(projectId, restServer, change));
  ipcMain.handle('sync:invites', (_event, restServer) => invites(restServer));
  ipcMain.handle('sync:answer-invite', (_event, restServer, pid, accept) => answerInvite(restServer, pid, accept));
  ipcMain.handle('sync:decisions', (_event, projectId) => listDecisions(projectId));
  ipcMain.handle('sync:decide', (_event, projectId, decision) => decide(projectId, decision));
  ipcMain.handle('sync:decide-commit', (_event, projectId, decisionId) => decideCommit(projectId, decisionId));
  ipcMain.handle('sync:decide-discard', (_event, projectId, decisionId) => decideDiscard(projectId, decisionId));
  if (devTools) {
    ipcMain.handle('sync:test-other', (_event, projectId, restServer, changes) => testOther(projectId, restServer, changes));
    ipcMain.handle('sync:test-compare', (_event, projectId, restServer) => testCompare(projectId, restServer));
  }
}

module.exports = {
  registerSyncIpc, notifyLocalChange, getStatus, preflight, activity, serverProject, listServerProjects, introCandidates, setPromptAnswer, compare, link, openRemote, turnOn, push, setMode, pull, commitPull, discardPull, download, clone,
  listDecisions, decide, decideCommit, decideDiscard, testOther, testCompare, cleanupReplaced,
  members, changeMembers, invites, answerInvite,
};
