/**
 * Chat notifications and the unread badge (collaboration spec v3 17bh).
 *
 * - An OS notification for messages from other people when neither the main
 *   window nor the chat window is focused: "<name> in <project>" with the
 *   first line of the message. Clicking it opens the chat window.
 * - At most one per project per 30 s; messages in between are grouped into
 *   one notification when the 30 s are up ("3 new messages").
 * - Never for my own messages (chat.js leaves them out of 'incoming').
 * - Off with the "Chat notifications" switch (Preferences); the OS Do Not
 *   Disturb / Focus applies on its own. No sound.
 * - The unread count on the macOS Dock icon and the Linux launcher
 *   (app.setBadgeCount), and as a taskbar overlay on Windows.
 *
 * The rules live in createChatNotifier with everything outside injected,
 * so tests/sync/chatNotify.test.js runs them without Electron; attach()
 * wires them to Electron.
 */

const GROUP_MS = 30_000;
const FIRST_LINE_MAX = 120;

/** The first non-empty line of a message, shortened */
function firstLine(text) {
  const line = String(text || '').split('\n').map((l) => l.trim()).find((l) => l !== '') || '';
  return line.length > FIRST_LINE_MAX ? `${line.slice(0, FIRST_LINE_MAX - 1).trimEnd()}…` : line;
}

/** "Ana", "Ana and Ben", "Ana, Ben and 2 others" */
function names(list) {
  const unique = [...new Set(list.filter(Boolean))];
  if (unique.length === 0) return 'Someone';
  if (unique.length === 1) return unique[0];
  if (unique.length === 2) return `${unique[0]} and ${unique[1]}`;
  const rest = unique.length - 2;
  return `${unique[0]}, ${unique[1]} and ${rest} ${rest === 1 ? 'other' : 'others'}`;
}

/**
 * @param {{
 *   enabled: () => boolean,
 *   anyFocused: () => boolean,
 *   projectName: (projectId: string) => string,
 *   show: (n: { title: string, body: string, projectId: string }) => void,
 *   setBadge: (count: number) => void,
 *   now?: () => number,
 *   setTimer?: (fn: () => void, ms: number) => unknown,
 *   clearTimer?: (t: unknown) => void,
 *   groupMs?: number,
 * }} deps
 */
function createChatNotifier(deps) {
  const now = deps.now || Date.now;
  const setTimer = deps.setTimer || ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer || ((t) => clearTimeout(/** @type {any} */ (t)));
  const groupMs = deps.groupMs ?? GROUP_MS;

  /** projectId -> unread count (the badge shows the total) */
  const unread = new Map();
  /** projectId -> { lastShown, waiting: messages, timer } */
  const projects = new Map();
  let badge = -1;

  function updateBadge() {
    let total = 0;
    for (const n of unread.values()) total += n;
    if (total !== badge) {
      badge = total;
      deps.setBadge(total);
    }
  }

  function entry(projectId) {
    let p = projects.get(projectId);
    if (!p) {
      p = { lastShown: -Infinity, waiting: [], timer: null };
      projects.set(projectId, p);
    }
    return p;
  }

  function dropWaiting(projectId) {
    const p = projects.get(projectId);
    if (!p) return;
    if (p.timer) clearTimer(p.timer);
    p.timer = null;
    p.waiting = [];
  }

  /** Should a notification be shown right now? */
  function wanted() {
    return deps.enabled() && !deps.anyFocused();
  }

  function showFor(projectId, messages) {
    const p = entry(projectId);
    p.lastShown = now();
    const project = deps.projectName(projectId) || 'a project';
    if (messages.length === 1) {
      const m = messages[0];
      deps.show({ projectId, title: `${(m.author && m.author.name) || 'Someone'} in ${project}`, body: firstLine(m.text) || 'New message' });
    } else {
      deps.show({
        projectId,
        title: `${messages.length} new messages in ${project}`,
        body: `From ${names(messages.map((m) => m.author && m.author.name))}`,
      });
    }
  }

  /** The 30 s are up: show what waited, if it is still unread and wanted */
  function flush(projectId) {
    const p = projects.get(projectId);
    if (!p) return;
    p.timer = null;
    const messages = p.waiting;
    p.waiting = [];
    if (messages.length === 0 || !wanted() || (unread.get(projectId) || 0) === 0) return;
    showFor(projectId, messages);
  }

  return {
    /** A chat event from chat.js (via syncService.onChatEvent) */
    handle(event) {
      if (!event || typeof event.projectId !== 'string') return;
      const { projectId } = event;
      if (event.type === 'state' && event.state) {
        const n = Number(event.state.unread) || 0;
        unread.set(projectId, n);
        // Read here or on another computer: nothing waiting is news any more
        if (n === 0) dropWaiting(projectId);
        updateBadge();
      } else if (event.type === 'closed') {
        unread.delete(projectId);
        dropWaiting(projectId);
        projects.delete(projectId);
        updateBadge();
      } else if (event.type === 'incoming' && Array.isArray(event.messages) && event.messages.length > 0) {
        if (!wanted()) return;
        const p = entry(projectId);
        const wait = p.lastShown + groupMs - now();
        if (wait <= 0 && !p.timer) {
          showFor(projectId, event.messages);
          return;
        }
        p.waiting.push(...event.messages);
        if (!p.timer) p.timer = setTimer(() => flush(projectId), Math.max(wait, 0));
      }
    },

    /** A window got focus: what waited is being seen now */
    focused() {
      for (const id of projects.keys()) dropWaiting(id);
    },

    /** The unread total the badge shows */
    badgeCount() {
      return Math.max(badge, 0);
    },
  };
}

