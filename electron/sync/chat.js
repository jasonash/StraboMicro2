/**
 * Project chat (main process; collaboration spec v3 17bd-17bi). The main
 * process owns the chat of the open synced project: its messages, the
 * unread count, and my messages waiting to be sent. Every window (the main
 * window's header chip, the chat window in C3) gets the same state through
 * emit(); none of them talks to the server.
 *
 * Server: /microsync/v1/projects/{pid}/chat (MsChat.php on the server).
 * New and deleted messages come as "chat {rev}" notices on the live channel
 * (live.js); this service then fetches chat?since=<rev>. Without the live
 * channel it checks every 30 s (17bg c). A read on another of my computers
 * comes as "chatread {id}" and clears the count here too (17bg d).
 *
 * Sending: each message gets a clientMsgId and waits in the outbox until
 * the server has it, so a message typed offline goes out later ("Not sent
 * yet", 17bg e) and a resend can never post it twice. The outbox is kept on
 * disk (userData/chat-outbox/<projectId>.json), so quitting does not lose
 * it. Statuses: sending, waiting (offline or slowed down; tried again),
 * failed (the server refused it: the user edits or discards it).
 *
 * Events: emit({ projectId, type: 'state', state }) whenever anything
 * changes, and emit({ projectId, type: 'incoming', messages }) for messages
 * from other people that arrived after the first load (notifications, C4).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const log = require('electron-log');

const MAX_CHARS = 4000;
const MAX_REFS = 10;
const REF_TYPES = new Set(['spot', 'micrograph']);

const DEFAULT_TIMING = {
  /** Check for messages this often while the live channel is down (17bg c) */
  pollMs: 30_000,
  /** Try waiting messages again this often (also on reconnect and every check) */
  retryMs: 15_000,
  /** How often the member count (chip shown or not, 17be g) is checked again */
  membersMs: 120_000,
  /** Wait this long after the last markRead before telling the server */
  readDelayMs: 800,
};

/** Characters as the server counts them (code points, not UTF-16 units) */
function charCount(s) {
  return Array.from(s).length;
}

/** The text as the server will keep it (MsChat::cleanText), or an error */
function cleanText(text) {
  if (typeof text !== 'string') return { error: 'The message must be text.' };
  // eslint-disable-next-line no-control-regex
  const t = text.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
  if (t === '') return { error: 'The message is empty.' };
  if (charCount(t) > MAX_CHARS) return { error: `A message can be at most ${MAX_CHARS.toLocaleString('en-US')} characters.` };
  return { text: t };
}

