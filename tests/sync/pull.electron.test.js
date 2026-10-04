/**
 * End-to-end test of pulling (electron/sync/pull.js through the sync
 * service) against the local dev server. A second "machine" (same account,
 * another installation id) pushes changes with the raw client; this copy
 * pulls them the way the app does: prepare, apply to the app's project,
 * save, commit.
 *
 *   npm run test:pull
 *
 * Needs the dev Docker stack (strabo-php) with MICROSYNC_ENABLED and the
 * fixture user owner@test.strabospot.org. Uses two micrographs of the copied
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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'smpull-'));
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

    const { createSyncClient, hashFile } = require(`${E}/sync/client`);
    const svc = require(`${E}/sync/syncService`);
    const sidecar = require(`${E}/sync/sidecar`);
    const ser = require(`${E}/projectSerializer`);
    const projectFolders = require(`${E}/projectFolders`);
    const { applyEntityChanges } = require(`${E}/shared/entityModel.mjs`);

    fixture('cleanup');
    const who = fixture('token');
    await tokenService.saveTokens(who.token, 'r', 3600, { pkey: String(who.pkey), email: who.email, name: 'Owner' });
    const other = createSyncClient({ restServer: SERVER, getAccessToken: async () => who.token });
    const OTHER = 'other-machine-' + crypto.randomUUID();

    // A local-only project: a reference micrograph and one child with 3 spots
    const pid = `mscli-${crypto.randomUUID()}`;
    const local = path.join(projectFolders.getStraboMicro2DataPath(), pid);
    const p0 = JSON.parse(fs.readFileSync(path.join(FIXTURE, 'project.json'), 'utf8'));
    const ms0 = p0.datasets[0].samples[0].micrographs;
    const keep = [ms0[0], ms0[1]];
    p0.id = pid;
    p0.name = 'Pull test';
    p0.datasets = [{ ...p0.datasets[0], samples: [{ ...p0.datasets[0].samples[0], micrographs: keep }] }];
    for (const sub of ['images', 'compositeThumbnails']) {
      fs.mkdirSync(path.join(local, sub), { recursive: true });
      for (const mm of keep) {
        const src = path.join(FIXTURE, sub, mm.id);
        if (fs.existsSync(src)) fs.copyFileSync(src, path.join(local, sub, mm.id));
      }
    }
    fs.writeFileSync(path.join(local, 'project.json'), JSON.stringify(p0, null, 2));
    await ser.saveProjectJson(await ser.loadProjectJson(pid), pid);

    const M1 = keep[0].id;
    const M2 = keep[1].id;
    const [S1, S2, S3] = keep[1].spots.map((s) => s.id);
    const SAMPLE = p0.datasets[0].samples[0].id;

    const on = await svc.turnOn(pid, SERVER, 'manual');
    check('turn on', on.ok, JSON.stringify(on));
    const first = await svc.push(pid, SERVER, () => {});
    check('first upload', first.ok && first.ready, JSON.stringify(first));
    const folder = on.folder;
    const serverPid = on.pid;
    const base = async () => (await sidecar.loadState(folder)).base;

    /** What the app does: prepare, apply to its project, save, commit. */
    const appPull = async () => {
      const r = await svc.pull(pid, SERVER, () => {});
      if (!r.ok) throw new Error(`pull failed: ${JSON.stringify(r)}`);
      const appProject = await ser.loadProjectJson(pid);
      applyEntityChanges(appProject, r.changes, 'redo');
      await ser.saveProjectJson(appProject, pid);
      const c = await svc.commitPull(pid, r.pullId);
      if (!c.ok) throw new Error(`commit failed: ${JSON.stringify(c)}`);
      return { ...r, downloads: c.downloads };
    };
    /** Local edit, as the app saves it. */
    const appEdit = async (fn) => {
      const appProject = await ser.loadProjectJson(pid);
      fn(appProject);
      await ser.saveProjectJson(appProject, pid);
    };
    const disk = () => JSON.parse(fs.readFileSync(path.join(folder, 'project.json'), 'utf8'));
    const micro = (p, id) => p.datasets[0].samples[0].micrographs.find((m) => m.id === id);
    const otherPush = async (changes) => (await other.push(serverPid, crypto.randomUUID(), OTHER, changes)).results;
    const v = async (type, id) => (await base())[`${type}:${id}`].version;

    // Own pushes come back in the feed and are not applied again
    const own = await appPull();
    check('pull after my own upload: nothing to apply', own.changes.length === 0 && own.summary.received === 0, JSON.stringify(own.summary));

    // Their edit, create and delete
    const NEW_SPOT = crypto.randomUUID();
    // A spot as the app writes one (a bare body would gain defaults at the next save)
    const spotBody = { ...JSON.parse(JSON.stringify(micro(disk(), M2).spots[0])), id: NEW_SPOT, name: 'Spot from elsewhere',
      geometryType: 'point', points: [{ X: 5, Y: 6 }] };
    delete spotBody.isExpanded;
    const res1 = await otherPush([
      { op: 'update', type: 'micrograph', id: M1, baseVersion: await v('micrograph', M1), fields: { name: 'Renamed elsewhere' } },
      { op: 'create', type: 'spot', id: NEW_SPOT, parentType: 'micrograph', parentId: M2,
        body: spotBody },
      { op: 'delete', type: 'spot', id: S3, baseVersion: await v('spot', S3) },
      // As the app sends it: the micrograph's new spot order with the new spot
      { op: 'update', type: 'micrograph', id: M2,
        childOrder: { spots: [...micro(disk(), M2).spots.map((x) => x.id).filter((id) => id !== S3), NEW_SPOT] } },
    ]);
    check('other machine pushed 4 changes', res1.every((x) => x.status === 'accepted'), JSON.stringify(res1));
    const p1 = await appPull();
    const d1 = disk();
    check('their rename, new spot and spot delete applied', micro(d1, M1).name === 'Renamed elsewhere' &&
      micro(d1, M2).spots.some((s) => s.id === NEW_SPOT && s.name === 'Spot from elsewhere') &&
      !micro(d1, M2).spots.some((s) => s.id === S3), JSON.stringify(p1.summary));
    const m1Change = p1.changes.find((c) => c.key === `micrograph:${M1}`);
    check('a pulled micrograph arrives as the app loads it (imagePath set)', m1Change && m1Change.after &&
      m1Change.after.body.imagePath === M1, JSON.stringify(m1Change && m1Change.after && Object.keys(m1Change.after.body)));
    const st1 = await svc.getStatus(pid);
    check('after the pull nothing is waiting to push', st1.pending === 0 && st1.conflicts === 0, JSON.stringify(st1));
    const again = await appPull();
    check('pulling again changes nothing', again.changes.length === 0 && again.summary.received === 0);

    // Different fields of one entity: the push is turned down, the pull merges, the next push goes through
    await appEdit((p) => { micro(p, M2).name = 'Mine'; });
    await otherPush([{ op: 'update', type: 'micrograph', id: M2, baseVersion: await v('micrograph', M2), fields: { description: 'Theirs' } }]);
    const pushed2 = await svc.push(pid, SERVER, () => {});
    check('push of a stale entity is turned down', pushed2.ok && pushed2.conflicts === 1 && pushed2.pushed === 0, JSON.stringify(pushed2));
    await appPull();
    const d2 = disk();
    check('pull merged both fields locally', micro(d2, M2).name === 'Mine' && micro(d2, M2).description === 'Theirs');
    const pushed3 = await svc.push(pid, SERVER, () => {});
    check('the merged entity is pushed', pushed3.ok && pushed3.pushed === 1 && pushed3.conflicts === 0, JSON.stringify(pushed3));
    check('nothing waiting after the merge', (await svc.getStatus(pid)).pending === 0);

    // Same field: a conflict, held from pushes
    await appEdit((p) => { micro(p, M1).notes = 'my notes'; });
    await otherPush([{ op: 'update', type: 'micrograph', id: M1, baseVersion: await v('micrograph', M1), fields: { notes: 'their notes' } }]);
    await svc.push(pid, SERVER, () => {});
    await appPull();
    const st3 = await svc.getStatus(pid);
    const conflicts = (await sidecar.loadState(folder)).conflicts;
    check('same field: conflict recorded, mine kept locally', st3.conflicts === 1 && micro(disk(), M1).notes === 'my notes' &&
      conflicts[`micrograph:${M1}`] && conflicts[`micrograph:${M1}`][0].theirs === 'their notes', JSON.stringify(conflicts));
    const pushed4 = await svc.push(pid, SERVER, () => {});
    check('a conflicted entity is not pushed', pushed4.ok && pushed4.pushed === 0, JSON.stringify(pushed4));
    // A later change of another field by them keeps the conflict
    await otherPush([{ op: 'update', type: 'micrograph', id: M1, baseVersion: await v('micrograph', M1), fields: { description: 'their description' } }]);
    await appPull();
    const st4 = await svc.getStatus(pid);
    check('their later edit of another field keeps the conflict', st4.conflicts === 1 && micro(disk(), M1).notes === 'my notes' &&
      micro(disk(), M1).description === 'their description');

    // Their delete of M2 while I edited one of its spots: a question, nothing removed
    await appEdit((p) => { micro(p, M2).spots.find((s) => s.id === S1).name = 'edited by me'; });
    const del = await otherPush([{ op: 'delete', type: 'micrograph', id: M2, baseVersion: await v('micrograph', M2) }]);
    check('other machine deleted M2', del[0].status === 'accepted', JSON.stringify(del));
    await appPull();
    const st5 = await svc.getStatus(pid);
    check('delete vs my edit: question, M2 kept locally', st5.questions === 1 && micro(disk(), M2) &&
      micro(disk(), M2).spots.find((s) => s.id === S1).name === 'edited by me', JSON.stringify(st5));
    const pushed5 = await svc.push(pid, SERVER, () => {});
    check('the held subtree is not pushed', pushed5.ok && pushed5.pushed === 0 && pushed5.notAccepted === 0, JSON.stringify(pushed5));

    // Their new micrograph with an image: downloaded
    const NEW_M = String(Date.now()) + '7';
    const imgSrc = path.join(FIXTURE, 'images', ms0[2].id);
    const sha = await hashFile(imgSrc);
    await other.uploadFile(serverPid, imgSrc, 'image', { sha256: sha });
    const body = { ...JSON.parse(JSON.stringify(ms0[2])), id: NEW_M, name: 'Micrograph from elsewhere' };
    delete body.spots;
    delete body.parentID;
    const created = await otherPush([{ op: 'create', type: 'micrograph', id: NEW_M, parentType: 'sample', parentId: SAMPLE, body }]);
    check('other machine created a micrograph', created[0].status === 'accepted', JSON.stringify(created));
    await other.setRef(serverPid, 'micrograph', NEW_M, 'image', sha);
    const p6 = await appPull();
    check('pulled micrograph appears, its image is queued', micro(disk(), NEW_M) && p6.downloads >= 1, JSON.stringify(p6.summary));
    const pushedMid = await svc.push(pid, SERVER, () => {});
    const refsMid = (await sidecar.loadState(folder)).refs;
    check('a push before the download keeps the server\'s image ref', pushedMid.ok && refsMid[`micrograph:${NEW_M}|image`] === sha);
    // The download runs beside pushes: hold the file transfer and push meanwhile
    const realFetch = globalThis.fetch;
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    let reached;
    const atGate = new Promise((resolve) => { reached = resolve; });
    globalThis.fetch = async (url, opts) => {
      if (String(url).includes('/blobs/')) {
        reached();
        await gate;
      }
      return realFetch(url, opts);
    };
    const dlRun = svc.download(pid, SERVER, () => {});
    await atGate;
    await appEdit((p) => { p.datasets[0].samples[0].label = 'edited during the download'; });
    const during = await Promise.race([svc.push(pid, SERVER, () => {}), new Promise((r) => setTimeout(() => r('blocked'), 10000))]);
    check('a push runs while a download is in progress', during !== 'blocked' && during.ok && during.pushed === 1, JSON.stringify(during));
    check('the entity being downloaded stays listed during the push', (await svc.getStatus(pid)).downloads >= 1);
    release();
    globalThis.fetch = realFetch;
    const dl = await dlRun;
    const imgPath = path.join(folder, 'images', NEW_M);
    check('image downloaded and verified', dl.ok && dl.images.includes(NEW_M) && fs.existsSync(imgPath) && (await hashFile(imgPath)) === sha,
      JSON.stringify(dl));
    check('download queue empty', (await svc.getStatus(pid)).downloads === 0);

    // A second computer (another Documents folder) makes its own synced copy
    app.setPath('documents', path.join(tmp, 'Documents2'));
    fs.mkdirSync(path.join(tmp, 'Documents2'), { recursive: true });
    const cl = await svc.clone(serverPid, SERVER, 'manual', () => {});
    const cloneFolder = projectFolders.getAccountCopyPath(pid, SERVER, who.pkey);
    check('clone made', cl.ok && cl.projectId === pid && cloneFolder.includes('Documents2') &&
      fs.existsSync(path.join(cloneFolder, 'project.json')), JSON.stringify(cl));
    const cp = JSON.parse(fs.readFileSync(path.join(cloneFolder, 'project.json'), 'utf8'));
    check('clone has the server\'s state', micro(cp, M1).name === 'Renamed elsewhere' && micro(cp, M1).notes === 'their notes' &&
      !micro(cp, M2) && micro(cp, NEW_M) && micro(cp, NEW_M).name === 'Micrograph from elsewhere');
    check('clone downloaded the originals', fs.existsSync(path.join(cloneFolder, 'images', M1)) &&
      (await hashFile(path.join(cloneFolder, 'images', NEW_M))) === sha && cl.downloaded >= 2, JSON.stringify(cl));
    await ser.saveProjectJson(await ser.loadProjectJson(pid), pid); // the app opens and saves it
    const cst = await svc.getStatus(pid);
    check('clone opened and saved: nothing to push, nothing to pull', cst.synced && cst.pending === 0 && cst.downloads === 0 &&
      cst.conflicts === 0, JSON.stringify(cst));
    const cpull = await svc.pull(pid, SERVER, () => {});
    check('clone pull finds nothing new', cpull.ok && cpull.changes.length === 0 && cpull.summary.received === 0, JSON.stringify(cpull.summary));
    await svc.commitPull(pid, cpull.pullId);
    // The clone's first push makes no tiles and sends no files: the server's
    // tiles are of the same originals (16v; before, every member made and
    // uploaded its own tile archives, which differed by path and time)
    // (the fake other machine above sent NEW_M's original without tiles:
    // those the clone makes and sends, as any copy would)
    const before = (await sidecar.loadState(cloneFolder)).refs;
    const onDisk = (rk) => fs.existsSync(path.join(cloneFolder, 'images', rk.slice(rk.indexOf(':') + 1, rk.indexOf('|'))));
    const hadTiles = Object.keys(before).filter((rk) => rk.endsWith('|tiles') && onDisk(rk));
    const lacked = Object.keys(before).filter((rk) => rk.endsWith('|image') && !before[rk.replace('|image', '|tiles')]);
    const tiled = [];
    const cpush = await svc.push(pid, SERVER, (x) => { if (x.phase === 'tiles') tiled.push(x.item); });
    const cstate = await sidecar.loadState(cloneFolder);
    check('clone push keeps the server\'s tiles, makes only the missing ones', cpush.ok && hadTiles.length > 0 &&
      hadTiles.every((rk) => cstate.refs[rk] === before[rk] && cstate.tileSources[rk] && cstate.tileSources[rk].sha256 === before[rk]) &&
      cpush.filesUploaded === lacked.length && !hadTiles.some((rk) => tiled.includes(rk.slice(rk.indexOf(':') + 1, rk.indexOf('|')))),
    JSON.stringify({ cpush, hadTiles, lacked, tiled, tileSources: cstate.tileSources }).slice(0, 1500));
    // The clone replaces an original (a rotate does): its tiles are made
    // and sent, never taken from the server (whose tiles are of the old one)
    {
      const [first, other] = hadTiles.map((rk) => rk.slice(rk.indexOf(':') + 1, rk.indexOf('|')));
      const otherImage = other ? path.join(cloneFolder, 'images', other) : lacked.length
        ? path.join(cloneFolder, 'images', lacked[0].slice(lacked[0].indexOf(':') + 1, lacked[0].indexOf('|'))) : null;
      fs.copyFileSync(otherImage, path.join(cloneFolder, 'images', first));
      const rk = `micrograph:${first}|tiles`;
      // As right after a download, before this copy's first push: it has
      // not looked at the server's tiles yet (no tileSources entry)
      const fresh = await sidecar.loadState(cloneFolder);
      delete fresh.tileSources[rk];
      await sidecar.saveState(cloneFolder, fresh);
      const oldTiles = fresh.refs[rk];
      const retiled = [];
      const rpush = await svc.push(pid, SERVER, (x) => { if (x.phase === 'tiles') retiled.push(x.item); });
      const rstate = await sidecar.loadState(cloneFolder);
      check('a replaced original gets new tiles from this copy', rpush.ok && retiled.includes(first) &&
        rstate.refs[rk] && rstate.refs[rk] !== oldTiles && rstate.tileSources[rk].sha256 === rstate.refs[rk],
      JSON.stringify({ rpush, retiled, oldTiles, now: rstate.refs[rk] }));
    }
    const again2 = await svc.clone(serverPid, SERVER, 'manual', () => {});
    check('a second clone for the same account is refused', !again2.ok, JSON.stringify(again2));

    // A pull deletes micrographs while their files download (stub client, no server):
    // the image this download created goes; one that was there before stays
    const { downloadFiles } = require(`${E}/sync/pull`);
    const raceFolder = path.join(tmp, 'race');
    fs.mkdirSync(path.join(raceFolder, 'images'), { recursive: true });
    fs.writeFileSync(path.join(raceFolder, 'images', 'OLD'), 'old bytes');
    const raceState = sidecar.newState({ pid: 1 }, 'automatic');
    for (const id of ['NEW', 'OLD']) {
      raceState.base[`micrograph:${id}`] = { type: 'micrograph', id, body: {} };
      raceState.refs[`micrograph:${id}|image`] = 'sha-' + id;
    }
    raceState.downloads = { 'micrograph:NEW|image': 'sha-NEW', 'micrograph:OLD|image': 'sha-OLD' };
    await sidecar.saveState(raceFolder, raceState);
    const raceClient = {
      async downloadFile(_pid, _sha, dest) {
        fs.writeFileSync(dest, 'downloaded');
        const st = await sidecar.loadState(raceFolder); // the pull lands meanwhile
        const id = path.basename(dest);
        delete st.base[`micrograph:${id}`];
        delete st.downloads[`micrograph:${id}|image`];
        await sidecar.saveState(raceFolder, st);
      },
    };
    await downloadFiles({ folder: raceFolder, client: raceClient });
    check('image of a micrograph deleted mid-download removed', !fs.existsSync(path.join(raceFolder, 'images', 'NEW')));
    check('a file that was there before the download stays', fs.existsSync(path.join(raceFolder, 'images', 'OLD')));
  } catch (e) {
    failures++;
    console.log('ERROR', e && e.stack);
  }
  try { fixture('cleanup'); } catch (_) { /* reported above */ }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(failures ? `\n${failures} FAILED (${passes} passed)` : `\nALL PASSED (${passes} checks)`);
  app.exit(failures ? 1 : 0);
});
