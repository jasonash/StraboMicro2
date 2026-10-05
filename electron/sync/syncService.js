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
 *   sync:leave     leave the open synced project (17j; the app pushes first)
 *   sync:delete-project  the owner deletes the open synced project from
 *                  StraboSpot (17ac; the app pushes first)
 *   sync:history   the activity panel's list of changes, newest first (17v)
 *   sync:restore-deleted  Restore in the activity panel (17n, 17w)
 *   sync:parked / sync:review-parked  the owner's review of parked changes (17o, 17x)
 *   sync:separate  a synced copy (not loaded) becomes a separate copy with a
 *                  new id (17j keep, 17k removed)
 *   sync:permissions  my pkey, role and who created what (role checks, 17h/17i)
 *   sync:decisions what waits for the user (conflicts, delete questions,
 *                  changes the server turned down), for the dialog
 *   sync:decide    work out one answer; returns what the app must apply
 *   sync:decide-commit / sync:decide-discard   record it after the app
 *                  applied it and saved project.json, or drop it
 *   sync:test-other / sync:test-compare   dev and -dev. builds only: push
 *                  as another computer, compare with the server (testTools.js)
 *   sync:live-follow / sync:live-unfollow   the open synced project on the
 *                  live channel (live.js, 17ah-17ay): notices instead of polls
 *   sync:live-presence  my presence there (here/away, viewing, editing; 17al-17an)
 * Events to the renderer:
 *   sync:progress      { projectId, phase, ... } while pushing
 *   sync:local-change  projectId, after a file-only change (point counts,
 *                      composite thumbnails) the renderer cannot see
 *   sync:live          { projectId, kind, ... } from the live channel (live.js)
 *
 * A local-only project is recognized by the missing sync/state.json and
 * never loads the sync engine (spec v3 §3.4). Work on one project runs one
 * call at a time, so pushes never overlap. Sync runs only when the logged-in
 * account and the configured server match the copy's binding (§11.3).
 * Failures come back as { ok: false, kind, message } (no exceptions over
 * IPC); kinds: offline, server, auth, disabled, old_server, account,
 * wrong_server, exists, not_synced, access_removed (with removal), error.
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

/**
 * What the app needs when I was removed from a project or left it (17k):
 * who removed me, whether my last push was parked for the owner; or when
 * the owner deleted it from StraboSpot (17ac): who, whether it was me
 * (another of my computers), and until when it can be restored.
 * @param {any} data - The server's 403 or 410 answer
 */
function removalOf(data) {
  const d = data && typeof data === 'object' ? data : {};
  const by = d.removedBy && typeof d.removedBy === 'object' ? d.removedBy : null;
  const delBy = d.deletedBy && typeof d.deletedBy === 'object' ? d.deletedBy : null;
  return {
    left: d.left === true,
    removedBy: by ? { pkey: Number(by.pkey), name: String(by.name || '') } : null,
    parked: d.parked === true,
    projectName: d.project && typeof d.project.name === 'string' ? d.project.name : null,
    deleted: d.error === 'project_deleted'
      ? {
        byMe: d.byMe === true,
        deletedBy: delBy ? { pkey: Number(delBy.pkey), name: String(delBy.name || '') } : null,
        restorableUntil: typeof d.restorableUntil === 'string' ? d.restorableUntil : null,
      }
      : null,
  };
}

