/**
 * Test of the live channel (electron/sync/live.js, spec v3 17ah-17ay)
 * through syncService (sync:live-follow, sync:live events) against the dev
 * server's strabo-live container, plus its reconnect rules with a fake
 * socket. Runs inside Electron (its Node's WebSocket, as the app uses it)
 * with Documents and userData in a temporary folder.
 *
 *   npm run test:live
 *
 * Needs the dev Docker stack with MICROSYNC_ENABLED, the strabo-live
 * container (`docker ps` lists it) and the dev Apache forwarding
 * /microsync/live. Server projects use the mscli- prefix and are removed at
 * the end (tests/microsync/client_fixture.php). Restarts and pauses
 * strabo-live for a few seconds.
 */

const { app } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const SERVER = 'http://localhost';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'smlive-'));
app.setPath('documents', path.join(tmp, 'Documents'));
app.setPath('userData', path.join(tmp, 'userData'));
fs.mkdirSync(path.join(tmp, 'Documents'), { recursive: true });

const E = path.join(__dirname, '../../electron');
let failures = 0;
let passes = 0;
function check(label, ok, detail = '') {
  if (ok) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? `\n        ${String(detail).slice(0, 2000)}` : ''}`);
  }
  return ok;
}
function section(name) {
  console.log(`== ${name}`);
}
function fixture(...args) {
  const out = execFileSync('docker', ['exec', 'strabo-php', 'php', '/srv/app/www/tests/microsync/client_fixture.php', ...args.map(String)],
    { maxBuffer: 1 << 28 }).toString();
  return JSON.parse(out);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function docker(...args) {
  execFileSync('docker', args, { stdio: 'ignore' });
}

/** Events the renderer would get, with a waiter */
const events = [];
async function waitEvent(pred, ms = 4000, from = 0) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const e = events.slice(from).find(pred);
    if (e) return e;
    await sleep(25);
  }
  return null;
}

/**
 * A fake WebSocket for the reconnect rules: each instance closes with the
 * next code of the script (after an optional ready).
 */
function fakeSocketClass(script, log) {
  return class FakeSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      const step = script.length > 1 ? script.shift() : script[0];
      log.push({ at: Date.now(), url });
      setTimeout(() => {
        this.readyState = 1;
        if (this.onopen) this.onopen();
        if (step.ready && this.onmessage) this.onmessage({ data: JSON.stringify({ t: 'ready', user: 7, conn: 'x', pingMs: 25000 }) });
        setTimeout(() => {
          this.readyState = 3;
          if (this.onclose) this.onclose({ code: step.code, reason: 'test' });
        }, step.after ?? 5);
      }, 5);
    }

    send() {}

    close() {
      this.readyState = 3;
    }
  };
}

app.whenReady().then(async () => {
  let ownerSock = null;
  try {
    const tokenService = require(`${E}/tokenService`);
    let stored = null;
    tokenService.getTokens = async () => (stored ? JSON.parse(JSON.stringify(stored)) : null);
    tokenService.saveTokens = async (accessToken, refreshToken, expiresIn, user) => {
      stored = { accessToken, refreshToken, expiresAt: Date.now() + expiresIn * 1000, user };
    };
    tokenService.clearTokens = async () => { stored = null; };

    const svc = require(`${E}/sync/syncService`);
    const { createLiveChannel, liveUrl, jwtExp } = require(`${E}/sync/live`);
    const { createSyncClient } = require(`${E}/sync/client`);
    const { getClientId } = require(`${E}/sync/syncEngine`);
    const projectFolders = require(`${E}/projectFolders`);
    const ser = require(`${E}/projectSerializer`);

    // The renderer: sync:live events land in `events`
    const handlers = {};
    svc.registerSyncIpc({ handle: (ch, fn) => { handlers[ch] = fn; } }, () => ({
      isDestroyed: () => false,
      webContents: { send: (ch, payload) => { if (ch === 'sync:live') events.push(payload); } },
    }));

    section('Pure helpers');
    check('liveUrl http -> ws', liveUrl('http://localhost/') === 'ws://localhost/microsync/live');
    check('liveUrl https -> wss', liveUrl('https://strabospot.org') === 'wss://strabospot.org/microsync/live');
    const fakeJwt = `x.${Buffer.from(JSON.stringify({ exp: 1234 })).toString('base64url')}.y`;
    check('jwtExp reads exp', jwtExp(fakeJwt) === 1234 && jwtExp('nonsense') === null);

    fixture('cleanup');
    const people = {
      owner: fixture('token'),
      editor: fixture('token', 'editor@test.strabospot.org'),
    };
    const loginAs = async (who) => {
      const t = people[who];
      await tokenService.saveTokens(t.token, 'not-a-real-refresh-token', 3600, { pkey: String(t.pkey), email: t.email, name: who });
    };
    const clientFor = (who) => createSyncClient({ restServer: SERVER, getAccessToken: async () => people[who].token });

    section('Setup: the owner\'s synced project, the editor a member');
    await loginAs('owner');
    const straboId = `mscli-${crypto.randomUUID()}`;
    const local = path.join(projectFolders.getStraboMicro2DataPath(), straboId);
    fs.mkdirSync(local, { recursive: true });
    fs.writeFileSync(path.join(local, 'project.json'), JSON.stringify({ id: straboId, name: 'Live test', datasets: [] }, null, 2));
    await ser.saveProjectJson(await ser.loadProjectJson(straboId), straboId);
    const on = await svc.turnOn(straboId, SERVER, 'automatic');
    const pushed = on.ok ? await svc.push(straboId, SERVER, () => {}) : on;
    check('owner: project synced and ready', on.ok && pushed.ok && pushed.ready, JSON.stringify({ on, pushed }));
    const pid = on.pid;
    const owner = clientFor('owner');
    const editor = clientFor('editor');
    let r = await owner.invite(pid, people.editor.email, 'editor');
    check('owner invites the editor', r.status === 200 || r.status === 201, JSON.stringify(r));
    r = await editor.answerInvite(pid, true);
    check('editor accepts', r.status === 200, JSON.stringify(r));
    let n = 0;
    const dataset = () => ({ op: 'create', type: 'dataset', id: `D-live-${++n}`, parentType: 'project', parentId: straboId, body: { name: `D${n}` } });
    const editorPush = () => editor.push(pid, crypto.randomUUID(), 'editor-copy', [dataset()]);

    section('Following through syncService');
    check('not synced -> not_synced', (await handlers['sync:live-follow'](null, 'nope', SERVER)).kind === 'not_synced');
    check('another server -> wrong_server', (await svc.liveFollow(straboId, 'http://elsewhere.invalid')).kind === 'wrong_server');
    let mark = events.length;
    const f = await svc.liveFollow(straboId, SERVER);
    check('follow -> ok', f.ok === true, JSON.stringify(f));
    let e = await waitEvent((x) => x.kind === 'status', 4000, mark);
    check('status live: true', e && e.projectId === straboId && e.live === true, JSON.stringify(events.slice(mark)));

    section('Notices');
    mark = events.length;
    let t0 = Date.now();
    r = await editorPush();
    e = await waitEvent((x) => x.kind === 'changed', 3000, mark);
    check('the editor\'s push -> changed, not mine', e && e.mine === false && e.seq === r.headSeq, JSON.stringify({ e, r }));
    check('within a second of the push answer', e && Date.now() - t0 < 1500, `${Date.now() - t0} ms`);
    mark = events.length;
    r = await owner.push(pid, crypto.randomUUID(), getClientId(), [dataset()]);
    e = await waitEvent((x) => x.kind === 'changed', 3000, mark);
    check('my own push (this clientId) -> changed, mine', e && e.mine === true, JSON.stringify(e));
    mark = events.length;
    r = await owner.push(pid, crypto.randomUUID(), 'owner-laptop', [dataset()]);
    e = await waitEvent((x) => x.kind === 'changed', 3000, mark);
    check('my push from another computer -> not mine (it must be pulled)', e && e.mine === false, JSON.stringify(e));

    section('Membership and parked notices');
    mark = events.length;
    r = await owner.setMemberRole(pid, people.editor.pkey, 'contributor');
    check('owner changes the editor\'s role', r.status === 200, JSON.stringify(r));
    // The owner's role did not change: nothing for the owner
    await sleep(600);
    check('no access notice for the owner (role unchanged)', !events.slice(mark).some((x) => x.kind === 'access'));
    r = await owner.removeMember(pid, people.editor.pkey);
    check('owner removes the editor', r.status === 200, JSON.stringify(r));
    mark = events.length;
    r = await editorPush().catch((err) => err);
    check('the removed editor\'s push is parked', r && r.kind === 'access_removed' && r.data && r.data.parked === true, JSON.stringify(r && r.data));
    e = await waitEvent((x) => x.kind === 'parked', 3000, mark);
    check('owner gets parked', e && e.projectId === straboId, JSON.stringify(events.slice(mark)));

    section('Notice to pull timing (17av)');
    const logFile = require('electron-log').transports.file.getFile().path;
    const logStart = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').length : 0;
    mark = events.length;
    await owner.push(pid, crypto.randomUUID(), 'owner-laptop', [dataset()]);
    await waitEvent((x) => x.kind === 'changed', 3000, mark);
    const pulled = await svc.pull(straboId, SERVER, () => {});
    const committed = pulled.ok ? await svc.commitPull(straboId, pulled.pullId) : pulled;
    check('pull + commit after a notice', pulled.ok && committed.ok, JSON.stringify({ pulled, committed }));
    const mainLog = require('electron-log').transports.file.getFile().path;
    const logged = fs.existsSync(mainLog) && fs.readFileSync(mainLog, 'utf8').slice(logStart)
      .includes(`[Live] ${straboId}: notice to pull`);
    check('main.log records notice to pull', logged, mainLog);

    section('Logout and login');
    mark = events.length;
    svc.liveLoginChanged(null);
    e = await waitEvent((x) => x.kind === 'status', 2000, mark);
    check('logout -> live false at once', e && e.live === false, JSON.stringify(events.slice(mark)));
    await sleep(2500);
    check('and no reconnect while logged out', !events.slice(mark).some((x) => x.kind === 'status' && x.live));
    mark = events.length;
    svc.liveLoginChanged({ pkey: people.owner.pkey });
    e = await waitEvent((x) => x.kind === 'status' && x.live, 4000, mark);
    check('login -> live again', e !== null, JSON.stringify(events.slice(mark)));
    mark = events.length;
    svc.liveLoginChanged({ pkey: people.owner.pkey });
    await sleep(800);
    check('the same login again changes nothing', !events.slice(mark).some((x) => x.kind === 'status'));
    mark = events.length;
    await svc.liveFollow(straboId, SERVER);
    e = await waitEvent((x) => x.kind === 'status', 1000, mark);
    check('following again while live says live at once (a new controller)', e && e.live === true);

    section('The live service restarts');
    mark = events.length;
    docker('restart', 'strabo-live');
    e = await waitEvent((x) => x.kind === 'status' && !x.live, 8000, mark);
    check('restart -> live false', e !== null);
    e = await waitEvent((x) => x.kind === 'status' && x.live, 15000, mark);
    check('reconnects and follows again (backoff from 1 s)', e !== null, JSON.stringify(events.slice(mark)));
    mark = events.length;
    await owner.push(pid, crypto.randomUUID(), 'owner-laptop', [dataset()]);
    check('notices flow again', (await waitEvent((x) => x.kind === 'changed', 3000, mark)) !== null);

    section('Unfollow');
    const health = async () => (await fetch('http://127.0.0.1:8095/health')).json();
    check('one connection to the live service before', (await health()).connections === 1);
    await handlers['sync:live-unfollow'](null, straboId);
    await sleep(500);
    // The last follow gone: the connection closes
    check('unfollowing the last project closes the channel', (await health()).connections === 0);
    mark = events.length;
    await owner.push(pid, crypto.randomUUID(), 'owner-laptop', [dataset()]);
    await sleep(800);
    check('no notices after unfollowing', !events.slice(mark).some((x) => x.kind === 'changed'));

    section('A channel of its own: renewal and a dead connection');
    const own = [];
    const sent = [];
    class RecordingSocket extends WebSocket {
      send(data) {
        sent.push(JSON.parse(data));
        super.send(data);
      }
    }
    // A second token of the owner (another second, so it differs) for the renewal
    let renewed = fixture('token').token;
    while (renewed === people.owner.token) {
      await sleep(500);
      renewed = fixture('token').token;
    }
    const ownerTokens = [people.owner.token, renewed];
    ownerSock = createLiveChannel({
      getToken: async () => (ownerTokens.length > 1 ? ownerTokens.shift() : ownerTokens[0]),
      clientId: () => 'channel-test',
      emit: (projectId, ev) => own.push({ projectId, ...ev }),
      WebSocketImpl: RecordingSocket,
      timing: {
        // Renew 2 s after connecting; check liveness every second
        renewAheadMs: (jwtExp(people.owner.token) ?? 0) * 1000 - Date.now() - 2000,
        minRenewMs: 200,
        checkMs: 1000,
        replyMs: 1000,
        connectMs: 2000,
        backoffMs: [300],
      },
    });
    ownerSock.follow('P', { server: SERVER, pid, pkey: people.owner.pkey });
    const waitOwn = async (pred, ms) => {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        if (own.some(pred)) return true;
        await sleep(25);
      }
      return false;
    };
    check('own channel live', await waitOwn((x) => x.kind === 'status' && x.live, 4000));
    await sleep(3000);
    check('token sent again before it expires', sent.filter((m) => m.t === 'auth').length >= 2, JSON.stringify(sent.map((m) => m.t)));
    check('liveness check: subs sent again', sent.filter((m) => m.t === 'sub').length >= 2);
    check('still live after renewal', ownerSock.isLive('P'));
    own.length = 0;
    docker('pause', 'strabo-live');
    let dropped;
    try {
      dropped = await waitOwn((x) => x.kind === 'status' && !x.live, 5000);
    } finally {
      docker('unpause', 'strabo-live');
    }
    check('a service that stops answering -> dropped within check + reply time', dropped, JSON.stringify(own));
    check('and back once it answers', await waitOwn((x) => x.kind === 'status' && x.live, 10000), JSON.stringify(own));
    ownerSock.shutdown();
    ownerSock = null;

    section('Reconnect rules (fake socket)');
    const timing = { backoffMs: [100, 200], longWaitMs: 60_000, giveUpAfter: 4, stableMs: 50 };
    async function attempts(script, ms, extra = {}) {
      const log = [];
      const ch = createLiveChannel({
        getToken: async () => 'tok',
        clientId: () => 'c',
        emit: () => {},
        WebSocketImpl: fakeSocketClass([...script], log),
        timing: { ...timing, ...extra },
      });
      ch.follow('P', { server: SERVER, pid: 1, pkey: 7 });
      await sleep(ms);
      ch.shutdown();
      return log.length;
    }
    let a = await attempts([{ code: 1006, ready: true }], 1000);
    check('a dropped connection reconnects with backoff (several tries in 1 s)', a >= 4, a);
    a = await attempts([{ code: 4503 }], 1000);
    check('4503 service full -> long wait (1 try)', a === 1, a);
    a = await attempts([{ code: 4409, ready: true }], 1000);
    check('4409 replaced -> long wait', a === 1, a);
    a = await attempts([{ code: 1006 }], 2500);
    check('never ready -> long wait after giveUpAfter tries', a === timing.giveUpAfter, a);
    const noLogin = [];
    const ch = createLiveChannel({
      getToken: async () => null, clientId: () => 'c', emit: () => {}, WebSocketImpl: fakeSocketClass([{ code: 1006 }], noLogin), timing,
    });
    ch.follow('P', { server: SERVER, pid: 1, pkey: 7 });
    await sleep(500);
    check('not logged in -> no connection, no retries', noLogin.length === 0);
    ch.shutdown();
    let tokens = 0;
    const refreshLog = [];
    const ch2 = createLiveChannel({
      getToken: async (_s, { refresh }) => {
        tokens++;
        refreshLog.push(refresh);
        return 'tok';
      },
      clientId: () => 'c',
      emit: () => {},
      WebSocketImpl: fakeSocketClass([{ code: 4401 }, { code: 1000, ready: true, after: 10_000 }], []),
      timing,
    });
    ch2.follow('P', { server: SERVER, pid: 1, pkey: 7 });
    await sleep(600);
    check('4401 -> the next try refreshes the token first', tokens >= 2 && refreshLog[0] === false && refreshLog[1] === true, JSON.stringify(refreshLog));
    ch2.shutdown();
  } catch (err) {
    check('no exception', false, err && err.stack ? err.stack : err);
  } finally {
    if (ownerSock) ownerSock.shutdown();
    try {
      execFileSync('docker', ['unpause', 'strabo-live'], { stdio: 'ignore' });
    } catch (_) { /* not paused */ }
    try {
      fixture('cleanup');
    } catch (_) { /* best effort */ }
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`\n${passes} passed, ${failures} failed`);
    app.exit(failures > 0 ? 1 : 0);
  }
});
