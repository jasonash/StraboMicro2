/**
 * Test of project chat in the main process (electron/sync/chat.js, spec v3
 * 17bd-17bi, stage C2). Part 1 runs the service against a fake server:
 * text and link rules, the outbox (offline, "Not sent yet", 429, refused,
 * kept across a quit, a lost answer not sent twice), read markers, incoming
 * messages. Part 2 runs it through syncService (chat:* IPC, chat:event)
 * against the dev server and its strabo-live container: an owner's synced
 * project with an editor, messages both ways, live notices, deletion,
 * paging, unread across computers, removal.
 *
 *   npm run test:chat
 *
 * Needs the dev Docker stack with MICROSYNC_ENABLED, the chat tables
 * (StraboBackend sql/microsync_chat.sql) and the strabo-live container.
 * Server projects use the mscli- prefix and are removed at the end.
 */

const { app } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const SERVER = 'http://localhost';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'smchat-'));
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
async function until(fn, ms = 4000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = fn();
    if (v) return v;
    await sleep(20);
  }
  return fn();
}

/**
 * A fake chat server: keeps messages, answers like MsChat. mode: 'ok',
 * 'offline' (throws SyncError offline), 'lost' (stores, then throws offline:
 * the answer was lost), '429', '400', 'removed'.
 */
function fakeServer(SyncError, me) {
  const s = { messages: [], rev: 0, lastRead: 0, mode: 'ok', calls: [] };
  const unread = () => s.messages.filter((m) => m.id > s.lastRead && !m.deletedAt && m.author.pkey !== me).length;
  s.add = (author, text, clientMsgId = crypto.randomUUID()) => {
    const m = { id: s.messages.length + 1, rev: ++s.rev, clientMsgId, author: { pkey: author, name: `U${author}` }, text, refs: [], createdAt: new Date().toISOString(), deletedAt: null, deletedBy: null };
    s.messages.push(m);
    return m;
  };
  s.client = {
    async request(method, p, opts = {}) {
      s.calls.push(`${method} ${p}`);
      if (s.mode === 'offline') throw new SyncError('offline', 'Could not reach the StraboSpot server');
      if (s.mode === 'removed') throw new SyncError('access_removed', 'You no longer have access to this project');
      const q = new URL(`http://x${p}`);
      if (method === 'GET' && q.pathname.endsWith('/members')) {
        return { status: 200, data: { members: [{ user: { pkey: me }, state: 'active' }, { user: { pkey: 99 }, state: 'active' }, { user: { pkey: 98 }, state: 'invited' }] } };
      }
      if (method === 'POST' && q.pathname.endsWith('/chat')) {
        if (s.mode === '429') return { status: 429, data: { error: 'slow_down', retryAfter: 1 } };
        if (s.mode === '429once') {
          s.mode = 'ok';
          return { status: 429, data: { error: 'slow_down', retryAfter: 1 } };
        }
        if (s.mode === '400') return { status: 400, data: { error: 'too_long', message: 'A message can be at most 4000 characters' } };
        const dup = s.messages.find((m) => m.clientMsgId === opts.json.clientMsgId);
        const m = dup || s.add(me, opts.json.text, opts.json.clientMsgId);
        if (s.mode === 'lost') throw new SyncError('offline', 'The answer from StraboSpot was cut off');
        return { status: 200, data: { message: m, duplicate: !!dup } };
      }
      if (method === 'POST' && q.pathname.endsWith('/chat/read')) {
        s.lastRead = Math.max(s.lastRead, opts.json.id);
        return { status: 200, data: { lastRead: s.lastRead, unread: unread() } };
      }
      if (method === 'GET' && q.pathname.endsWith('/chat')) {
        const since = q.searchParams.get('since');
        const list = since !== null ? s.messages.filter((m) => m.rev > Number(since)).sort((a, b) => a.rev - b.rev) : s.messages.slice(-100);
        return { status: 200, data: { messages: list, rev: s.rev, hasMore: false, lastRead: s.lastRead, unread: unread() } };
      }
      return { status: 404, data: { error: 'not_found' } };
    },
  };
  return s;
}