// ---------------------------------------------------------------------------
// Windows taskbar overlay: the count drawn into a 16 x 16 bitmap
// ---------------------------------------------------------------------------

/** 3 x 5 digits, rows top to bottom, bit 2 = left column */
const DIGITS = {
  0: [7, 5, 5, 5, 7], 1: [2, 6, 2, 2, 7], 2: [7, 1, 7, 4, 7], 3: [7, 1, 7, 1, 7], 4: [5, 5, 7, 1, 1],
  5: [7, 4, 7, 1, 7], 6: [7, 4, 7, 5, 7], 7: [7, 1, 1, 1, 1], 8: [7, 5, 7, 5, 7], 9: [7, 5, 7, 1, 7], '+': [0, 2, 7, 2, 0],
};

/**
 * A red disc with the count in white ("9+" above 9), as BGRA pixels for
 * nativeImage.createFromBitmap (16 x 16, scale 1).
 * @param {number} count
 * @returns {Buffer}
 */
function overlayBitmap(count) {
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  const text = count > 9 ? '9+' : String(Math.max(0, Math.floor(count)));
  const set = (x, y, r, g, b) => {
    const i = (y * size + x) * 4;
    buf[i] = b; buf[i + 1] = g; buf[i + 2] = r; buf[i + 3] = 255;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - size / 2;
      const dy = y + 0.5 - size / 2;
      if (dx * dx + dy * dy <= (size / 2) * (size / 2)) set(x, y, 211, 47, 47);
    }
  }
  // Each glyph pixel is 2 x 2; glyphs are 6 wide with a 1 px gap
  const scale = 2;
  const width = text.length * 3 * scale + (text.length - 1);
  let x0 = Math.floor((size - width) / 2);
  const y0 = Math.floor((size - 5 * scale) / 2);
  for (const ch of text) {
    const rows = DIGITS[ch] || DIGITS[0];
    rows.forEach((bits, row) => {
      for (let col = 0; col < 3; col++) {
        if (!(bits & (4 >> col))) continue;
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) set(x0 + col * scale + sx, y0 + row * scale + sy, 255, 255, 255);
        }
      }
    });
    x0 += 3 * scale + 1;
  }
  return buf;
}

/**
 * Wire the notifier to Electron.
 * @param {{
 *   getMainWindow: () => Electron.BrowserWindow | null,
 *   chatWindow: { open: () => void, isFocused: () => boolean, getContext: () => ({ projectId: string, name: string } | null) },
 *   enabled: () => boolean,
 * }} opts
 */
function attach({ getMainWindow, chatWindow, enabled }) {
  const { app, Notification, nativeImage } = require('electron');
  const log = require('electron-log');
  /** Notifications kept until clicked or closed (macOS drops the click of a collected one) */
  const live = new Set();

  const notifier = createChatNotifier({
    enabled,
    anyFocused: () => {
      const main = getMainWindow();
      return !!(main && !main.isDestroyed() && main.isFocused()) || chatWindow.isFocused();
    },
    projectName: (projectId) => {
      const ctx = chatWindow.getContext();
      return ctx && ctx.projectId === projectId ? ctx.name : '';
    },
    show: ({ title, body, projectId }) => {
      if (!Notification.isSupported()) return;
      const n = new Notification({ title, body, silent: true });
      live.add(n);
      n.on('click', () => {
        live.delete(n);
        const ctx = chatWindow.getContext();
        if (ctx && ctx.projectId === projectId) chatWindow.open();
        else {
          const main = getMainWindow();
          if (main && !main.isDestroyed()) {
            main.show();
            main.focus();
          }
        }
      });
      n.on('close', () => live.delete(n));
      // macOS refuses unsigned apps (npm run dev: UNErrorDomain error 1, "not allowed"); say so in the log
      n.on('failed', (_e, error) => {
        live.delete(n);
        log.warn(`[ChatNotify] The OS did not show the notification for project ${projectId}: ${error}`);
      });
      n.show();
      log.info(`[ChatNotify] Notification for project ${projectId}: ${title}`);
    },
    setBadge: (count) => {
      try {
        if (process.platform === 'win32') {
          const main = getMainWindow();
          if (!main || main.isDestroyed()) return;
          if (count > 0) {
            const image = nativeImage.createFromBitmap(overlayBitmap(count), { width: 16, height: 16 });
            main.setOverlayIcon(image, `${count} unread chat ${count === 1 ? 'message' : 'messages'}`);
          } else {
            main.setOverlayIcon(null, '');
          }
        } else {
          app.setBadgeCount(count);
        }
      } catch (err) {
        log.warn(`[ChatNotify] Badge not set: ${err instanceof Error ? err.message : err}`);
      }
    },
  });

  app.on('browser-window-focus', () => notifier.focused());
  // Leave none behind: a click on one would reach an app that is gone
  app.on('before-quit', () => {
    for (const n of live) {
      try {
        n.close();
      } catch (_) {
        // already gone
      }
    }
    live.clear();
  });
  return notifier;
}

module.exports = { createChatNotifier, attach, overlayBitmap, firstLine, names, GROUP_MS };
