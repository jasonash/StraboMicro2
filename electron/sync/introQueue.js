/**
 * The "What's new: sync" intro (collaboration spec v3 16aq, 16ay, 16ba):
 * whether it was shown on this computer, and the background first uploads
 * of the closed projects picked in it.
 *
 * Stored in userData/sync-intro.json:
 *   { shown, shownAt, queue: { server, pkey, mode, items: [projectId], total } | null }
 *
 * The queue uploads one project at a time: turn sync on (the folder moves
 * into the account folder, only while the project is closed), then push
 * until the first upload is complete. It runs while the account that chose
 * the projects is logged in, and resumes at the next launch (each upload
 * resumes where it stopped). A project opened before its turn waits in the
 * queue until it closes; one opened after its folder moved leaves the queue,
 * and its own sync (the chip) carries the upload. No connection or server
 * trouble: retried later. Other failures drop that project (logged); it
 * stays local-only, or, if already moved, finishes when opened.
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const log = require('electron-log');
const projectFolders = require('../projectFolders');
const accounts = require('../accounts');
const syncService = require('./syncService');

const FILENAME = 'sync-intro.json';
const RETRY_MS = 60_000;
const SLOW_RETRY_MS = 10 * 60_000;
/** Pushes of one project that return without finishing the first upload, before it is dropped */
const MAX_PUSHES = 5;

/** @type {{ shown: boolean, shownAt: string | null, queue: Queue | null } | null} */
let state = null;
/** @typedef {{ server: string, pkey: string, mode: 'automatic' | 'manual', items: string[], total: number }} Queue */

let openProjectId = null;
let running = false;
let retryTimer = null;
/** The project uploading now */
let current = null;
/** Why the queue is not moving: 'login' | 'offline' | 'server' | 'open' | null */
let waiting = null;
/** The folder move under way (turning sync on), so opening that project waits for it */
let moving = null;
let send = () => {};

function filePath() {
  return path.join(app.getPath('userData'), FILENAME);
}

function load() {
  if (state) return state;
  try {
    const data = JSON.parse(fs.readFileSync(filePath(), 'utf8'));
    const q = data && data.queue;
    state = {
      shown: data && data.shown === true,
      shownAt: (data && data.shownAt) || null,
      queue: q && Array.isArray(q.items) && q.items.length > 0 && q.pkey ? q : null,
    };
  } catch (_) {
    state = { shown: false, shownAt: null, queue: null };
  }
  return state;
}

function save() {
  try {
    const target = filePath();
    fs.writeFileSync(`${target}.tmp`, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(`${target}.tmp`, target);
  } catch (err) {
    log.warn(`[SyncIntro] Could not save ${FILENAME}: ${err.message}`);
  }
}

/** What the renderer shows (the notice, the logout line) */
function status() {
  const q = load().queue;
  return {
    shown: load().shown,
    queued: q ? q.items.length : 0,
    total: q ? q.total : 0,
    done: q ? q.total - q.items.length : 0,
    items: q ? q.items.map((projectId) => ({ projectId, name: projectName(projectId) })) : [],
    current,
    waiting: q ? waiting : null,
  };
}

function notify() {
  send('sync:intro-status', status());
}

function markShown() {
  const s = load();
  s.shown = true;
  s.shownAt = new Date().toISOString();
  save();
  notify();
}

/**
 * Queue the first uploads of these closed local-only projects.
 * @param {string[]} projectIds
 * @param {'automatic' | 'manual'} mode
 * @param {string} restServer
 */
function enqueue(projectIds, mode, restServer) {
  const active = accounts.getActive();
  if (!active) return { ok: false, kind: 'auth', message: 'Log in to sync projects.' };
  const s = load();
  const same = s.queue && accounts.sameAccount(s.queue, { server: restServer, pkey: active.pkey });
  const items = same ? [...s.queue.items] : [];
  for (const id of projectIds) {
    if (typeof id === 'string' && id && !items.includes(id)) items.push(id);
  }
  const done = same ? s.queue.total - s.queue.items.length : 0;
  s.queue = items.length
    ? { server: restServer, pkey: active.pkey, mode: mode === 'manual' ? 'manual' : 'automatic', items, total: done + items.length }
    : null;
  save();
  log.info(`[SyncIntro] Queued ${projectIds.length} project(s) for their first upload`);
  notify();
  kick();
  return { ok: true };
}

function removeItem(projectId) {
  const q = load().queue;
  if (!q) return;
  q.items = q.items.filter((id) => id !== projectId);
  if (q.items.length === 0) load().queue = null;
  save();
}

function isSynced(projectId) {
  return fs.existsSync(path.join(projectFolders.getProjectFolderPath(projectId), 'sync', 'state.json'));
}

/**
 * The renderer opened a project (null: none). A queued project whose folder
 * already moved leaves the queue; one not moved yet waits until it closes.
 */
function setOpenProject(projectId) {
  openProjectId = projectId || null;
  const q = load().queue;
  if (openProjectId && q && q.items.includes(openProjectId) && isSynced(openProjectId)) {
    log.info(`[SyncIntro] ${openProjectId} opened: its own sync continues the first upload`);
    removeItem(openProjectId);
    notify();
  }
  kick();
}

function projectName(projectId) {
  try {
    const p = JSON.parse(fs.readFileSync(path.join(projectFolders.getProjectFolderPath(projectId), 'project.json'), 'utf8'));
    return (p && p.name) || 'Untitled Project';
  } catch (_) {
    return 'Untitled Project';
  }
}

function retryLater(ms) {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    kick();
  }, ms);
}