/** A thrown error as an IPC failure result. */
function failure(err) {
  const { SyncError } = loadEngine().client;
  if (err instanceof SyncError) {
    log.warn(`[Sync] ${err.kind}: ${err.message}`);
    if (err.kind === 'access_removed') {
      return { ok: false, kind: err.kind, message: err.message, removal: removalOf(err.data) };
    }
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
    // My role, kept for opening offline (Phase 2 role checks, 17h)
    const role = r && ['owner', 'editor', 'contributor', 'viewer'].includes(r.role) ? r.role : null;
    if (role && state.role !== role) {
      await serialize(projectId, async () => {
        const fresh = await sidecar.loadState(folder);
        if (fresh) await sidecar.saveState(folder, { ...fresh, role });
      });
    }
    const parkedCount = Number(r && r.parkedCount) || 0;
    return { ok: true, incoming, others, role: role ?? state.role ?? null, parkedCount };
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
      // Notice to pull (17av): how long a change took to arrive once announced
      const age = live && s.theirs.length > 0 ? live.takeNoticeAge(projectId) : null;
      if (age !== null) log.info(`[Live] ${projectId}: notice to pull ${age} ms`);
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
      // A synced copy of this server project is here already (for example
      // kept after being removed and invited again): use it; opening it
      // syncs it up
      const tokens = await tokenService.getTokens();
      const mine = tokens && tokens.user ? projectFolders.getAccountCopyPath(row.straboId, restServer, tokens.user.pkey) : null;
      if (mine && fs.existsSync(path.join(mine, 'project.json'))) {
        const state = await loadEngine().sidecar.loadState(mine);
        if (!state || Number(state.binding.pid) !== pid) {
          return {
            ok: false,
            kind: 'exists',
            message: 'This computer already has a different copy of this project in your account. Open it from Recent Projects.',
          };
        }
        projectFolders.useProjectCopy(row.straboId, mine);
        return { ok: true, projectId: row.straboId, adopted: false, existing: true };
      }
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

/**
 * What the role checks of the open synced project need (17h, 17i): my pkey,
 * my last known role (null before the first activity poll of an old copy),
 * and who created each entity ('type:id' => pkey; missing = created here).
 * @param {string} projectId
 */
async function permissions(projectId) {
  try {
    const folder = projectFolders.getProjectFolderPath(projectId);
    const state = isSyncedFolder(folder) ? await loadEngine().sidecar.loadState(folder) : null;
    if (!state) return { ok: false, kind: 'not_synced', message: 'This project is not synced with StraboSpot.' };
    return { ok: true, me: Number(state.binding.pkey), role: state.role ?? null, authors: state.authors || {} };
  } catch (err) {
    return failure(err);
  }
}

/**
 * The activity panel's page of changes (17v), newest first, before = the
 * seq of the last row shown (0 = the newest). Each row says pending: not in
 * this copy yet (after my last pull and not my own change from here).
 * @param {string} projectId
 * @param {string} restServer
 * @param {number} [before]
 */
async function history(projectId, restServer, before = 0) {
  try {
    const b = await boundPid(projectId, restServer);
    if (!b.ok) return b;
    const { sidecar, syncEngine } = loadEngine();
    const state = await sidecar.loadState(projectFolders.getProjectFolderPath(projectId));
    const r = await makeClient(restServer).briefHistory(b.pid, {
      before: Number(before) || 0, limit: 200, clientId: syncEngine.getClientId(),
    });
    const lastSeq = (state && state.lastSeq) || 0;
    const changes = (r.changes || []).map((c) => ({ ...c, pending: !c.here && c.seq > lastSeq }));
    return { ok: true, changes, more: Boolean(r.more), me: Number(state.binding.pkey) };
  } catch (err) {
    return failure(err);
  }
}

/**
 * Restore deleted items from the activity panel (17n, 17w): one restore
 * op per item, with what was deleted with it. The items come back into
 * this copy with the next pull (the app syncs right after).
 * @param {string} projectId
 * @param {string} restServer
 * @param {Array<{ type: string, id: string }>} items
 */
function restoreDeleted(projectId, restServer, items) {
  return serialize(projectId, async () => {
    try {
      const b = await boundPid(projectId, restServer);
      if (!b.ok) return b;
      const list = (Array.isArray(items) ? items : [])
        .filter((i) => i && typeof i.type === 'string' && typeof i.id === 'string')
        .map((i) => ({ op: 'restore', type: i.type, id: i.id, cascade: true }));
      if (list.length === 0) return { ok: true, results: [] };
      const { syncEngine } = loadEngine();
      const r = await makeClient(restServer).push(b.pid, require('crypto').randomUUID(), syncEngine.getClientId(), list);
      const results = (r.results || []).map((x, i) => ({
        type: list[i].type,
        id: list[i].id,
        // Restored meanwhile counts as restored
        ok: x.status === 'accepted' || (x.status === 'invalid' && x.reason === 'not_deleted'),
        status: x.status,
        reason: typeof x.reason === 'string' ? x.reason : '',
      }));
      return { ok: true, results };
    } catch (err) {
      return failure(err);
    }
  });
}

/** Parked pushes waiting for my review as the owner (17o). */
async function parked(projectId, restServer) {
  try {
    const b = await boundPid(projectId, restServer);
    if (!b.ok) return b;
    const r = await makeClient(restServer).parked(b.pid);
    return { ok: true, parked: r.parked || [] };
  } catch (err) {
    return failure(err);
  }
}

/**
 * Record decisions on a parked push (17x). Accepted keys are first marked
 * so their next push carries onBehalfOf (17y); the app has applied them to
 * the project as my own edits.
 * @param {string} projectId
 * @param {string} restServer
 * @param {number} parkedId
 * @param {Record<string, 'accepted' | 'discarded'>} decisions
 * @param {number} memberPkey - whose parked changes these are
 */
function reviewParked(projectId, restServer, parkedId, decisions, memberPkey) {
  return serialize(projectId, async () => {
    try {
      const b = await boundPid(projectId, restServer);
      if (!b.ok) return b;
      const accepted = Object.entries(decisions || {}).filter(([, d]) => d === 'accepted').map(([k]) => k);
      if (accepted.length > 0 && Number(memberPkey) > 0) {
        const { sidecar } = loadEngine();
        const folder = projectFolders.getProjectFolderPath(projectId);
        const state = await sidecar.loadState(folder);
        state.onBehalf = { ...(state.onBehalf || {}) };
        for (const k of accepted) state.onBehalf[k] = { pkey: Number(memberPkey), at: Date.now() };
        await sidecar.saveState(folder, state);
      }
      const r = await makeClient(restServer).reviewParked(b.pid, Number(parkedId), decisions);
      return { ok: true, status: r.status, left: r.left };
    } catch (err) {
      return failure(err);
    }
  });
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

/**
 * Leave the open synced project (17j): the server removes my membership.
 * The app pushes first and afterwards keeps a separate copy or deletes it.
 * @param {string} projectId
 * @param {string} restServer
 */
async function leave(projectId, restServer) {
  try {
    const b = await boundPid(projectId, restServer);
    if (!b.ok) return b;
    const folder = projectFolders.getProjectFolderPath(projectId);
    const state = await loadEngine().sidecar.loadState(folder);
    const r = memberResult(await makeClient(restServer).removeMember(b.pid, Number(state.binding.pkey)));
    if (r.ok) serverListCache = null;
    return r;
  } catch (err) {
    return failure(err);
  }
}

/**
 * Delete the open synced project from StraboSpot (owner, 17p, 17ac): the
 * server keeps it 30 days, restorable from the website; members' copies
 * become separate on their next call. The app pushes first and afterwards
 * keeps this copy as a separate one or removes it.
 * @param {string} projectId
 * @param {string} restServer
 * @returns {Promise<{ ok: true, restorableUntil: string | null } | { ok: false, kind: string, message: string }>}
 */
async function deleteProject(projectId, restServer) {
  try {
    const b = await boundPid(projectId, restServer);
    if (!b.ok) return b;
    const r = memberResult(await makeClient(restServer).deleteProject(b.pid));
    if (r.ok) {
      serverListCache = null;
      log.info(`[Sync] Deleted ${projectId} (pid ${b.pid}) from StraboSpot; restorable until ${r.restorableUntil}`);
      return { ok: true, restorableUntil: typeof r.restorableUntil === 'string' ? r.restorableUntil : null };
    }
    return r;
  } catch (err) {
    return failure(err);
  }
}

/**
 * Turn a synced copy that is not loaded into a separate local-only copy
 * with a new id (17j keep, 17k removed): projectCopies.makeSeparateCopy.
 * @param {string} projectId
 * @returns {Promise<{ ok: true, projectId: string, name: string } | { ok: false, kind: string, message: string }>}
 */
function separate(projectId) {
  return serialize(projectId, async () => {
    try {
      const folder = projectFolders.getProjectFolderPath(projectId);
      if (!isSyncedFolder(folder)) return { ok: false, kind: 'not_synced', message: 'This project is not synced.' };
      const r = await require('../projectCopies').makeSeparateCopy(projectId);
      serverListCache = null;
      return { ok: true, projectId: r.projectId, name: r.name };
    } catch (err) {
      return failure(err);
    }
  });
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

// ---------------------------------------------------------------------------
// Live channel (17ah-17ay)
// ---------------------------------------------------------------------------

/** @type {null | ReturnType<typeof import('./live').createLiveChannel>} */
let live = null;

/** The app's one live channel, made on the first follow (local-only users never open it). */
function liveChannel() {
  if (!live) {
    live = require('./live').createLiveChannel({
      getToken: async (server, { refresh }) => {
        const r = refresh ? await tokenService.refreshAccessToken(server) : await tokenService.getValidAccessToken(server);
        if (r.success && r.accessToken) return r.accessToken;
        if (r.sessionExpired) return null;
        throw new Error(r.error || 'Could not get a login token');
      },
      clientId: () => loadEngine().syncEngine.getClientId(),
      emit: (projectId, event) => send('sync:live', { projectId, ...event }),
    });
  }
  return live;
}

/**
 * Follow the open synced project on the live channel. Again after a login
 * change or when the connection is back (cuts a reconnect wait short).
 * @returns {Promise<{ ok: true, live: boolean } | { ok: false, kind: string, message: string }>}
 */
async function liveFollow(projectId, restServer) {
  try {
    const folder = projectFolders.getProjectFolderPath(projectId);
    const state = isSyncedFolder(folder) ? await loadEngine().sidecar.loadState(folder) : null;
    if (!state) return { ok: false, kind: 'not_synced', message: 'This project is not synced.' };
    const problem = await bindingProblem(state.binding, restServer);
    if (problem) return { ok: false, ...problem };
    liveChannel().follow(projectId, { server: restServer, pid: Number(state.binding.pid), pkey: state.binding.pkey });
    return { ok: true, live: liveChannel().isLive(projectId) };
  } catch (err) {
    return failure(err);
  }
}

/**
 * My presence in the open synced project (17al-17an). Only well-formed
 * values go out (a bad one would make the service close the connection).
 */
function livePresence(projectId, presence) {
  if (!presence || typeof presence !== 'object') return { ok: true };
  const target = (t) => (t && typeof t === 'object' && /^[a-z_]{1,24}$/.test(String(t.type)) && /^[A-Za-z0-9._:-]{1,100}$/.test(String(t.id))
    ? { type: String(t.type), id: String(t.id) } : null);
  liveChannel().setPresence(projectId, {
    state: presence.state === 'here' ? 'here' : 'away',
    viewing: target(presence.viewing),
    editing: target(presence.editing),
  });
  return { ok: true };
}

function liveUnfollow(projectId) {
  if (live) live.unfollow(projectId);
  return { ok: true };
}

/**
 * Login state changed (main.js auth handlers): logout closes the channel at
 * once (17as); a login connects with that account.
 * @param {{ pkey: string | number } | null} user - The logged-in account, null = logged out
 */
function liveLoginChanged(user) {
  if (!live) return;
  if (user) live.accountChanged(user.pkey);
  else live.loggedOut();
}

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
  ipcMain.handle('sync:permissions', (_event, projectId) => permissions(projectId));
  ipcMain.handle('sync:members', (_event, projectId, restServer) => members(projectId, restServer));
  ipcMain.handle('sync:change-members', (_event, projectId, restServer, change) => changeMembers(projectId, restServer, change));
  ipcMain.handle('sync:invites', (_event, restServer) => invites(restServer));
  ipcMain.handle('sync:answer-invite', (_event, restServer, pid, accept) => answerInvite(restServer, pid, accept));
  ipcMain.handle('sync:leave', (_event, projectId, restServer) => leave(projectId, restServer));
  ipcMain.handle('sync:delete-project', (_event, projectId, restServer) => deleteProject(projectId, restServer));
  ipcMain.handle('sync:history', (_event, projectId, restServer, before) => history(projectId, restServer, before));
  ipcMain.handle('sync:restore-deleted', (_event, projectId, restServer, items) => restoreDeleted(projectId, restServer, items));
  ipcMain.handle('sync:parked', (_event, projectId, restServer) => parked(projectId, restServer));
  ipcMain.handle('sync:review-parked', (_event, projectId, restServer, parkedId, decisions, memberPkey) =>
    reviewParked(projectId, restServer, parkedId, decisions, memberPkey));
  ipcMain.handle('sync:separate', (_event, projectId) => separate(projectId));
  ipcMain.handle('sync:decisions', (_event, projectId) => listDecisions(projectId));
  ipcMain.handle('sync:decide', (_event, projectId, decision) => decide(projectId, decision));
  ipcMain.handle('sync:decide-commit', (_event, projectId, decisionId) => decideCommit(projectId, decisionId));
  ipcMain.handle('sync:decide-discard', (_event, projectId, decisionId) => decideDiscard(projectId, decisionId));
  ipcMain.handle('sync:live-follow', (_event, projectId, restServer) => liveFollow(projectId, restServer));
  ipcMain.handle('sync:live-unfollow', (_event, projectId) => liveUnfollow(projectId));
  ipcMain.handle('sync:live-presence', (_event, projectId, presence) => livePresence(projectId, presence));
  if (devTools) {
    ipcMain.handle('sync:test-other', (_event, projectId, restServer, changes) => testOther(projectId, restServer, changes));
    ipcMain.handle('sync:test-compare', (_event, projectId, restServer) => testCompare(projectId, restServer));
  }
}

module.exports = {
  registerSyncIpc, notifyLocalChange, getStatus, preflight, activity, serverProject, listServerProjects, introCandidates, setPromptAnswer, compare, link, openRemote, turnOn, push, setMode, pull, commitPull, discardPull, download, clone,
  listDecisions, decide, decideCommit, decideDiscard, testOther, testCompare, cleanupReplaced,
  members, changeMembers, invites, answerInvite, permissions, leave, deleteProject, separate, history, restoreDeleted, parked, reviewParked,
  liveFollow, liveUnfollow, livePresence, liveLoginChanged,
};