/** Up to MAX_REFS {type, id} references to spots or micrographs, duplicates dropped */
function cleanRefs(refs) {
  if (refs == null) return { refs: [] };
  if (!Array.isArray(refs) || refs.length > MAX_REFS) return { error: `At most ${MAX_REFS} links per message.` };
  const out = [];
  const seen = new Set();
  for (const r of refs) {
    const type = r && r.type;
    const id = r && r.id;
    if (!REF_TYPES.has(type) || typeof id !== 'string' || id === '' || id.length > 200) return { error: 'A link points at something that cannot be linked.' };
    const k = `${type}:${id}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push({ type, id });
    }
  }
  return { refs: out };
}

/**
 * @param {{
 *   clientFor: (server: string) => { request: (method: string, path: string, opts?: object) => Promise<{ status: number, data: any }> },
 *   emit: (event: { projectId: string, type: 'state' | 'incoming', state?: object, messages?: object[] }) => void,
 *   outboxDir: string,
 *   timing?: Partial<typeof DEFAULT_TIMING>,
 *   now?: () => number,
 * }} options - clientFor: a sync client (client.js) for the server; its
 *   request throws SyncError (offline, auth, access_removed, ...)
 */
function createChatService({ clientFor, emit, outboxDir, timing = {}, now = () => Date.now() }) {
  const T = { ...DEFAULT_TIMING, ...timing };
  /** projectId => chat of an open project */
  const chats = new Map();

  function newChat(projectId, server, pid, me) {
    return {
      projectId,
      server,
      pid,
      me: Number(me),
      /** id => message */
      messages: new Map(),
      rev: 0,
      lastRead: 0,
      unread: 0,
      hasOlder: false,
      /** Other active members (null until known): the chip shows when > 0 */
      others: null,
      /** My role in the project (the owner may delete anyone's message, 17bf g) */
      role: null,
      live: false,
      /** loading | ready | offline | removed | error */
      status: 'loading',
      error: null,
      outbox: loadOutbox(projectId),
      loaded: false,
      /** One server call at a time per chat, in order */
      queue: Promise.resolve(),
      pollTimer: null,
      retryTimer: null,
      membersTimer: null,
      readTimer: null,
      readPending: 0,
      /** Accounts seen in the members list (presence of anyone else = check it again) */
      known: new Set(),
      /** Unknown accounts already checked for (once each) */
      asked: new Set(),
      closed: false,
    };
  }

  // -------------------------------------------------------------------------
  // Outbox on disk
  // -------------------------------------------------------------------------

  function outboxFile(projectId) {
    return path.join(outboxDir, `${String(projectId).replace(/[^A-Za-z0-9._-]/g, '_')}.json`);
  }

  function loadOutbox(projectId) {
    try {
      const list = JSON.parse(fs.readFileSync(outboxFile(projectId), 'utf8'));
      if (!Array.isArray(list)) return [];
      // A send cut off by a quit is tried again
      return list.filter((m) => m && typeof m.clientMsgId === 'string' && typeof m.text === 'string')
        .map((m) => ({ ...m, status: m.status === 'failed' ? 'failed' : 'waiting' }));
    } catch (_) {
      return [];
    }
  }

  function saveOutbox(c) {
    const file = outboxFile(c.projectId);
    try {
      if (c.outbox.length === 0) {
        fs.rmSync(file, { force: true });
        return;
      }
      fs.mkdirSync(outboxDir, { recursive: true });
      const keep = c.outbox.map(({ clientMsgId, text, refs, createdAt, status, error }) => ({ clientMsgId, text, refs, createdAt, status, error }));
      fs.writeFileSync(`${file}.tmp`, JSON.stringify(keep));
      fs.renameSync(`${file}.tmp`, file);
    } catch (err) {
      log.warn(`[Chat] Could not save the outbox of ${c.projectId}: ${err.message}`);
    }
  }

  // -------------------------------------------------------------------------
  // State to the windows
  // -------------------------------------------------------------------------

  function stateOf(c) {
    const messages = [...c.messages.values()].sort((a, b) => a.id - b.id);
    return {
      pid: c.pid,
      me: c.me,
      status: c.status,
      error: c.error,
      live: c.live,
      others: c.others,
      role: c.role,
      messages,
      outbox: c.outbox.map(({ clientMsgId, text, refs, createdAt, status, error, retryAt }) => ({ clientMsgId, text, refs, createdAt, status, error: error || null, retryAt: retryAt || null })),
      rev: c.rev,
      lastRead: c.lastRead,
      unread: c.unread,
      hasOlder: c.hasOlder,
    };
  }

  function changed(c) {
    if (c.closed) return;
    emit({ projectId: c.projectId, type: 'state', state: stateOf(c) });
  }

  /** Run fn after the chat's earlier calls (never two server calls at once) */
  function serial(c, fn) {
    const next = c.queue.then(() => (c.closed ? undefined : fn()));
    c.queue = next.catch(() => {});
    return next;
  }

  /** A failed call: offline and the like keep the chat; removal stops it */
  function failed(c, err) {
    if (c.closed) return;
    const kind = err && err.kind;
    if (kind === 'access_removed') {
      c.status = 'removed';
      c.error = err.message;
      stopTimers(c);
    } else if (kind === 'offline' || kind === 'server' || kind === 'auth' || kind === 'disabled') {
      if (!c.loaded) c.status = 'offline';
      c.error = err.message;
    } else {
      c.status = c.loaded ? c.status : 'error';
      c.error = err && err.message ? err.message : String(err);
      log.warn(`[Chat] ${c.projectId}: ${c.error}`);
    }
    changed(c);
  }

  // -------------------------------------------------------------------------
  // Fetching
  // -------------------------------------------------------------------------

  function merge(c, list) {
    const incoming = [];
    for (const m of list || []) {
      if (!m || !Number.isInteger(m.id)) continue;
      const known = c.messages.has(m.id);
      c.messages.set(m.id, m);
      if (!known && c.loaded && !m.deletedAt && m.author && Number(m.author.pkey) !== c.me && m.id > c.lastRead) incoming.push(m);
      // My message the server now has (sent from here or after a lost answer)
      const i = c.outbox.findIndex((o) => o.clientMsgId === m.clientMsgId && m.author && Number(m.author.pkey) === c.me);
      if (i >= 0) {
        c.outbox.splice(i, 1);
        saveOutbox(c);
      }
    }
    return incoming;
  }

  function took(c, data) {
    if (typeof data.role === 'string') c.role = data.role;
    if (Number.isInteger(data.lastRead)) c.lastRead = Math.max(c.lastRead, data.lastRead);
    if (Number.isInteger(data.unread)) c.unread = data.unread;
  }

  /** The newest page (open) */
  async function loadNewest(c) {
    const r = await clientFor(c.server).request('GET', `/projects/${c.pid}/chat`);
    if (r.status !== 200) throw new Error(`Chat could not be loaded (${r.status})`);
    merge(c, r.data.messages);
    c.rev = Math.max(c.rev, Number(r.data.rev) || 0);
    c.hasOlder = r.data.hasMore === true;
    took(c, r.data);
    c.loaded = true;
    c.status = 'ready';
    c.error = null;
  }

  /** Everything since my rev (new and deleted messages), page by page */
  async function fetchSince(c) {
    if (!c.loaded) {
      await loadNewest(c);
      changed(c);
      return;
    }
    const incoming = [];
    for (let guard = 0; guard < 50; guard++) {
      const r = await clientFor(c.server).request('GET', `/projects/${c.pid}/chat?since=${c.rev}`);
      if (r.status !== 200) throw new Error(`Chat could not be loaded (${r.status})`);
      incoming.push(...merge(c, r.data.messages));
      c.rev = Math.max(c.rev, Number(r.data.rev) || 0);
      took(c, r.data);
      if (r.data.hasMore !== true) break;
    }
    c.status = 'ready';
    c.error = null;
    changed(c);
    if (incoming.length > 0) {
      emit({ projectId: c.projectId, type: 'incoming', messages: incoming });
      // Someone wrote, so someone else is here: the member count is out of date
      if (c.others === 0) loadMembers(c).catch(() => {});
    }
  }

  async function loadMembers(c) {
    const r = await clientFor(c.server).request('GET', `/projects/${c.pid}/members`);
    if (r.status !== 200 || !r.data || !Array.isArray(r.data.members)) return;
    const active = r.data.members.filter((m) => m && m.state === 'active' && m.user);
    c.known = new Set(active.map((m) => Number(m.user.pkey)));
    const others = active.filter((m) => Number(m.user.pkey) !== c.me).length;
    if (others !== c.others) {
      c.others = others;
      changed(c);
    }
  }

  // -------------------------------------------------------------------------
  // Timers
  // -------------------------------------------------------------------------

  function stopTimers(c) {
    for (const k of ['pollTimer', 'retryTimer', 'membersTimer']) {
      if (c[k]) clearTimeout(c[k]);
      c[k] = null;
    }
  }

  function schedulePoll(c) {
    if (c.pollTimer) clearTimeout(c.pollTimer);
    c.pollTimer = null;
    if (c.closed || c.live || c.status === 'removed') return;
    c.pollTimer = setTimeout(() => {
      c.pollTimer = null;
      refresh(c).finally(() => schedulePoll(c));
    }, T.pollMs);
  }

  function scheduleRetry(c) {
    if (c.retryTimer) clearTimeout(c.retryTimer);
    c.retryTimer = null;
    if (c.closed || c.status === 'removed' || !c.outbox.some((o) => o.status === 'waiting')) return;
    const soonest = Math.min(...c.outbox.filter((o) => o.status === 'waiting').map((o) => Math.max(0, (o.retryAt || 0) - now())), T.retryMs);
    c.retryTimer = setTimeout(() => {
      c.retryTimer = null;
      flush(c);
    }, soonest);
  }

  function scheduleMembers(c) {
    if (c.membersTimer) clearTimeout(c.membersTimer);
    c.membersTimer = null;
    if (c.closed || c.status === 'removed') return;
    c.membersTimer = setTimeout(() => {
      c.membersTimer = null;
      serial(c, () => loadMembers(c)).catch(() => {}).finally(() => scheduleMembers(c));
    }, T.membersMs);
  }

  function refresh(c) {
    return serial(c, () => fetchSince(c)).then(() => flush(c), (err) => failed(c, err));
  }

  // -------------------------------------------------------------------------
  // Sending
  // -------------------------------------------------------------------------

  /** Send every waiting message whose time has come, oldest first */
  function flush(c) {
    if (c.closed || c.status === 'removed') return Promise.resolve();
    return serial(c, async () => {
      for (const o of [...c.outbox]) {
        if (o.status !== 'waiting' && o.status !== 'sending') continue; // failed ones wait for the user
        if (o.retryAt && o.retryAt > now()) break; // slowed down: the rest wait behind it (order kept)
        if (!(await sendOne(c, o))) break; // offline or slowed down: the rest wait too (keeps the order)
      }
    }).finally(() => scheduleRetry(c));
  }

  /** @returns {Promise<boolean>} true = done with this one (sent or refused) */
  async function sendOne(c, o) {
    o.status = 'sending';
    o.error = null;
    changed(c);
    let r;
    try {
      r = await clientFor(c.server).request('POST', `/projects/${c.pid}/chat`, { json: { clientMsgId: o.clientMsgId, text: o.text, refs: o.refs } });
    } catch (err) {
      if (err && err.kind === 'access_removed') {
        o.status = 'failed';
        o.error = err.message;
        saveOutbox(c);
        failed(c, err);
        return false;
      }
      o.status = 'waiting';
      o.error = 'Not sent yet';
      saveOutbox(c);
      changed(c);
      return false;
    }
    if (r.status === 200 && r.data && r.data.message) {
      merge(c, [r.data.message]);
      c.rev = Math.max(c.rev, Number(r.data.message.rev) || 0);
      changed(c);
      return true;
    }
    if (r.status === 429) {
      const wait = Math.max(1, Number(r.data && r.data.retryAfter) || 5);
      o.status = 'waiting';
      o.retryAt = now() + wait * 1000;
      o.error = 'Sending too fast; waiting a moment';
      saveOutbox(c);
      changed(c);
      return false;
    }
    o.status = 'failed';
    o.error = (r.data && r.data.message) || `The server refused this message (${r.status}).`;
    saveOutbox(c);
    changed(c);
    return true;
  }

  // -------------------------------------------------------------------------
  // API
  // -------------------------------------------------------------------------

  function get(projectId) {
    return chats.get(projectId) || null;
  }

  return {
    /**
     * Start the chat of the open synced project (again after a login change).
     * @param {string} projectId
     * @param {{ server: string, pid: number, me: number | string }} binding
     */
    open(projectId, { server, pid, me }) {
      const old = chats.get(projectId);
      if (old && old.server === server && old.pid === Number(pid) && old.me === Number(me) && old.status !== 'removed') {
        changed(old);
        serial(old, () => loadMembers(old)).catch(() => {});
        refresh(old);
        return stateOf(old);
      }
      if (old) this.close(projectId);
      const c = newChat(projectId, server, Number(pid), me);
      chats.set(projectId, c);
      changed(c);
      serial(c, async () => {
        await loadMembers(c).catch(() => {});
        await loadNewest(c);
        changed(c);
      }).then(() => flush(c), (err) => failed(c, err)).finally(() => {
        schedulePoll(c);
        scheduleMembers(c);
      });
      return stateOf(c);
    },

    /** Stop the chat (Close Project, logout); waiting messages stay on disk */
    close(projectId) {
      const c = chats.get(projectId);
      if (!c) return;
      if (c.readTimer) {
        clearTimeout(c.readTimer);
        c.readTimer = null;
      }
      stopTimers(c);
      c.closed = true;
      chats.delete(projectId);
    },

    /** Close every chat (logout) */
    closeAll() {
      for (const id of [...chats.keys()]) this.close(id);
    },

    /** The current state (a window that just opened), or null */
    state(projectId) {
      const c = get(projectId);
      return c ? stateOf(c) : null;
    },

    /**
     * Queue a message and send it.
     * @returns {{ ok: true, clientMsgId: string } | { ok: false, message: string }}
     */
    send(projectId, text, refs) {
      const c = get(projectId);
      if (!c) return { ok: false, message: 'Chat is not open.' };
      if (c.status === 'removed') return { ok: false, message: c.error || 'You no longer have access to this project.' };
      const t = cleanText(text);
      if (t.error) return { ok: false, message: t.error };
      const rf = cleanRefs(refs);
      if (rf.error) return { ok: false, message: rf.error };
      const o = { clientMsgId: crypto.randomUUID(), text: t.text, refs: rf.refs, createdAt: new Date(now()).toISOString(), status: 'waiting', error: null };
      c.outbox.push(o);
      saveOutbox(c);
      changed(c);
      flush(c);
      return { ok: true, clientMsgId: o.clientMsgId };
    },

    /** Try a waiting or refused message again now */
    retry(projectId, clientMsgId) {
      const c = get(projectId);
      const o = c && c.outbox.find((x) => x.clientMsgId === clientMsgId);
      if (!o) return { ok: false };
      o.status = 'waiting';
      o.retryAt = 0;
      o.error = null;
      saveOutbox(c);
      changed(c);
      flush(c);
      return { ok: true };
    },

    /** Drop a message that was not sent */
    discard(projectId, clientMsgId) {
      const c = get(projectId);
      if (!c) return { ok: false };
      const i = c.outbox.findIndex((x) => x.clientMsgId === clientMsgId && x.status !== 'sending');
      if (i < 0) return { ok: false };
      c.outbox.splice(i, 1);
      saveOutbox(c);
      changed(c);
      return { ok: true };
    },

    /** Delete a message (mine; the owner may delete anyone's) */
    async deleteMessage(projectId, id) {
      const c = get(projectId);
      if (!c) return { ok: false, message: 'Chat is not open.' };
      try {
        const r = await serial(c, () => clientFor(c.server).request('DELETE', `/projects/${c.pid}/chat/${Number(id)}`));
        if (r.status !== 200) return { ok: false, message: (r.data && r.data.message) || `Could not delete it (${r.status}).` };
        await refresh(c);
        return { ok: true };
      } catch (err) {
        failed(c, err);
        return { ok: false, message: err.message };
      }
    },

    /** The page of messages before the oldest one shown */
    async loadOlder(projectId) {
      const c = get(projectId);
      if (!c || !c.hasOlder) return { ok: true, more: false };
      try {
        await serial(c, async () => {
          const oldest = Math.min(...c.messages.keys());
          const r = await clientFor(c.server).request('GET', `/projects/${c.pid}/chat?before=${oldest}`);
          if (r.status !== 200) throw new Error(`Older messages could not be loaded (${r.status})`);
          merge(c, r.data.messages);
          c.hasOlder = r.data.hasMore === true;
        });
        changed(c);
        return { ok: true, more: c.hasOlder };
      } catch (err) {
        failed(c, err);
        return { ok: false, message: err.message };
      }
    },

    /** Read up to message id: the count drops here at once, the server is told shortly */
    markRead(projectId, id) {
      const c = get(projectId);
      if (!c || !Number.isInteger(id) || id <= c.lastRead) return;
      c.lastRead = id;
      c.unread = [...c.messages.values()].filter((m) => m.id > id && !m.deletedAt && m.author && Number(m.author.pkey) !== c.me).length;
      changed(c);
      c.readPending = Math.max(c.readPending, id);
      if (c.readTimer) clearTimeout(c.readTimer);
      c.readTimer = setTimeout(() => {
        c.readTimer = null;
        const upTo = c.readPending;
        serial(c, async () => {
          const r = await clientFor(c.server).request('POST', `/projects/${c.pid}/chat/read`, { json: { id: upTo } });
          if (r.status === 200) {
            took(c, r.data);
            changed(c);
          }
        }).catch((err) => failed(c, err));
      }, T.readDelayMs);
    },

    /**
     * An event of the live channel for this project (live.js):
     * status (live or not), chat (new or deleted messages), chatread (I read
     * on another computer), access (membership changed).
     */
    onLive(projectId, event) {
      const c = get(projectId);
      if (!c || !event) return;
      if (event.kind === 'status') {
        const was = c.live;
        c.live = event.live === true;
        if (c.live !== was) changed(c);
        if (c.live && !was) refresh(c); // catch up on what came while not live
        schedulePoll(c);
      } else if (event.kind === 'chat') {
        if (!Number.isInteger(event.rev) || event.rev > c.rev) refresh(c);
      } else if (event.kind === 'chatread') {
        if (Number.isInteger(event.id) && event.id > c.lastRead) refresh(c);
      } else if (event.kind === 'presence') {
        // Someone the members list does not have yet (accepted an invitation meanwhile): the chip may show now
        const strangers = (event.people || []).map((p) => Number(p && p.user))
          .filter((u) => Number.isInteger(u) && u !== c.me && !c.known.has(u) && !c.asked.has(u));
        if (strangers.length > 0) {
          for (const u of strangers) c.asked.add(u);
          serial(c, () => loadMembers(c)).catch(() => {});
        }
      } else if (event.kind === 'access') {
        if (event.removed) {
          // Let the server say why (removed, left, deleted) on the next call
          refresh(c);
        } else {
          serial(c, () => loadMembers(c)).catch(() => {});
        }
      }
    },
  };
}

module.exports = { createChatService, cleanText, cleanRefs, MAX_CHARS, MAX_REFS };
