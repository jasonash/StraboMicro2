/**
 * Test of linking a local-only copy to the same project on the server
 * (electron/sync/link.js through syncService: sync:server-project,
 * sync:prompt-answer, sync:compare, sync:link, sync:server-projects; spec v3
 * 16an to 16ao) against the local dev server. Runs inside Electron with
 * Documents and userData in a temporary folder.
 *
 *   npm run test:link
 *
 * Needs the dev Docker stack (strabo-php) with MICROSYNC_ENABLED and the
 * fixture user owner@test.strabospot.org. Uses one micrograph of the copied
 * prod folder straboMicroFiles/727. Server projects use the mscli- prefix
 * and are removed at the end (tests/microsync/client_fixture.php).
 * Legacy rows (adopt, P1-1) are not covered here: the fixture cannot make
 * one; the server side is covered by tests/microsync/adopt_test.php.
 */

const { app } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const FIXTURE = path.join(os.homedir(), 'Desktop/Work/StraboBackendDevKit/www/straboMicroFiles/727');
const SERVER = 'http://localhost';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'smlink-'));
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
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

app.whenReady().then(async () => {
  try {
    const tokenService = require(`${E}/tokenService`);
    let stored = null;
    tokenService.getTokens = async () => (stored ? JSON.parse(JSON.stringify(stored)) : null);
    tokenService.saveTokens = async (accessToken, refreshToken, expiresIn, user) => {
      stored = { accessToken, refreshToken, expiresAt: Date.now() + expiresIn * 1000, user };
    };
    tokenService.clearTokens = async () => { stored = null; };

    const svc = require(`${E}/sync/syncService`);
    const projectFolders = require(`${E}/projectFolders`);
    const ser = require(`${E}/projectSerializer`);
    const versionHistory = require(`${E}/versionHistory`);

    fixture('cleanup');
    const who = fixture('token');
    const user = { pkey: String(who.pkey), email: who.email, name: 'Fixture Owner' };
    await tokenService.saveTokens(who.token, 'not-a-real-refresh-token', 3600, user);

    // A project on the server: a local project turned on and pushed
    const pid = `mscli-${crypto.randomUUID()}`;
    const local = path.join(projectFolders.getStraboMicro2DataPath(), pid);
    const p0 = JSON.parse(fs.readFileSync(path.join(FIXTURE, 'project.json'), 'utf8'));
    const keep = p0.datasets[0].samples[0].micrographs.find((m) => !m.parentID);
    p0.id = pid;
    p0.name = 'Link test';
    p0.datasets = [{ ...p0.datasets[0], samples: [{ ...p0.datasets[0].samples[0], micrographs: [keep] }] }];
    for (const sub of ['images', 'compositeThumbnails']) {
      fs.mkdirSync(path.join(local, sub), { recursive: true });
      const src = path.join(FIXTURE, sub, keep.id);
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(local, sub, keep.id));
    }
    fs.writeFileSync(path.join(local, 'project.json'), JSON.stringify(p0, null, 2));
    await ser.saveProjectJson(await ser.loadProjectJson(pid), pid);

    check('before the upload: not on the server', (await svc.serverProject(pid, SERVER)).row === null);
    const on = await svc.turnOn(pid, SERVER, 'automatic');
    const pushed = on.ok ? await svc.push(pid, SERVER, () => {}) : on;
    check('server project made', on.ok && pushed.ok && pushed.ready, JSON.stringify({ on, pushed }));
    const serverPid = on.pid;
    const account = projectFolders.getAccountCopyPath(pid, SERVER, who.pkey);

    /** This computer has only a local-only copy (as another computer, or before the update, would) */
    const makeLocalOnly = () => {
      if (fs.existsSync(local)) fs.rmSync(local, { recursive: true, force: true });
      fs.renameSync(account, local);
      fs.rmSync(path.join(local, 'sync'), { recursive: true, force: true });
      projectFolders.forgetProjectCopy(pid);
    };
    makeLocalOnly();

    // Detection and the one-time prompt's answer
    const fresh = await svc.listServerProjects(SERVER);
    const listed = fresh.ok && fresh.projects.find((p) => p.straboId === pid);
    check('Open Remote list: the project, here as a local-only copy', listed && listed.pid === serverPid && listed.syncFormat === 'entity' &&
      listed.here === 'local' && listed.role === 'owner', JSON.stringify(listed));
    const again = await svc.serverProject(pid, SERVER);
    check('server project for the prompt', again.ok && again.row && again.row.pid === serverPid && again.answer === null, JSON.stringify(again));
    check('prompt answer recorded', (await svc.setPromptAnswer(pid, 'manual')).ok && (await svc.serverProject(pid, SERVER)).answer === 'manual');
    check('unknown answer refused', (await svc.setPromptAnswer(pid, 'sometimes')).ok === false);
    check('answer kept outside the project folder', !fs.existsSync(path.join(local, 'sync')) &&
      fs.existsSync(path.join(app.getPath('userData'), 'sync-prompts.json')));

    // Compare: identical, then different (a field and the original of the same micrograph count once)
    const progress = [];
    const same = await svc.compare(pid, SERVER, serverPid, (p) => progress.push(p));
    check('identical copies', same.ok && same.identical === true && same.total === 0, JSON.stringify(same));
    const last = progress[progress.length - 1];
    check('compare reports hashing progress', last && last.phase === 'compare' && last.bytesTotal > 0 && last.bytesDone === last.bytesTotal,
      JSON.stringify(progress.slice(-2)));
    check('compare wrote nothing into the local folder', !fs.existsSync(path.join(local, 'sync')));

    const app1 = await ser.loadProjectJson(pid);
    app1.datasets[0].samples[0].micrographs[0].name = 'Renamed here';
    app1.datasets[0].samples[0].label = 'Sample renamed here';
    await ser.saveProjectJson(app1, pid);
    const image = path.join(local, 'images', keep.id);
    const serverImageSha = sha(image);
    fs.appendFileSync(image, Buffer.from('different pixels'));
    const diff = await svc.compare(pid, SERVER, serverPid, () => {});
    check('different copies: 2 items (micrograph field + original once, sample)', diff.ok && !diff.identical && diff.total === 2 &&
      diff.byType.micrograph === 1 && diff.byType.sample === 1 && typeof diff.serverChanged === 'string', JSON.stringify(diff));

    // Use my copy: linked, the next push sends the differences and the new original
    const mine = await svc.link(pid, SERVER, serverPid, 'automatic', 'mine', () => {});
    check('link with my copy', mine.ok && mine.folder === account && !fs.existsSync(local) &&
      fs.existsSync(path.join(account, 'sync', 'state.json')), JSON.stringify(mine));
    const st = await svc.getStatus(pid);
    check('linked copy: synced, ready, my 2 changes waiting', st.synced && st.phase === 'ready' && st.pending === 2, JSON.stringify(st));
    const sent = await svc.push(pid, SERVER, () => {});
    check('push sends my differences and the changed original', sent.ok && sent.pushed === 2 && sent.filesUploaded >= 1, JSON.stringify(sent));
    const server1 = fixture('assembled', serverPid);
    check('server has my copy', JSON.stringify(server1).includes('Renamed here') && JSON.stringify(server1).includes('Sample renamed here'));
    check('linking again is refused (already synced)', (await svc.link(pid, SERVER, serverPid, 'automatic', 'mine', () => {})).kind === 'exists');

    // Use the server copy: my copy goes to version history, the server's replaces it, the original downloads
    makeLocalOnly();
    const serverNowSha = sha(image);
    const app2 = await ser.loadProjectJson(pid);
    app2.datasets[0].samples[0].micrographs[0].name = 'Local name to be replaced';
    await ser.saveProjectJson(app2, pid);
    fs.writeFileSync(image, Buffer.from('local pixels to be replaced'));
    const versionsBefore = (await versionHistory.listVersions(pid)).length;
    const theirs = await svc.link(pid, SERVER, serverPid, 'manual', 'theirs', () => {});
    check('link with the server copy', theirs.ok && theirs.folder === account, JSON.stringify(theirs));
    const disk = JSON.parse(fs.readFileSync(path.join(account, 'project.json'), 'utf8'));
    check('project.json is the server copy', disk.datasets[0].samples[0].micrographs[0].name === 'Renamed here');
    check('the replaced original downloaded again', sha(path.join(account, 'images', keep.id)) === serverNowSha && serverNowSha !== serverImageSha);
    const versions = await versionHistory.listVersions(pid);
    check('my copy kept in version history', versions.length === versionsBefore + 1 &&
      versions.some((v) => v.name === 'Before using the StraboSpot copy'), JSON.stringify(versions.map((v) => v.name)));
    const st2 = await svc.getStatus(pid);
    check('server copy linked: nothing waiting, manual mode', st2.synced && st2.pending === 0 && st2.mode === 'manual', JSON.stringify(st2));

    const listed2 = (await svc.listServerProjects(SERVER)).projects.find((p) => p.straboId === pid);
    check('Open Remote list: here as a synced copy', listed2 && listed2.here === 'synced', JSON.stringify(listed2));

    // Open Remote Project with no copy here: a converted project downloads as a synced copy
    fs.rmSync(account, { recursive: true, force: true });
    projectFolders.forgetProjectCopy(pid);
    const opened = await svc.openRemote(serverPid, SERVER, 'automatic', () => {});
    check('Open Remote: downloaded as a synced copy', opened.ok && opened.projectId === pid && opened.adopted === false &&
      fs.existsSync(path.join(account, 'sync', 'state.json')) && fs.existsSync(path.join(account, 'images', keep.id)), JSON.stringify(opened));
    check('Open Remote: unknown project refused', (await svc.openRemote(999999999, SERVER, 'automatic', () => {})).ok === false);
  } catch (e) {
    failures++;
    console.log('ERROR', e && e.stack);
  }
  try { fixture('cleanup'); } catch (_) { /* reported above */ }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(failures ? `\n${failures} FAILED (${passes} passed)` : `\nALL PASSED (${passes} checks)`);
  app.exit(failures ? 1 : 0);
});
