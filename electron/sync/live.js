/**
 * Live channel (main process): one WebSocket from this app to the server's
 * strabo-live service at <server>/microsync/live (collaboration spec v3,
 * 17ah-17ay). It says when a followed project changed, so the open project
 * pulls within about a second instead of on its next poll.
 *
 * Notices only: the app still pulls through /microsync/v1, and if the
 * channel is down the renderer polls as before (17ao). The renderer follows
 * the open synced project (syncService liveFollow); every follower event goes
 * to emit(projectId, event):
 *   { kind: 'status', live }   live: following now; false while not (the
 *                              renderer polls), true again after a
 *                              reconnect (the renderer catches up at once)
 *   { kind: 'changed', seq, mine }   the project's head moved; mine = this
 *                              copy's own push (nothing to pull)
 *   { kind: 'access', role } or { kind: 'access', removed: true }
 *                              membership changed; the renderer runs its
 *                              normal access check
 *   { kind: 'parked' }         parked pushes changed (the owner counts again)
 *   { kind: 'chat', rev }      a chat message was sent or deleted (chat.js fetches)
 *   { kind: 'chatread', id }   I read the chat up to id on another computer
 *   { kind: 'presence', people }   who follows the project (17al-17an)
 * My own presence (setPresence) goes out whenever the project is followed.
 *
 * Protocol (livesvc/server.js on the server): auth with the access token
 * first, sub per project; the token is sent again before it expires
 * (tokenService refreshes it within 5 minutes of expiry). Reconnects back
 * off 1, 2, 4 ... 30 s; a full service (4503), a replaced connection (4409)
 * or a server that never answered after several tries waits 5 minutes;
 * a connection not ready within 15 s is dropped.
 * 4401 (login refused or expired) refreshes the token first. A sub sent
 * again every minute is the liveness check: no answer in 10 s and the
 * connection is dropped (the service pings, but WebSocket clients cannot
 * see pings).
 */

const log = require('electron-log');

const DEFAULT_TIMING = {
  backoffMs: [1_000, 2_000, 4_000, 8_000, 16_000, 30_000],
  longWaitMs: 5 * 60_000,
  /** A connection that lasted this long starts the backoff over */
  stableMs: 30_000,
  /** Connection attempts that never got as far as ready before the long wait */
  giveUpAfter: 10,
  checkMs: 60_000,
  replyMs: 10_000,
  /** From opening the socket to ready (a handshake that hangs is dropped) */
  connectMs: 15_000,
  /** Renew this long before the token expires (tokenService refreshes within 5 min of expiry) */
  renewAheadMs: 5 * 60_000 + 30_000,
  minRenewMs: 30_000,
};

/** Close codes after which the next try waits long (see livesvc/server.js) */
const LONG_WAIT_CODES = new Set([4400, 4409, 4503]);

/** ws(s)://host/.../microsync/live for a REST server URL */
function liveUrl(server) {
  const u = new URL(`${String(server).trim().replace(/\/+$/, '')}/microsync/live`);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  return u.toString();
}

/** The token's exp (unix seconds), read without checking it; null if unreadable */
function jwtExp(token) {
  try {
    const payload = JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8'));
    return Number.isFinite(Number(payload.exp)) ? Number(payload.exp) : null;
  } catch (_) {
    return null;
  }
}

/**
 * @param {{
 *   getToken: (server: string, options: { refresh: boolean }) => Promise<string | null>,
 *   clientId: () => string,
 *   emit: (projectId: string, event: object) => void,
 *   WebSocketImpl?: typeof WebSocket,
 *   timing?: Partial<typeof DEFAULT_TIMING>,
 * }} options - getToken: null when nobody is logged in (the channel then
 *   waits for a login); throws when the server cannot be reached
 */