/** A failure that waits (true) or drops the project (false) */
function waitFor(result) {
  if (result.kind === 'offline' || result.kind === 'server') {
    waiting = result.kind;
    retryLater(RETRY_MS);
    return true;
  }
  if (result.kind === 'disabled' || result.kind === 'old_server') {
    waiting = 'server';
    retryLater(SLOW_RETRY_MS);
    return true;
  }
  if (result.kind === 'auth' || result.kind === 'account' || result.kind === 'wrong_server') {
    waiting = 'login';
    return true;
  }
  return false;
}

/** Start the queue if it can run (after a login change, an enqueue, a project closing, a retry). */
function kick() {
  if (running) return;
  void run();
}

async function run() {
  running = true;
  waiting = null;
  try {
    for (;;) {
      const q = load().queue;
      if (!q) break;
      const active = accounts.getActive();
      if (!active || !accounts.sameAccount(active, q)) {
        waiting = 'login';
        break;
      }
      const projectId = q.items.find((id) => id !== openProjectId);
      if (!projectId) {
        waiting = 'open';
        break;
      }
      current = { projectId, name: projectName(projectId) };
      notify();
      if (!isSynced(projectId)) {
        const move = syncService.turnOn(projectId, q.server, q.mode);
        moving = { projectId, done: move.catch(() => null) };
        const on = await move.finally(() => { moving = null; });
        if (!on.ok) {
          if (waitFor(on)) break;
          log.warn(`[SyncIntro] ${projectId} not synced (${on.kind}): ${on.message}`);
          removeItem(projectId);
          continue;
        }
      }
      let finished = false;
      let stop = false;
      for (let i = 0; i < MAX_PUSHES && !finished; i++) {
        if (openProjectId === projectId) break; // opened meanwhile: its own sync carries it (setOpenProject)
        const r = await syncService.push(projectId, q.server, (p) => send('sync:progress', { projectId, ...p }));
        if (!r.ok) {
          if (waitFor(r)) {
            stop = true;
            break;
          }
          log.warn(`[SyncIntro] First upload of ${projectId} stopped (${r.kind}): ${r.message}`);
          break;
        }
        finished = r.ready === true;
      }
      if (stop) break;
      if (finished) log.info(`[SyncIntro] First upload of ${projectId} complete`);
      removeItem(projectId);
      current = null;
      notify();
    }
  } catch (err) {
    log.error('[SyncIntro] Queue stopped:', err);
    retryLater(RETRY_MS);
  } finally {
    current = null;
    running = false;
    notify();
  }
}

/** Opening a project: wait while the queue moves its folder (turning sync on). */
async function awaitMove(projectId) {
  if (moving && moving.projectId === projectId) await moving.done;
}

/**
 * @param {import('electron').IpcMain} ipcMain
 * @param {() => (import('electron').BrowserWindow | null)} getMainWindow
 */
function registerIntroIpc(ipcMain, getMainWindow) {
  send = (channel, payload) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  };
  ipcMain.handle('sync:intro-status', () => status());
  ipcMain.handle('sync:intro-candidates', (_event, restServer) => syncService.introCandidates(restServer));
  ipcMain.handle('sync:intro-shown', () => markShown());
  ipcMain.handle('sync:intro-enqueue', (_event, projectIds, mode, restServer) =>
    enqueue(Array.isArray(projectIds) ? projectIds : [], mode, restServer));
}

/** For tests: forget the cached state */
function resetForTest() {
  state = null;
  openProjectId = null;
  current = null;
  waiting = null;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
}

/** For tests: resolves when the queue is not running */
async function whenIdle() {
  while (running) await new Promise((resolve) => setTimeout(resolve, 50));
}

module.exports = { registerIntroIpc, status, markShown, enqueue, setOpenProject, kick, awaitMove, resetForTest, whenIdle };