app.whenReady().then(async () => {
  const chatMod = require(`${E}/sync/chat`);
  const { SyncError, createSyncClient } = require(`${E}/sync/client`);
  try {
    section('Text and link rules (as the server counts)');
    check('trimmed, \\r\\n -> \\n, control characters dropped', chatMod.cleanText('  a\r\nb\u0007c\t ').text === 'a\nbc');
    check('empty -> error', !!chatMod.cleanText(' \n ').error);
    check('4,000 characters ok; 4,001 not', !chatMod.cleanText('x'.repeat(4000)).error && !!chatMod.cleanText('x'.repeat(4001)).error);
    check('4,000 emoji count as 4,000 (code points, not UTF-16 units)', !chatMod.cleanText('\u{1F600}'.repeat(4000)).error);
    check('refs: duplicates dropped', JSON.stringify(chatMod.cleanRefs([{ type: 'spot', id: 'a' }, { type: 'spot', id: 'a' }]).refs) === '[{"type":"spot","id":"a"}]');
    check('refs: other types refused', !!chatMod.cleanRefs([{ type: 'sample', id: 'a' }]).error);
    check('refs: 11 refused', !!chatMod.cleanRefs(Array.from({ length: 11 }, (_, i) => ({ type: 'spot', id: `s${i}` }))).error);

    section('Outbox and state with a fake server');
    const ME = 7;
    const fake = fakeServer(SyncError, ME);
    fake.add(99, 'hello from 99');
    const ev = [];
    const outboxDir = path.join(tmp, 'outbox');
    const timing = { pollMs: 300, retryMs: 150, membersMs: 60_000, readDelayMs: 50 };
    const mk = () => chatMod.createChatService({ clientFor: () => fake.client, emit: (e) => ev.push(e), outboxDir, timing });
    let svc = mk();
    const last = () => [...ev].reverse().find((e) => e.type === 'state')?.state;
    svc.open('P1', { server: SERVER, pid: 5, me: ME });
    let st = await until(() => last()?.status === 'ready' && last());
    check('open: ready with the newest page', st && st.messages.length === 1 && st.messages[0].text === 'hello from 99', JSON.stringify(st));
    check('open: unread 1, others 1 (active, not me; the invited one does not count)', st && st.unread === 1 && st.others === 1, JSON.stringify(st));
    check('the first load is not "incoming" (no notification for history)', !ev.some((e) => e.type === 'incoming'));

    fake.add(99, 'second');
    let n0 = ev.length;
    await until(() => ev.slice(n0).some((e) => e.type === 'incoming'), 2000);
    const inc = ev.slice(n0).find((e) => e.type === 'incoming');
    check('without live: the 30 s check (300 ms here) brings it, as incoming', inc && inc.messages.length === 1 && inc.messages[0].text === 'second', JSON.stringify(ev.slice(n0)));

    let r = svc.send('P1', '  my first  ');
    check('send -> ok with a clientMsgId', r.ok && typeof r.clientMsgId === 'string');
    st = await until(() => last()?.messages.some((m) => m.text === 'my first') && last());
    check('sent: on the server, out of the outbox', st && st.outbox.length === 0 && fake.messages.some((m) => m.text === 'my first'), JSON.stringify(st));
    check('my own message is never incoming', !ev.some((e) => e.type === 'incoming' && e.messages.some((m) => m.text === 'my first')));
    check('empty text refused before it is queued', svc.send('P1', '   ').ok === false && last().outbox.length === 0);

    fake.mode = 'offline';
    r = svc.send('P1', 'typed offline');
    st = await until(() => last()?.outbox[0]?.error === 'Not sent yet' && last());
    check('offline: waiting, "Not sent yet"', st && st.outbox.length === 1 && st.outbox[0].error === 'Not sent yet', JSON.stringify(st && st.outbox));
    const file = path.join(outboxDir, 'P1.json');
    check('the outbox is on disk', fs.existsSync(file) && JSON.parse(fs.readFileSync(file, 'utf8'))[0].text === 'typed offline');
    r = svc.send('P1', 'second offline');
    await sleep(400);
    check('both wait, in order', last().outbox.map((o) => o.text).join('|') === 'typed offline|second offline');

    section('Quit and start again while offline');
    svc.close('P1');
    svc = mk();
    svc.open('P1', { server: SERVER, pid: 5, me: ME });
    st = await until(() => last()?.outbox.length === 2 && last());
    check('after a restart the waiting messages are back', st && st.outbox.map((o) => o.text).join('|') === 'typed offline|second offline', JSON.stringify(st && st.outbox));
    fake.mode = 'ok';
    st = await until(() => last()?.outbox.length === 0 && last(), 3000);
    const mine = fake.messages.filter((m) => m.author.pkey === ME).map((m) => m.text);
    check('back online: both sent, in order, each once', st && mine.join('|') === 'my first|typed offline|second offline', JSON.stringify(mine));
    check('the outbox file is gone', !fs.existsSync(file));

    section('A lost answer is not sent twice');
    fake.mode = 'lost';
    svc.send('P1', 'answer lost');
    await until(() => last()?.outbox[0]?.status === 'waiting', 2000);
    fake.mode = 'ok';
    st = await until(() => last()?.outbox.length === 0 && last(), 3000);
    check('the resend gets the stored message back; one copy', st && fake.messages.filter((m) => m.text === 'answer lost').length === 1
      && st.messages.filter((m) => m.text === 'answer lost').length === 1, JSON.stringify(fake.messages.map((m) => m.text)));

    section('Slowed down, refused, removed');
    fake.mode = '429';
    svc.send('P1', 'too fast');
    st = await until(() => last()?.outbox[0]?.retryAt && last(), 2000);
    check('429 -> waiting with retryAt (retryAfter)', st && st.outbox[0].status === 'waiting' && st.outbox[0].retryAt > Date.now(), JSON.stringify(st && st.outbox));
    fake.mode = 'ok';
    st = await until(() => last()?.outbox.length === 0 && last(), 3000);
    check('sent once its time came', st && fake.messages.some((m) => m.text === 'too fast'));
    fake.mode = '429once';
    svc.send('P1', 'first in line');
    svc.send('P1', 'second in line');
    st = await until(() => last()?.outbox.length === 0 && last(), 4000);
    const order = fake.messages.map((m) => m.text).filter((t) => t.endsWith('in line'));
    check('the first one slowed down: the second waits behind it (order kept)', order.join('|') === 'first in line|second in line', JSON.stringify(order));
    fake.mode = '400';
    svc.send('P1', 'refused');
    st = await until(() => last()?.outbox[0]?.status === 'failed' && last(), 2000);
    check('400 -> failed with the server\'s message', st && /4000/.test(st.outbox[0].error), JSON.stringify(st && st.outbox));
    fake.mode = 'ok';
    await sleep(400);
    check('a failed one is not retried by itself', last().outbox.length === 1 && !fake.messages.some((m) => m.text === 'refused'));
    const cid = last().outbox[0].clientMsgId;
    check('discard drops it', svc.discard('P1', cid).ok && last().outbox.length === 0 && !fs.existsSync(file));

    section('My message from another computer');
    n0 = ev.length;
    fake.add(ME, 'from my laptop');
    await until(() => last()?.messages.some((m) => m.text === 'from my laptop'), 2000);
    await sleep(100);
    check('shown, but not incoming (no notification for my own, 17bh a)', last().messages.some((m) => m.text === 'from my laptop')
      && !ev.slice(n0).some((e) => e.type === 'incoming'), JSON.stringify(ev.slice(n0).filter((e) => e.type === 'incoming')));

    section('Read markers');
    fake.add(99, 'unread a');
    const b = fake.add(99, 'unread b');
    st = await until(() => last()?.messages.some((m) => m.id === b.id) && last(), 2000);
    check('two more from 99 -> unread 4', st && st.unread === 4, JSON.stringify(st && st.unread));
    svc.markRead('P1', b.id - 1);
    check('markRead: the count drops at once', last().unread === 1 && last().lastRead === b.id - 1);
    svc.markRead('P1', b.id);
    await until(() => fake.lastRead === b.id, 2000);
    check('the server is told once, with the newest id (debounced)', fake.lastRead === b.id
      && fake.calls.filter((c) => c.includes('/chat/read')).length === 1, JSON.stringify(fake.calls.filter((c) => c.includes('/read'))));
    svc.markRead('P1', 1);
    check('never moves back', last().lastRead === b.id);

    section('Removed');
    fake.mode = 'removed';
    svc.onLive('P1', { kind: 'access', removed: true });
    st = await until(() => last()?.status === 'removed' && last(), 2000);
    check('access removed -> status removed', st && /no longer/.test(st.error), JSON.stringify(st));
    check('sending refused when removed', svc.send('P1', 'hello?').ok === false);
    svc.closeAll();

    // -----------------------------------------------------------------------
    section('Through syncService against the dev server');
    const tokenService = require(`${E}/tokenService`);
    let stored = null;
    tokenService.getTokens = async () => (stored ? JSON.parse(JSON.stringify(stored)) : null);
    tokenService.saveTokens = async (accessToken, refreshToken, expiresIn, user) => {
      stored = { accessToken, refreshToken, expiresAt: Date.now() + expiresIn * 1000, user };
    };
    tokenService.clearTokens = async () => { stored = null; };
    const sync = require(`${E}/sync/syncService`);
    const projectFolders = require(`${E}/projectFolders`);
    const ser = require(`${E}/projectSerializer`);
    const handlers = {};
    const events = [];
    sync.registerSyncIpc({ handle: (ch, fn) => { handlers[ch] = fn; } }, () => ({
      isDestroyed: () => false,
      webContents: { send: (ch, payload) => { if (ch === 'chat:event' || ch === 'sync:live') events.push({ ch, ...payload }); } },
    }));
    const extra = [];
    sync.onChatEvent((e) => extra.push(e));

    fixture('cleanup');
    const people = { owner: fixture('token'), editor: fixture('token', 'editor@test.strabospot.org') };
    await tokenService.saveTokens(people.owner.token, 'not-a-real-refresh-token', 3600, { pkey: String(people.owner.pkey), email: people.owner.email, name: 'owner' });
    const clientFor = (who) => createSyncClient({ restServer: SERVER, getAccessToken: async () => people[who].token });
    const straboId = `mscli-${crypto.randomUUID()}`;
    const local = path.join(projectFolders.getStraboMicro2DataPath(), straboId);
    fs.mkdirSync(local, { recursive: true });
    fs.writeFileSync(path.join(local, 'project.json'), JSON.stringify({ id: straboId, name: 'Chat test', datasets: [] }, null, 2));
    await ser.saveProjectJson(await ser.loadProjectJson(straboId), straboId);
    const on = await sync.turnOn(straboId, SERVER, 'automatic');
    const pushed = on.ok ? await sync.push(straboId, SERVER, () => {}) : on;
    check('owner: project synced', on.ok && pushed.ok && pushed.ready, JSON.stringify({ on, pushed }));
    const pid = on.pid;

    const chatState = () => [...events].reverse().find((e) => e.ch === 'chat:event' && e.type === 'state' && e.projectId === straboId)?.state;
    check('chat:open on a project that is not synced -> not_synced', (await handlers['chat:open'](null, 'nope', SERVER)).kind === 'not_synced');
    await sync.liveFollow(straboId, SERVER);
    await until(() => events.some((e) => e.ch === 'sync:live' && e.kind === 'status' && e.live === true), 4000);
    let o = await handlers['chat:open'](null, straboId, SERVER);
    check('chat:open -> ok', o.ok === true, JSON.stringify(o));
    let s2 = await until(() => chatState()?.status === 'ready' && chatState());
    check('solo project: no others (no chip, 17be g)', s2 && s2.others === 0 && s2.messages.length === 0 && s2.live === true, JSON.stringify(s2));
    check('events also reach another window (onChatEvent)', extra.some((e) => e.type === 'state' && e.projectId === straboId));

    const owner = clientFor('owner');
    const editor = clientFor('editor');
    await owner.invite(pid, people.editor.email, 'editor');
    check('editor joins', (await editor.answerInvite(pid, true)).status === 200);
    // Membership counts are checked on open and every 2 min; open again to see it now
    await handlers['chat:open'](null, straboId, SERVER);
    s2 = await until(() => chatState()?.others === 1 && chatState());
    check('with the editor: others 1', !!s2, JSON.stringify(chatState()));

    section('Messages both ways, live');
    let mark = events.length;
    const t0 = Date.now();
    let r2 = await editor.request('POST', `/projects/${pid}/chat`, { json: { clientMsgId: crypto.randomUUID(), text: 'Hi from the editor', refs: [{ type: 'spot', id: 'S1' }] } });
    check('editor sends', r2.status === 200, JSON.stringify(r2));
    const incoming = await until(() => events.slice(mark).find((e) => e.ch === 'chat:event' && e.type === 'incoming'), 3000);
    check('owner gets it as incoming through the live notice', incoming && incoming.messages[0].text === 'Hi from the editor'
      && incoming.messages[0].refs[0].id === 'S1', JSON.stringify(events.slice(mark)));
    check(`within a second and a half (${Date.now() - t0} ms)`, Date.now() - t0 < 1500);
    check('owner unread 1', chatState().unread === 1);
    let sent = await handlers['chat:send'](null, straboId, 'Hi editor, see the micrograph', [{ type: 'micrograph', id: 'M9' }]);
    check('owner sends', sent.ok === true, JSON.stringify(sent));
    s2 = await until(() => chatState()?.outbox.length === 0 && chatState().messages.length === 2 && chatState());
    check('owner\'s message is on the server and shown once', !!s2, JSON.stringify(chatState()));
    let page = await editor.request('GET', `/projects/${pid}/chat`);
    check('the editor sees both', page.data.messages.length === 2 && page.data.unread === 1, JSON.stringify(page.data));

    section('Delete');
    const editorMsg = chatState().messages.find((m) => m.author.pkey === people.editor.pkey);
    mark = events.length;
    const del = await handlers['chat:delete'](null, straboId, editorMsg.id);
    check('the owner deletes the editor\'s message (moderation)', del.ok === true, JSON.stringify(del));
    s2 = await until(() => chatState()?.messages.find((m) => m.id === editorMsg.id)?.deletedAt && chatState());
    check('shown as deleted, text gone, unread back to 0', s2 && s2.messages.find((m) => m.id === editorMsg.id).text === '' && s2.unread === 0, JSON.stringify(s2));
    r2 = await editor.request('POST', `/projects/${pid}/chat`, { json: { clientMsgId: crypto.randomUUID(), text: 'mine to delete' } });
    await until(() => chatState()?.messages.some((m) => m.text === 'mine to delete'), 3000);
    await editor.request('DELETE', `/projects/${pid}/chat/${r2.data.message.id}`);
    s2 = await until(() => chatState()?.messages.find((m) => m.id === r2.data.message.id)?.deletedAt && chatState(), 3000);
    check('the editor\'s own delete reaches the owner live', !!s2, JSON.stringify(chatState()));

    section('Read on another computer');
    r2 = await editor.request('POST', `/projects/${pid}/chat`, { json: { clientMsgId: crypto.randomUUID(), text: 'please read' } });
    s2 = await until(() => chatState()?.unread === 1 && chatState(), 3000);
    check('owner: unread 1', !!s2, JSON.stringify(chatState()));
    // The owner's other computer reads it (same account, straight to the server)
    await owner.request('POST', `/projects/${pid}/chat/read`, { json: { id: r2.data.message.id } });
    s2 = await until(() => chatState()?.unread === 0 && chatState(), 3000);
    check('chatread through the live channel clears the count here', s2 && s2.lastRead === r2.data.message.id, JSON.stringify(chatState()));

    section('Older pages');
    execFileSync('docker', ['exec', 'strabo-postgres', 'psql', '-U', 'postgres', '-d', 'strabospot', '-c',
      `INSERT INTO strabomicro.micro_chat (project_id, author_pkey, client_msg_id, body, created_at)
       SELECT ${pid}, ${people.editor.pkey}, md5(g::text || '-old-${pid}')::uuid, 'old ' || g, now() - interval '1 day'
         FROM generate_series(1, 150) g`], { stdio: 'ignore' });
    await handlers['chat:close'](null, straboId);
    await handlers['chat:open'](null, straboId, SERVER);
    s2 = await until(() => chatState()?.status === 'ready' && chatState().messages.length === 100 && chatState(), 4000);
    check('reopen: the newest 100, hasOlder', s2 && s2.hasOlder === true, JSON.stringify(chatState() && { n: chatState().messages.length, hasOlder: chatState().hasOlder }));
    let older = await handlers['chat:older'](null, straboId);
    check('older: the remaining 54 (150 + 4 earlier), no more', older.ok && older.more === false && chatState().messages.length === 154
      && chatState().hasOlder === false, JSON.stringify({ older, n: chatState().messages.length }));
    older = await handlers['chat:older'](null, straboId);
    check('older again: nothing to load', older.ok && older.more === false && chatState().messages.length === 154);

    section('Removed from the project');
    await owner.removeMember(pid, people.editor.pkey);
    const st3 = [];
    const ed2 = chatMod.createChatService({ clientFor: () => editor, emit: (e) => st3.push(e), outboxDir: path.join(tmp, 'outbox-ed'), timing });
    ed2.open(straboId, { server: SERVER, pid, me: people.editor.pkey });
    const rm = await until(() => [...st3].reverse().find((e) => e.type === 'state' && e.state.status === 'removed'), 3000);
    check('the removed editor\'s chat says removed', !!rm, JSON.stringify(st3.slice(-1)));
    ed2.closeAll();

    section('Logout closes the chat');
    sync.liveLoginChanged(null);
    check('chat:state after logout -> null', (await handlers['chat:state'](null, straboId)) === null);
  } catch (err) {
    check('no exception', false, err && err.stack ? err.stack : err);
  } finally {
    try {
      fixture('cleanup');
    } catch (_) { /* best effort */ }
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`\n${passes} passed, ${failures} failed`);
    app.exit(failures > 0 ? 1 : 0);
  }
});