function createLiveChannel({ getToken, clientId, emit, WebSocketImpl = globalThis.WebSocket, timing = {} }) {
  const T = { ...DEFAULT_TIMING, ...timing };
  /** @type {Map<string, { pid: number, server: string, pkey: string, live: boolean, presence: object | null }>} */
  const follows = new Map();
  /** projectId => my latest presence there (kept from before the follow, which may come later) */
  const presenceOf = new Map();
  /** projectId => when the first notice since its last pull arrived */
  const noticeAt = new Map();
  /** @type {WebSocket | null} */
  let ws = null;
  /** The server the connection (or the attempt under way) uses */
  let connServer = null;
  let connecting = false;
  /** The account the open connection authenticated as */
  let user = null;
  let readyAt = 0;
  let attempt = 0;
  let neverReady = 0;
  let refreshNext = false;
  /** Logged out: no connection until a login or a new follow */
  let paused = false;
  let reconnectTimer = null;
  let renewTimer = null;
  let checkTimer = null;
  let replyTimer = null;
  let connectTimer = null;

  const send = (obj) => {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
  };

  function byPid(pid) {
    for (const [projectId, f] of follows) if (f.pid === pid) return [projectId, f];
    return [null, null];
  }

  function setLive(projectId, f, live) {
    if (f.live === live) return;
    f.live = live;
    // Followed (again): the others see where I am at once
    if (live) sendPresence(f);
    emit(projectId, { kind: 'status', live });
  }

  function sendPresence(f) {
    if (f.live && f.presence) send({ t: 'presence', pid: f.pid, ...f.presence });
  }

  /**
   * My presence in a followed project (17al-17an): sent now if followed,
   * else as soon as it is. The service applies at most one a second.
   * @param {string} projectId
   * @param {{ state: 'here' | 'away', viewing: object | null, editing: object | null }} presence
   */
  function setPresence(projectId, presence) {
    presenceOf.set(projectId, presence);
    const f = follows.get(projectId);
    if (!f) return;
    f.presence = presence;
    sendPresence(f);
  }

  function clearTimers() {
    for (const t of [reconnectTimer, renewTimer, checkTimer, replyTimer, connectTimer]) if (t) clearTimeout(t);
    reconnectTimer = renewTimer = checkTimer = replyTimer = connectTimer = null;
  }

  /** Follow (or follow again) a synced project; connects if needed. */
  function follow(projectId, { server, pid, pkey }) {
    paused = false;
    const prev = follows.get(projectId);
    const f = { pid: Number(pid), server, pkey: String(pkey), live: false, presence: presenceOf.get(projectId) ?? null };
    follows.set(projectId, f);
    if (ws && connServer !== server) {
      // The app now talks to another server (Preferences): start over with it
      close('server changed');
    }
    if (ws && user !== null) {
      if (prev && prev.live && prev.pid === f.pid) {
        f.live = true;
        emit(projectId, { kind: 'status', live: true });
      } else if (mayFollow(f)) {
        send({ t: 'sub', pid: f.pid });
      }
      return;
    }
    // Not connected: try now (also cuts a backoff wait short, e.g. back online)
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    void connect();
  }

  function unfollow(projectId) {
    const f = follows.get(projectId);
    if (!f) return;
    follows.delete(projectId);
    noticeAt.delete(projectId);
    presenceOf.delete(projectId);
    if (follows.size === 0) {
      close('nothing to follow');
      return;
    }
    if (![...follows.values()].some((x) => x.pid === f.pid)) send({ t: 'unsub', pid: f.pid });
  }

  /** Logout (17as): close at once; nothing reconnects until the next login or follow. */
  function loggedOut() {
    paused = true;
    close('logged out');
  }

  /** Logged in (maybe as someone else): connect with that login unless already connected as pkey. */
  function accountChanged(pkey) {
    paused = false;
    if (follows.size === 0) return;
    if (ws && user !== null && user === String(pkey)) return;
    close('account changed');
    void connect();
  }

  /** Close the connection without reconnecting. */
  function close(why) {
    clearTimers();
    const sock = ws;
    ws = null;
    user = null;
    readyAt = 0;
    attempt = 0;
    neverReady = 0;
    if (sock) {
      detach(sock);
      try {
        sock.close(1000, why);
      } catch (_) { /* already closed */ }
      log.info(`[Live] Closed (${why})`);
    }
    for (const [projectId, f] of follows) setLive(projectId, f, false);
  }

  function detach(sock) {
    sock.onopen = sock.onmessage = sock.onclose = sock.onerror = null;
  }

  /** Drop the connection and reconnect as after a close. */
  function drop(why) {
    const sock = ws;
    if (!sock) return;
    detach(sock);
    try {
      sock.close(1000, why);
    } catch (_) { /* already closed */ }
    closed(4000, why);
  }

  async function connect() {
    if (ws || connecting || paused || follows.size === 0) return;
    connecting = true;
    const server = [...follows.values()].at(-1).server;
    connServer = server;
    let token;
    try {
      token = await getToken(server, { refresh: refreshNext });
    } catch (err) {
      connecting = false;
      if (paused || follows.size === 0 || ws) return;
      neverReady++;
      retryLater(null, `no token (${err && err.message ? err.message : err})`);
      return;
    }
    connecting = false;
    if (paused || follows.size === 0 || ws) return;
    if (!token) {
      // Nobody logged in: wait for a login (accountChanged) or a follow
      log.info('[Live] Not logged in; waiting for a login');
      return;
    }
    refreshNext = false;
    let sock;
    try {
      sock = new WebSocketImpl(liveUrl(server));
    } catch (err) {
      neverReady++;
      retryLater(null, `could not open (${err.message})`);
      return;
    }
    ws = sock;
    connectTimer = setTimeout(() => {
      connectTimer = null;
      if (ws === sock && user === null) {
        log.warn('[Live] No answer while connecting; trying again');
        drop('connect timeout');
      }
    }, T.connectMs);
    sock.onopen = () => {
      if (ws !== sock) return;
      sock.send(JSON.stringify({ t: 'auth', token }));
      scheduleRenew(server, token);
    };
    sock.onmessage = (e) => {
      if (ws !== sock) return;
      let m;
      try {
        m = JSON.parse(String(e.data));
      } catch (_) {
        return;
      }
      if (m && typeof m === 'object') onMessage(m);
    };
    sock.onclose = (e) => {
      if (ws !== sock) return;
      detach(sock);
      closed(e.code, e.reason);
    };
    sock.onerror = () => { /* the close event follows */ };
  }

  function onMessage(m) {
    switch (m.t) {
      case 'ready': {
        user = String(m.user);
        readyAt = Date.now();
        if (connectTimer) clearTimeout(connectTimer);
        connectTimer = null;
        neverReady = 0;
        log.info(`[Live] Connected to ${liveUrl(connServer)}`);
        subscribeAll();
        scheduleCheck();
        return;
      }
      case 'subbed':
      case 'nosub': {
        if (replyTimer) clearTimeout(replyTimer);
        replyTimer = null;
        const [projectId, f] = byPid(m.pid);
        if (!f) return;
        if (m.t === 'nosub') log.info(`[Live] Project ${m.pid} not followed (${m.error}); polling for it`);
        setLive(projectId, f, m.t === 'subbed');
        return;
      }
      case 'changed': {
        const [projectId, f] = byPid(m.pid);
        if (!f) return;
        const mine = typeof m.by === 'string' && m.by === clientId();
        if (!mine && !noticeAt.has(projectId)) noticeAt.set(projectId, Date.now());
        emit(projectId, { kind: 'changed', seq: Number(m.seq) || 0, mine });
        return;
      }
      case 'access': {
        const [projectId, f] = byPid(m.pid);
        if (!f) return;
        if (m.removed) setLive(projectId, f, false);
        emit(projectId, m.removed ? { kind: 'access', removed: true } : { kind: 'access', role: m.role });
        return;
      }
      case 'parked':
      case 'presence': {
        const [projectId, f] = byPid(m.pid);
        if (!f) return;
        emit(projectId, m.t === 'parked' ? { kind: 'parked' } : { kind: 'presence', people: Array.isArray(m.people) ? m.people : [] });
        return;
      }
      case 'chat':
      case 'chatread': {
        const [projectId, f] = byPid(m.pid);
        if (!f) return;
        emit(projectId, m.t === 'chat' ? { kind: 'chat', rev: Number(m.rev) || 0 } : { kind: 'chatread', id: Number(m.id) || 0 });
        return;
      }
      case 'error':
        log.warn(`[Live] ${m.error}: ${m.message}`);
        return;
      default:
    }
  }

  /** Follow every project of the logged-in account (the others wait for their account). */
  function subscribeAll() {
    for (const f of follows.values()) {
      if (mayFollow(f)) send({ t: 'sub', pid: f.pid });
    }
  }

  /** A follow this connection can serve: same server, same account */
  function mayFollow(f) {
    return f.server === connServer && f.pkey === user;
  }

  /** Liveness: every checkMs follow again; no answer within replyMs = the connection is gone. */
  function scheduleCheck() {
    if (checkTimer) clearTimeout(checkTimer);
    checkTimer = setTimeout(() => {
      checkTimer = null;
      if (!ws || user === null) return;
      if ([...follows.values()].some(mayFollow)) {
        if (replyTimer) clearTimeout(replyTimer);
        replyTimer = setTimeout(() => {
          replyTimer = null;
          log.warn('[Live] No answer from the live service; reconnecting');
          drop('no answer');
        }, T.replyMs);
        subscribeAll();
      }
      scheduleCheck();
    }, T.checkMs);
  }

  /** Send a fresh token before this one expires (17as). */
  function scheduleRenew(server, token) {
    if (renewTimer) clearTimeout(renewTimer);
    renewTimer = null;
    const exp = jwtExp(token);
    if (exp === null) return;
    const delay = Math.max(T.minRenewMs, exp * 1000 - Date.now() - T.renewAheadMs);
    renewTimer = setTimeout(async () => {
      renewTimer = null;
      if (!ws) return;
      let fresh;
      try {
        fresh = await getToken(server, { refresh: false });
      } catch (_) {
        fresh = undefined;
      }
      if (!ws) return;
      if (fresh === null) {
        // The session ended (refresh refused): the server would close it at expiry anyway
        loggedOut();
        return;
      }
      if (typeof fresh === 'string' && fresh !== token) {
        send({ t: 'auth', token: fresh });
        scheduleRenew(server, fresh);
        return;
      }
      // Not refreshed yet (offline, or not due by tokenService's clock): try again soon
      renewTimer = setTimeout(() => scheduleRenew(server, token), T.minRenewMs);
    }, delay);
  }

  /** The connection ended: every follow is not live; reconnect after the right wait. */
  function closed(code, reason) {
    const lasted = readyAt > 0 && Date.now() - readyAt >= T.stableMs;
    if (readyAt === 0) neverReady++;
    clearTimers();
    ws = null;
    user = null;
    readyAt = 0;
    if (lasted) attempt = 0;
    if (code === 4401) refreshNext = true;
    for (const [projectId, f] of follows) setLive(projectId, f, false);
    if (paused || follows.size === 0) return;
    retryLater(code, reason);
  }

  function retryLater(code, reason) {
    const long = (code !== null && LONG_WAIT_CODES.has(code)) || neverReady >= T.giveUpAfter;
    const delay = long ? T.longWaitMs : T.backoffMs[Math.min(attempt, T.backoffMs.length - 1)];
    if (!long) attempt++;
    const wait = delay < 1000 ? `${delay} ms` : `${Math.round(delay / 1000)} s`;
    log.info(`[Live] Not connected (${code ?? '-'}${reason ? ` ${reason}` : ''}); trying again in ${wait}`);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void connect();
    }, delay);
  }

  return {
    follow,
    unfollow,
    setPresence,
    loggedOut,
    accountChanged,
    /** Is the project followed right now? */
    isLive: (projectId) => follows.get(projectId)?.live === true,
    /** ms since the first notice after the project's last pull (then forgotten), or null */
    takeNoticeAge(projectId) {
      const at = noticeAt.get(projectId);
      noticeAt.delete(projectId);
      return at === undefined ? null : Date.now() - at;
    },
    /** Tests: close everything for good */
    shutdown() {
      paused = true;
      follows.clear();
      close('shutdown');
    },
  };
}

module.exports = { createLiveChannel, liveUrl, jwtExp };
