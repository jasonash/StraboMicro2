/**
 * Sync service (main process): the IPC side of syncing
 *
 *   sync:status    is the project synced; mode, binding, changes waiting
 *   sync:turn-on   create the server project and move the folder into the
 *                  account folder (the first upload runs as the first push)
 *   sync:push      push local changes of a synced project
 *   sync:set-mode  automatic or manual
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

/** @type {null | { syncEngine: typeof import('./syncEngine'), sidecar: typeof import('./sidecar'), client: typeof import('./client') }} */
let engine = null;

/** The sync modules, loaded on first use by a synced project. */
function loadEngine() {
  if (!engine) {
    engine = {
      syncEngine: require('./syncEngine'),
      sidecar: require('./sidecar'),
      client: require('./client'),
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
 * @returns {Promise<{ synced: false } | { synced: true, mode: string, phase: string, server: string,
 *   email: string, pkey: string, pid: number, pending: number | null, refused: number }>}
 */
async function getStatus(projectId) {
  const folder = projectFolders.getProjectFolderPath(projectId);
  if (!isSyncedFolder(folder)) return { synced: false };
  const { sidecar, syncEngine } = loadEngine();
  const state = await sidecar.loadState(folder);
  if (!state) return { synced: false };
  let pending = null;
  try {
    pending = await syncEngine.countPendingChanges(folder);
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
  };
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
      return { ok: true, pushed: r.pushed, filesUploaded: r.filesUploaded, notAccepted: r.problems.length, ready: r.ready };
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
 */
function registerSyncIpc(ipcMain, getMainWindow) {
  getWindow = getMainWindow;
  ipcMain.handle('sync:status', async (_event, projectId) => {
    try {
      return await getStatus(projectId);
    } catch (err) {
      log.error('[Sync] Status failed:', err);
      return { synced: false, error: err.message };
    }
  });
  ipcMain.handle('sync:turn-on', (_event, projectId, restServer, mode) => turnOn(projectId, restServer, mode));
  ipcMain.handle('sync:push', (_event, projectId, restServer) =>
    push(projectId, restServer, (p) => send('sync:progress', { projectId, ...p })));
  ipcMain.handle('sync:set-mode', (_event, projectId, mode) => setMode(projectId, mode));
}

module.exports = { registerSyncIpc, notifyLocalChange, getStatus, turnOn, push, setMode };
