/**
 * The chat window (collaboration spec v3 17bd, 17be): a small, independent
 * window for the chat of the project open in the main window. No parent, so
 * it falls behind the main window when that one is clicked; the header chip
 * brings it back (chatwin:open). Its page is chat.html (src/chat/), served
 * like the main page (Vite in development, app://bundle when packaged).
 *
 *   17be a  about 360 x 520 beside the main window (right side when there is
 *           room), then the size and place it was left at (per computer,
 *           userData/chat-window.json)
 *   17be b  keep-on-top pin, off by default (remembered with the bounds)
 *   17be c  not in the Windows taskbar (the chip is the way back); macOS
 *           lists it in the Window menu
 *   17be d  one window, for the project open in the main window (context)
 *   17be e  closing hides it; it is destroyed on Close Project, logout,
 *           quit, and when the main window closes (a hidden window would
 *           keep macOS from making a new main window on activate)
 *   17be f  title "Chat: <project name>"
 *
 * The chat window never reads the project: it asks the main window's
 * renderer (chatwin:request, answered with chatwin:reply) for the current
 * selection (link to selection, 17bf e) and for the names of linked spots
 * and micrographs, and a click on a link selects it there (chat:select-ref).
 */

const fs = require('fs');
const path = require('path');
const { BrowserWindow, ipcMain, screen, app } = require('electron');
const log = require('electron-log');

const DEFAULT_SIZE = { width: 360, height: 520 };
const REPLY_MS = 3000;

let win = null;
/** { projectId, name, restServer } of the main window's open synced project, or null */
let context = null;
let getMain = () => null;
let pageUrl = null;
let pinned = false;
let quitting = false;
let nextReq = 1;
const pending = new Map();

function stateFile() {
  return path.join(app.getPath('userData'), 'chat-window.json');
}

function loadState() {
  try {
    const s = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    return s && typeof s === 'object' ? s : {};
  } catch (_) {
    return {};
  }
}

function saveState() {
  if (!win || win.isDestroyed()) return;
  try {
    fs.writeFileSync(stateFile(), JSON.stringify({ bounds: win.getBounds(), pinned }));
  } catch (err) {
    log.warn(`[ChatWindow] Could not save its place: ${err.message}`);
  }
}

/** Saved bounds when they are still on a screen, else beside the main window */
function initialBounds() {
  const saved = loadState();
  pinned = saved.pinned === true;
  const b = saved.bounds;
  if (b && [b.x, b.y, b.width, b.height].every(Number.isFinite)) {
    const visible = screen.getAllDisplays().some((d) => {
      const a = d.workArea;
      return b.x < a.x + a.width - 40 && b.x + b.width > a.x + 40 && b.y >= a.y - 10 && b.y < a.y + a.height - 40;
    });
    if (visible) return b;
  }
  const main = getMain();
  const mb = main && !main.isDestroyed() ? main.getBounds() : null;
  const area = (mb ? screen.getDisplayMatching(mb) : screen.getPrimaryDisplay()).workArea;
  const { width, height } = DEFAULT_SIZE;
  if (!mb) return { width, height, x: area.x + area.width - width - 20, y: area.y + 60 };
  const right = mb.x + mb.width + 8;
  const x = right + width <= area.x + area.width ? right : Math.max(area.x, mb.x + mb.width - width - 20);
  const y = Math.min(Math.max(area.y, mb.y + 60), area.y + area.height - height);
  return { width, height, x, y };
}

function title() {
  return context && context.name ? `Chat: ${context.name}` : 'Chat';
}

function create() {
  const b = initialBounds();
  win = new BrowserWindow({
    ...b,
    minWidth: 280,
    minHeight: 320,
    title: title(),
    show: false,
    alwaysOnTop: pinned,
    skipTaskbar: process.platform === 'win32',
    fullscreenable: false,
    backgroundColor: '#1e1e1e',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  win.on('page-title-updated', (e) => e.preventDefault());
  let saveTimer = null;
  const later = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveState, 400);
  };
  win.on('resize', later);
  win.on('move', later);
  win.on('close', (e) => {
    saveState();
    if (!quitting && context) {
      // 17be e: the close button hides it; the chip brings it back
      e.preventDefault();
      win.hide();
    }
  });
  win.on('closed', () => {
    win = null;
  });
  win.loadURL(pageUrl);
  win.once('ready-to-show', () => {
    if (win && !win.isDestroyed()) win.show();
  });
}

