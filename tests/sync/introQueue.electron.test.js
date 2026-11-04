/**
 * Test of the "What's new: sync" intro and its background first uploads
 * (electron/sync/introQueue.js, syncService.introCandidates; spec v3 16aq,
 * 16ay) against the local dev server: candidates (local-only projects the
 * server does not have, with sizes), the shown flag, the queue uploading
 * closed projects one at a time, a project open before its turn waiting
 * until it closes, the queue surviving a restart and waiting for its
 * account's login, and an opened project whose folder moved leaving the queue.
 * Runs inside Electron with Documents and userData in a temporary folder.
 *
 *   npm run test:intro-queue
 *
 * Needs the dev Docker stack (strabo-php) with MICROSYNC_ENABLED and the
 * fixture user owner@test.strabospot.org. Uses one micrograph of the copied
 * prod folder straboMicroFiles/727. Server projects use the mscli- prefix
 * and are removed at the end (tests/microsync/client_fixture.php).
 */

const { app } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const FIXTURE = path.join(os.homedir(), 'Desktop/Work/StraboBackendDevKit/www/straboMicroFiles/727');
const SERVER = 'http://localhost';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'smintro-'));
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
function fixture(...args) {
  const out = execFileSync('docker', ['exec', 'strabo-php', 'php', '/srv/app/www/tests/microsync/client_fixture.php', ...args.map(String)],
    { maxBuffer: 1 << 28 }).toString();
  return JSON.parse(out);
}

