/**
 * Test of the sync service (electron/sync/syncService.js) against the local
 * dev server: local-only projects never load the engine, turning sync on
 * without the upload, binding checks (server, account, login), counting
 * changes waiting, serialized pushes, mode, and the client's refresh on 401.
 * Runs inside Electron with Documents and userData in a temporary folder.
 *
 *   npm run test:sync-service
 *
 * Needs the dev Docker stack (strabo-php) with MICROSYNC_ENABLED and the
 * fixture user owner@test.strabospot.org. Uses one micrograph of the copied
 * prod folder straboMicroFiles/727. Server projects use the mscli- prefix
 * and are removed at the end (tests/microsync/client_fixture.php).
 * Token storage is kept in memory (no Keychain); the refresh logic is real.
 */

const { app } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const FIXTURE = path.join(os.homedir(), 'Desktop/Work/StraboBackendDevKit/www/straboMicroFiles/727');
const SERVER = 'http://localhost';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'smsvc-'));
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

    const { createSyncClient, SyncError } = require(`${E}/sync/client`);
    const svc = require(`${E}/sync/syncService`);
    const projectFolders = require(`${E}/projectFolders`);
    const engineLoaded = () => Object.keys(require.cache).some((k) => k.endsWith(path.join('sync', 'syncEngine.js')));

    // The client refreshes once after a 401 and retries
    {
      const seen = [];
      let answers = [401, 200];
      const fakeFetch = async (_url, opts) => {
        seen.push(opts.headers.Authorization);
        const status = answers.shift();
        return { status, text: async () => JSON.stringify(status === 200 ? { ok: true } : { error: 'unauthorized' }) };
      };
      let refreshed = 0;
      const c = createSyncClient({ restServer: SERVER, getAccessToken: async () => 'old', refreshAccessToken: async () => { refreshed++; return 'new'; }, fetchImpl: fakeFetch });
      const r = await c.listProjects();
      check('401 -> one refresh, retried with the new token', r.ok === true && refreshed === 1 && seen.join() === 'Bearer old,Bearer new', seen.join());
      answers = [401, 401];
      let err = null;
      try { await c.listProjects(); } catch (e) { err = e; }
      check('second 401 -> auth error, no third try', err instanceof SyncError && err.kind === 'auth' && refreshed === 2 && answers.length === 0);
    }

    fixture('cleanup');
    const who = fixture('token');
    const user = { pkey: String(who.pkey), email: who.email, name: 'Fixture Owner' };
    await tokenService.saveTokens(who.token, 'not-a-real-refresh-token', 3600, user);

    // A local-only project: one micrograph of the fixture
    const pid = `mscli-${crypto.randomUUID()}`;
    const local = path.join(projectFolders.getStraboMicro2DataPath(), pid);
    const p0 = JSON.parse(fs.readFileSync(path.join(FIXTURE, 'project.json'), 'utf8'));
    const keep = p0.datasets[0].samples[0].micrographs.find((m) => !m.parentID);
    p0.id = pid;
    p0.name = 'Sync service test';
    p0.datasets = [{ ...p0.datasets[0], samples: [{ ...p0.datasets[0].samples[0], micrographs: [keep] }] }];
    for (const sub of ['images', 'compositeThumbnails']) {
      fs.mkdirSync(path.join(local, sub), { recursive: true });
      const src = path.join(FIXTURE, sub, keep.id);
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(local, sub, keep.id));
    }
    fs.writeFileSync(path.join(local, 'project.json'), JSON.stringify(p0, null, 2));

    // The app opens and saves it (the serializer's form from now on)
    const ser = require(`${E}/projectSerializer`);
    await ser.saveProjectJson(await ser.loadProjectJson(pid), pid);

    // modifiedTimestamp means "last changed": unchanged saves and tree
    // expansion keep it; a change to the project's own fields stamps it
    {
      const disk = () => JSON.parse(fs.readFileSync(path.join(local, 'project.json'), 'utf8'));
      const before = disk();
      await new Promise((r) => setTimeout(r, 20));
      const app1 = await ser.loadProjectJson(pid);
      await ser.saveProjectJson(app1, pid);
      app1.datasets[0].isExpanded = !app1.datasets[0].isExpanded;
      await ser.saveProjectJson(app1, pid);
      const same = disk();
      check('unchanged save and tree expansion keep modifiedTimestamp',
        same.modifiedTimestamp === before.modifiedTimestamp &&
        same.datasets[0].modifiedTimestamp === before.datasets[0].modifiedTimestamp,
        `${before.modifiedTimestamp} -> ${same.modifiedTimestamp}`);
      app1.name = 'Sync service test (renamed)';
      await ser.saveProjectJson(app1, pid);
      const renamed = disk();
      check('project rename stamps the project only',
        renamed.modifiedTimestamp > before.modifiedTimestamp &&
        renamed.datasets[0].modifiedTimestamp === before.datasets[0].modifiedTimestamp);
      app1.datasets[0].name = 'Renamed dataset';
      await ser.saveProjectJson(app1, pid);
      const dsRenamed = disk();
      check('dataset rename stamps that dataset, project keeps its time',
        dsRenamed.datasets[0].modifiedTimestamp > before.datasets[0].modifiedTimestamp &&
        dsRenamed.modifiedTimestamp === renamed.modifiedTimestamp);

      // Created in the app and not reloaded since: no date on the project or
      // dataset, no modifiedTimestamp on a spot. Saves keep what is on disk
      // (they used to take the current time, so a synced project always had 2 changes)
      const m0 = app1.datasets[0].samples[0].micrographs[0];
      m0.spots = [...(m0.spots || []), { id: crypto.randomUUID(), name: 'Dated spot', geometryType: 'point', points: [{ X: 5, Y: 5 }], modifiedTimestamp: 1700000000000 }];
      await ser.saveProjectJson(app1, pid);
      const settled = disk();
      await new Promise((r) => setTimeout(r, 20));
      const fresh = JSON.parse(JSON.stringify(app1));
      delete fresh.date;
      delete fresh.modifiedTimestamp;
      delete fresh.datasets[0].date;
      delete fresh.datasets[0].modifiedTimestamp;
      const spotOf = (proj) => proj.datasets[0].samples[0].micrographs[0].spots.find((x) => x.name === 'Dated spot');
      delete spotOf(fresh).modifiedTimestamp;
      await ser.saveProjectJson(fresh, pid);
      await new Promise((r) => setTimeout(r, 20));
      await ser.saveProjectJson(fresh, pid);
      const kept = disk();
      check('a project, dataset and spot the app holds without dates keep the dates on disk',
        kept.date === settled.date && kept.modifiedTimestamp === settled.modifiedTimestamp &&
        kept.datasets[0].date === settled.datasets[0].date &&
        kept.datasets[0].modifiedTimestamp === settled.datasets[0].modifiedTimestamp &&
        spotOf(settled).modifiedTimestamp === 1700000000000 && spotOf(kept).modifiedTimestamp === 1700000000000,
        JSON.stringify({ before: [settled.date, settled.modifiedTimestamp], after: [kept.date, kept.modifiedTimestamp], spot: spotOf(kept).modifiedTimestamp }));
    }

    const st0 = await svc.getStatus(pid);
    check('local-only project: status not synced', st0.synced === false);
    const lp = await svc.push(pid, SERVER, () => {});
    check('local-only project: push refused as not_synced', lp.ok === false && lp.kind === 'not_synced');
    check('local-only project never loaded the sync engine', !engineLoaded());

    // Turn-on dialog preflight (16aj): upload size, logged in, already on the server
    const pf = await svc.preflight(pid, SERVER);
    const imageBytes = fs.statSync(path.join(local, 'images', keep.id)).size;
    check('preflight: size counts the original; logged in; not on the server', pf.ok && pf.bytes >= imageBytes &&
      pf.loggedIn === true && pf.onServer === null && pf.problem === null, JSON.stringify(pf));
    const pfFar = await svc.preflight(pid, 'http://127.0.0.1:9');
    check('preflight: unreachable server is a problem, not a failure', pfFar.ok && pfFar.problem && pfFar.problem.kind === 'offline' &&
      pfFar.bytes === pf.bytes, JSON.stringify(pfFar));
    await tokenService.clearTokens();
    const pfOut = await svc.preflight(pid, SERVER);
    check('preflight logged out: size only', pfOut.ok && pfOut.loggedIn === false && pfOut.bytes === pf.bytes && pfOut.onServer === null,
      JSON.stringify(pfOut));
    await tokenService.saveTokens(who.token, 'not-a-real-refresh-token', 3600, user);
    {
      // A local-only project whose id the server already has (linking, stage 4)
      const pid2 = `mscli-${crypto.randomUUID()}`;
      const local2 = path.join(projectFolders.getStraboMicro2DataPath(), pid2);
      fs.mkdirSync(local2, { recursive: true });
      fs.writeFileSync(path.join(local2, 'project.json'), JSON.stringify({ id: pid2, name: 'Already there', datasets: [] }));
      const created = await createSyncClient({ restServer: SERVER, getAccessToken: async () => who.token }).createProject(pid2, 'Already there');
      const pf2 = await svc.preflight(pid2, SERVER);
      check('preflight: a project the server has is reported', created.status === 201 && pf2.ok && pf2.onServer &&
        pf2.onServer.pid === created.data.pid, JSON.stringify({ created: created.status, pf2 }));
    }

    // Turning sync on moves the folder and leaves the upload to the first push
    const on = await svc.turnOn(pid, SERVER, 'automatic');
    check('turn on', on.ok === true && on.pid > 0, JSON.stringify(on));
    const folder = projectFolders.getAccountCopyPath(pid, SERVER, who.pkey);
    check('folder moved into the account folder', on.folder === folder && !fs.existsSync(local));
    const pfSynced = await svc.preflight(pid, SERVER);
    check('preflight of a synced project: already synced', pfSynced.ok === false && pfSynced.kind === 'exists', JSON.stringify(pfSynced));
    const st1 = await svc.getStatus(pid);
    check('status after turn on: synced, uploading, changes waiting', st1.synced && st1.phase === 'uploading' &&
      st1.mode === 'automatic' && st1.pending > 1 && st1.email === who.email, JSON.stringify(st1));

    // Binding checks
    const wrongServer = await svc.push(pid, 'http://127.0.0.1:9', () => {});
    check('other server in Preferences -> wrong_server', wrongServer.kind === 'wrong_server', JSON.stringify(wrongServer));
    await tokenService.saveTokens(who.token, 'x', 3600, { ...user, pkey: '999999999' });
    const otherAccount = await svc.push(pid, SERVER, () => {});
    check('other account logged in -> account', otherAccount.kind === 'account', JSON.stringify(otherAccount));
    await tokenService.clearTokens();
    const loggedOut = await svc.push(pid, SERVER, () => {});
    check('logged out -> auth', loggedOut.kind === 'auth', JSON.stringify(loggedOut));
    await tokenService.saveTokens(who.token, 'not-a-real-refresh-token', 3600, user);

    // Two pushes at once run one after the other
    const phases = [];
    const [a, b] = await Promise.all([
      svc.push(pid, SERVER, (x) => phases.push(x.phase)),
      svc.push(pid, SERVER, () => {}),
    ]);
    check('first push uploads everything', a.ok && a.pushed > 1 && a.filesUploaded >= 3 && a.ready, JSON.stringify(a));
    check('second push waited and had nothing to send', b.ok && b.pushed === 0 && b.filesUploaded === 0, JSON.stringify(b));
    check('progress reported', ['images', 'push', 'tiles', 'files'].every((ph) => phases.includes(ph)), phases.join());
    const st2 = await svc.getStatus(pid);
    check('status after push: ready, nothing waiting', st2.phase === 'ready' && st2.pending === 0, JSON.stringify(st2));

    // Counting the app's project (Manual mode: edits are not saved until Sync)
    const asLoaded = await ser.loadProjectJson(pid);
    const loadedCount = (await svc.getStatus(pid, asLoaded)).pending;
    check('unchanged project as the app holds it counts 0', loadedCount === 0, `counted ${loadedCount}`);
    const pj = JSON.parse(JSON.stringify(asLoaded));
    pj.datasets[0].samples[0].micrographs[0].notes = 'edited by the service test';
    check('unsaved edit counted when the app passes its project', (await svc.getStatus(pid, pj)).pending === 1 &&
      (await svc.getStatus(pid)).pending === 0);
    check('a project with another id is ignored for the count', (await svc.getStatus(pid, { ...pj, id: 'other' })).pending === 0);
    await ser.saveProjectJson(pj, pid);
    check('edit counted as one change waiting', (await svc.getStatus(pid)).pending === 1);
    check('after the save the app\'s project still counts 1', (await svc.getStatus(pid, pj)).pending === 1);
    const c = await svc.push(pid, SERVER, () => {});
    check('edit pushed', c.ok && c.pushed === 1, JSON.stringify(c));

    // Activity (16ah): my own pushes are not incoming; another computer's are, until pulled
    const act0 = await svc.activity(pid, SERVER);
    check('activity: my own pushes are not incoming', act0.ok && act0.incoming === 0, JSON.stringify(act0));
    {
      const state = JSON.parse(fs.readFileSync(path.join(folder, 'sync', 'state.json'), 'utf8'));
      const other = createSyncClient({ restServer: SERVER, getAccessToken: async () => who.token });
      const res = await other.push(state.binding.pid, crypto.randomUUID(), `other-${crypto.randomUUID()}`, [
        { op: 'update', type: 'project', id: pid, baseVersion: state.base[`project:${pid}`].version, fields: { notes: 'from the other computer' } },
      ]);
      check('other computer pushed', res.results && res.results[0] && res.results[0].status === 'accepted', JSON.stringify(res));
    }
    const act1 = await svc.activity(pid, SERVER);
    check('activity: the other computer\'s change is incoming, from my own account', act1.ok && act1.incoming === 1 &&
      act1.others.length === 0, JSON.stringify(act1));
    const pulled = await svc.pull(pid, SERVER, () => {});
    const committed = pulled.ok ? await svc.commitPull(pid, pulled.pullId) : pulled;
    const act2 = await svc.activity(pid, SERVER);
    check('activity after the pull: nothing incoming', committed.ok && act2.ok && act2.incoming === 0, JSON.stringify({ committed, act2 }));
    check('activity of a local-only project: not synced', (await svc.activity('no-such-project', SERVER)).kind === 'not_synced');

    // Mode
    check('switch to manual', (await svc.setMode(pid, 'manual')).ok && (await svc.getStatus(pid)).mode === 'manual');
    check('unknown mode refused', (await svc.setMode(pid, 'sometimes')).ok === false);

    // Expired access token, refresh token rejected by the server -> logged out
    // (an edit, so the push has to reach the server; with nothing to send it makes no request)
    pj.datasets[0].samples[0].micrographs[0].notes = 'edited again';
    await ser.saveProjectJson(pj, pid);
    await tokenService.saveTokens(who.token, 'not-a-real-refresh-token', 60, user); // inside the 5 min expiry buffer
    const expired = await svc.push(pid, SERVER, () => {});
    check('rejected refresh -> auth, tokens cleared', expired.kind === 'auth' && stored === null, JSON.stringify(expired));
  } catch (e) {
    failures++;
    console.log('ERROR', e && e.stack);
  }
  try { fixture('cleanup'); } catch (_) { /* reported above */ }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(failures ? `\n${failures} FAILED (${passes} passed)` : `\nALL PASSED (${passes} checks)`);
  app.exit(failures ? 1 : 0);
});