/** Open (or bring back) the chat window for the current project */
function open() {
  if (!context) return { ok: false, message: 'No synced project is open.' };
  if (!win || win.isDestroyed()) {
    create();
    return { ok: true, created: true };
  }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  return { ok: true, created: false };
}

function destroy() {
  for (const p of pending.values()) p.resolve(null);
  pending.clear();
  if (win && !win.isDestroyed()) {
    saveState();
    win.destroy();
  }
  win = null;
}

/** The main window's open synced project changed; null = none (the chat window goes) */
function setContext(next) {
  const valid = next && typeof next.projectId === 'string' && next.projectId !== '';
  const changedProject = !valid || !context || context.projectId !== next.projectId;
  context = valid ? { projectId: next.projectId, name: String(next.name || ''), restServer: String(next.restServer || '') } : null;
  if (!context) {
    destroy();
    return;
  }
  if (win && !win.isDestroyed()) {
    win.setTitle(title());
    win.webContents.send('chatwin:context', context);
    if (changedProject) log.info(`[ChatWindow] Now for project ${context.projectId}`);
  }
}

/** Ask the main window's renderer; null when it does not answer */
function ask(kind, payload) {
  const main = getMain();
  if (!main || main.isDestroyed()) return Promise.resolve(null);
  const id = nextReq++;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve(null);
    }, REPLY_MS);
    pending.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v); } });
    main.webContents.send('chatwin:request', { id, kind, payload });
  });
}

/** Chat events (chat.js) also go to the chat window */
function forward(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

/**
 * @param {Electron.IpcMain} ipc
 * @param {() => Electron.BrowserWindow | null} mainWindowGetter
 * @param {string} url - the chat page (http://localhost:5173/chat.html or app://bundle/chat.html)
 */
function register(ipc, mainWindowGetter, url) {
  getMain = mainWindowGetter;
  pageUrl = url;
  app.on('before-quit', () => {
    quitting = true;
  });
  ipc.handle('chatwin:open', () => open());
  ipc.handle('chatwin:set-context', (_e, next) => {
    setContext(next);
    return { ok: true };
  });
  ipc.handle('chatwin:context', () => context);
  ipc.handle('chatwin:pin', (_e, on) => {
    pinned = on === true;
    if (win && !win.isDestroyed()) win.setAlwaysOnTop(pinned);
    saveState();
    return { pinned };
  });
  ipc.handle('chatwin:pinned', () => pinned);
  ipc.handle('chatwin:hide', () => {
    if (win && !win.isDestroyed()) win.hide();
    return { ok: true };
  });
  ipc.handle('chatwin:selection', () => ask('selection'));
  ipc.handle('chatwin:resolve', (_e, refs) => ask('resolve', Array.isArray(refs) ? refs.slice(0, 500) : []));
  ipc.handle('chatwin:select-ref', (_e, ref) => {
    const main = getMain();
    if (!main || main.isDestroyed() || !ref || (ref.type !== 'spot' && ref.type !== 'micrograph')) return { ok: false };
    main.webContents.send('chat:select-ref', { type: ref.type, id: String(ref.id) });
    if (main.isMinimized()) main.restore();
    main.show();
    main.focus();
    return { ok: true };
  });
  ipc.on('chatwin:reply', (_e, id, value) => {
    const p = pending.get(id);
    if (p) {
      pending.delete(id);
      p.resolve(value === undefined ? null : value);
    }
  });
}

module.exports = { register, open, destroy, setContext, forward, isOpen: () => !!(win && !win.isDestroyed() && win.isVisible()), isFocused: () => !!(win && !win.isDestroyed() && win.isFocused()) };