app.whenReady().then(async () => {
  try {
    const tokenService = require(`${E}/tokenService`);
    let stored = null;
    tokenService.getTokens = async () => (stored ? JSON.parse(JSON.stringify(stored)) : null);
    tokenService.saveTokens = async (accessToken, refreshToken, expiresIn, user) => {
      stored = { accessToken, refreshToken, expiresAt: Date.now() + expiresIn * 1000, user };
    };
    tokenService.clearTokens = async () => { stored = null; };

    const { createSyncClient } = require(`${E}/sync/client`);
    const svc = require(`${E}/sync/syncService`);
    const projectFolders = require(`${E}/projectFolders`);
    const accounts = require(`${E}/accounts`);
    const intro = require(`${E}/sync/introQueue`);
    const data = projectFolders.getStraboMicro2DataPath();

    fixture('cleanup');
    const who = fixture('token');
    const user = { pkey: String(who.pkey), email: who.email, name: 'Fixture Owner' };
    await tokenService.saveTokens(who.token, 'not-a-real-refresh-token', 3600, user);
    accounts.setLoggedIn(user, SERVER);

    // Local-only projects: one micrograph of the fixture each
    const p0 = JSON.parse(fs.readFileSync(path.join(FIXTURE, 'project.json'), 'utf8'));
    const keep = p0.datasets[0].samples[0].micrographs.find((m) => !m.parentID);
    const makeProject = (name) => {
      const id = `mscli-${crypto.randomUUID()}`;
      const folder = path.join(data, id);
      const p = JSON.parse(JSON.stringify(p0));
      p.id = id;
      p.name = name;
      p.datasets = [{ ...p.datasets[0], samples: [{ ...p.datasets[0].samples[0], micrographs: [keep] }] }];
      for (const sub of ['images', 'compositeThumbnails']) {
        fs.mkdirSync(path.join(folder, sub), { recursive: true });
        const src = path.join(FIXTURE, sub, keep.id);
        if (fs.existsSync(src)) fs.copyFileSync(src, path.join(folder, sub, keep.id));
      }
      fs.writeFileSync(path.join(folder, 'project.json'), JSON.stringify(p, null, 2));
      return id;
    };
    const A = makeProject('Intro A');
    const B = makeProject('Intro B');
    const C = makeProject('Intro C (already on the server)');
    fs.mkdirSync(path.join(data, '_replaced', 'x'), { recursive: true });
    const created = await createSyncClient({ restServer: SERVER, getAccessToken: async () => who.token }).createProject(C, 'Intro C');
    check('fixture: C created on the server', created.status === 201, JSON.stringify(created).slice(0, 300));

    const synced = (id) => {
      const folder = projectFolders.getAccountCopyPath(id, SERVER, user.pkey);
      try {
        return JSON.parse(fs.readFileSync(path.join(folder, 'sync', 'state.json'), 'utf8'));
      } catch (_) {
        return null;
      }
    };

    // Candidates: local-only, not on the server, with sizes
    const cand = await svc.introCandidates(SERVER);
    const ids = cand.ok ? cand.projects.map((p) => p.id) : [];
    check('candidates: A and B with sizes, not C (on the server), not _replaced', cand.ok && ids.includes(A) && ids.includes(B) &&
      !ids.includes(C) && ids.length === 2 && cand.projects.every((p) => p.bytes > 0 && p.name.startsWith('Intro')), JSON.stringify(cand));
    await tokenService.clearTokens();
    const out = await svc.introCandidates(SERVER);
    check('candidates logged out: a failure (the intro waits)', out.ok === false && out.kind === 'auth', JSON.stringify(out));
    await tokenService.saveTokens(who.token, 'not-a-real-refresh-token', 3600, user);

    // Shown flag
    check('not shown at first', intro.status().shown === false);
    intro.markShown();
    const flagFile = path.join(app.getPath('userData'), 'sync-intro.json');
    check('shown flag saved', JSON.parse(fs.readFileSync(flagFile, 'utf8')).shown === true);

    // B is open: A uploads, B waits until it closes
    intro.setOpenProject(B);
    intro.enqueue([A, B], 'manual', SERVER);
    await intro.whenIdle();
    const sA = synced(A);
    check('A: moved, synced in the chosen mode, first upload complete', sA && sA.mode === 'manual' && sA.phase === 'ready' &&
      !fs.existsSync(path.join(data, A)), JSON.stringify(sA && { mode: sA.mode, phase: sA.phase }));
    let st = intro.status();
    check('B waits while open: not moved, still queued, waiting "open"', !synced(B) && fs.existsSync(path.join(data, B)) &&
      st.queued === 1 && st.items[0].projectId === B && st.waiting === 'open' && st.done === 1 && st.total === 2, JSON.stringify(st));
    intro.setOpenProject(null);
    await intro.whenIdle();
    const sB = synced(B);
    st = intro.status();
    check('B uploads once closed; queue empty', sB && sB.phase === 'ready' && st.queued === 0 && st.current === null, JSON.stringify(st));
    check('queue cleared in the saved file', JSON.parse(fs.readFileSync(flagFile, 'utf8')).queue === null);

    // The queue survives a restart and waits for its account's login
    const D = makeProject('Intro D');
    intro.setOpenProject(D);
    intro.enqueue([D], 'automatic', SERVER);
    await intro.whenIdle();
    intro.resetForTest(); // a restart: only the file is left
    accounts.setLoggedIn(null, SERVER);
    intro.kick();
    await intro.whenIdle();
    st = intro.status();
    check('after a restart, logged out: D still queued, waiting for the login, not moved', st.queued === 1 &&
      st.waiting === 'login' && !synced(D), JSON.stringify(st));
    accounts.setLoggedIn(user, SERVER);
    intro.kick();
    await intro.whenIdle();
    const sD = synced(D);
    check('logged in again: D uploads (automatic)', sD && sD.phase === 'ready' && sD.mode === 'automatic' && intro.status().queued === 0,
      JSON.stringify(intro.status()));

    // A queued project opened after its folder moved leaves the queue (its own sync carries it)
    const F = makeProject('Intro F');
    check('fixture: F turned on (moved, first upload not done)', (await svc.turnOn(F, SERVER, 'automatic')).ok && synced(F)?.phase === 'uploading');
    intro.enqueue([F], 'automatic', SERVER);
    intro.setOpenProject(F);
    check('opened after the move: F leaves the queue at once', intro.status().items.every((i) => i.projectId !== F), JSON.stringify(intro.status()));
    await intro.whenIdle();
    intro.setOpenProject(null);

    // The server has every uploaded project
    const rows = await createSyncClient({ restServer: SERVER, getAccessToken: async () => who.token }).listProjects();
    const onServer = new Set((Array.isArray(rows) ? rows : []).map((r) => r.straboId));
    check('the server has A, B and D', onServer.has(A) && onServer.has(B) && onServer.has(D));
  } catch (e) {
    failures++;
    console.log('ERROR', e && e.stack);
  }
  try { fixture('cleanup'); } catch (_) { /* reported above */ }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(failures ? `\n${failures} FAILED (${passes} passed)` : `\nALL PASSED (${passes} checks)`);
  app.exit(failures ? 1 : 0);
});
