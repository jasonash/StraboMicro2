/**
 * End-to-end test of turning sync on and pushing, against the local dev
 * server (StraboBackendDevKit, http://localhost). Runs inside Electron with
 * Documents and userData in a temporary folder.
 *
 *   npm run test:sync-engine
 *
 * Needs the dev Docker stack (strabo-php) with MICROSYNC_ENABLED, the
 * fixture user owner@test.strabospot.org, and the copied prod folder
 * straboMicroFiles/727 (9 micrographs with nesting, 36 spots, an attachment
 * on a spot, 2 point count sessions). Server projects use the mscli-
 * prefix and are removed at the end (tests/microsync/client_fixture.php).
 */

const { app } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const FIXTURE = path.join(os.homedir(), 'Desktop/Work/StraboBackendDevKit/www/straboMicroFiles/727');
const SERVER = 'http://localhost';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'smsync-'));
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
    const { createSyncClient } = require(`${E}/sync/client`);
    const { turnSyncOn, pushProject } = require(`${E}/sync/syncEngine`);
    const sidecar = require(`${E}/sync/sidecar`);
    const projectFolders = require(`${E}/projectFolders`);
    const { normalizeProject } = require(`${E}/shared/entityModel.mjs`);
    const { deepEqual } = require(`${E}/shared/deepEqual.mjs`);

    fixture('cleanup');
    const who = fixture('token');
    const client = createSyncClient({ restServer: SERVER, getAccessToken: async () => who.token });
    check('server ping', (await client.ping()).ok === true);

    // A local-only project made from the fixture, under a test id
    const pid = `mscli-${crypto.randomUUID()}`;
    const local = path.join(projectFolders.getStraboMicro2DataPath(), pid);
    fs.mkdirSync(local, { recursive: true });
    for (const sub of ['images', 'compositeThumbnails', 'associatedFiles', 'point-counts']) {
      fs.cpSync(path.join(FIXTURE, sub), path.join(local, sub), { recursive: true });
    }
    const p0 = JSON.parse(fs.readFileSync(path.join(FIXTURE, 'project.json'), 'utf8'));
    p0.id = pid;
    p0.name = 'Client sync test';
    p0.datasets[0].isExpanded = true; // per-user: must not reach the server
    fs.writeFileSync(path.join(local, 'project.json'), JSON.stringify(p0, null, 2));

    const readLocal = () => {
      const folder = projectFolders.getProjectFolderPath(pid);
      const project = JSON.parse(fs.readFileSync(path.join(folder, 'project.json'), 'utf8'));
      const ids = new Set(micrographs(project).map((m) => m.id));
      const pcs = fs.readdirSync(path.join(folder, 'point-counts')).filter((n) => n.endsWith('.json')).sort()
        .map((n) => JSON.parse(fs.readFileSync(path.join(folder, 'point-counts', n), 'utf8')))
        .filter((pc) => ids.has(pc.micrographId)); // orphaned sessions are not synced
      return { folder, project, pcs };
    };
    const writeLocal = (fn) => {
      const { folder, project } = readLocal();
      fn(project, folder);
      fs.writeFileSync(path.join(folder, 'project.json'), JSON.stringify(project, null, 2));
    };
    const micrographs = (p) => p.datasets.flatMap((d) => d.samples.flatMap((s) => s.micrographs));
    /** Server copy (after a build) equals the local project and has every file ref. */
    const compare = (label, serverPid) => {
      fixture('build', serverPid);
      const a = fixture('assembled', serverPid);
      const { project, pcs } = readLocal();
      const want = normalizeProject(project).project;
      check(`${label}: server project equals local`, a && deepEqual(a.project, want), firstDiff(a && a.project, want));
      const wantPcs = pcs.map((x) => { const y = { ...x }; delete y.isExpanded; return y; });
      check(`${label}: point counts equal`, a && deepEqual(
        [...a.pointCounts].sort((x, y) => (x.id < y.id ? -1 : 1)), [...wantPcs].sort((x, y) => (x.id < y.id ? -1 : 1))));
      const ms = micrographs(project);
      const refs = a ? a.refs : {};
      const missing = [];
      for (const m of ms) {
        for (const role of ['image', 'thumbnail', 'tiles']) {
          if (!refs[role] || !refs[role][`micrograph:${m.id}`]) missing.push(`${role} ${m.id}`);
        }
      }
      check(`${label}: image, thumbnail and tiles ref for every micrograph`, missing.length === 0, missing.join(', '));
      return a;
    };

    // Turn sync on
    const progress = [];
    const imageBytes = [];
    const on = await turnSyncOn({ projectId: pid, restServer: SERVER, user: { pkey: who.pkey, email: who.email }, client, onProgress: (x) => { progress.push(x.phase); if (x.phase === 'images') imageBytes.push(x); } });
    check('turn sync on', on.status === 'synced' && on.pid > 0, JSON.stringify(on));
    const accountFolder = projectFolders.getAccountCopyPath(pid, SERVER, who.pkey);
    check('folder moved into the account folder', on.folder === accountFolder && !fs.existsSync(local) && fs.existsSync(path.join(accountFolder, 'project.json')));
    const state = await sidecar.loadState(accountFolder);
    check('sidecar written: binding, ready, base, refs', state && state.binding.pid === on.pid && state.phase === 'ready' &&
      Object.keys(state.base).length > 40 && Object.keys(state.refs).length >= 27, JSON.stringify(state && { phase: state.phase, base: Object.keys(state.base).length, refs: Object.keys(state.refs).length }));
    check('progress reported for images, push, tiles, files', ['images', 'push', 'tiles', 'files'].every((ph) => progress.includes(ph)));
    const lastBytes = imageBytes[imageBytes.length - 1];
    check('image progress counts bytes up to the total (status chip percentage)',
      imageBytes.length > 0 && lastBytes.bytesTotal > 0 && lastBytes.bytesDone === lastBytes.bytesTotal &&
      imageBytes.every((x, i) => x.bytesDone <= x.bytesTotal && (i === 0 || x.bytesDone >= imageBytes[i - 1].bytesDone)),
      JSON.stringify(imageBytes.slice(-3)));
    const meta = await client.getProject(on.pid);
    check('server project is ready', meta.syncState === 'ready');
    const first = compare('first upload', on.pid);
    check('attachment ref on its spot', first && first.refs['associated_file:RotatingMeeting_Information.textClipping'] &&
      Object.keys(first.refs['associated_file:RotatingMeeting_Information.textClipping'])[0].startsWith('spot:'));
    check('per-user field not on the server', first && first.project.datasets[0].isExpanded === undefined);

    // Nothing changed: nothing sent
    const idle = await pushProject({ folder: accountFolder, client });
    check('push with no changes sends nothing', idle.pushed === 0 && idle.filesUploaded === 0 && idle.problems.length === 0, JSON.stringify(idle));

    // Local edits
    let spotWithFile = null;
    writeLocal((p) => {
      const ms = micrographs(p);
      ms[0].name = 'Renamed reference';
      ms[0].notes = 'note added';
      delete ms[1].description;
      ms[2].spots = ms[2].spots || [];
      ms[2].spots.push({ id: crypto.randomUUID(), name: 'new spot', geometryType: 'point', points: [{ X: 10, Y: 20 }] });
      const withSpots = ms.find((m) => (m.spots || []).some((s) => !s.associatedFiles));
      withSpots.spots.splice(withSpots.spots.findIndex((s) => !s.associatedFiles), 1);
      p.datasets[0].samples[0].micrographs.reverse();
      p.tags.push({ id: crypto.randomUUID(), name: 'pushed tag' });
      for (const m of ms) for (const s of m.spots || []) if (s.associatedFiles) { spotWithFile = s; delete s.associatedFiles; }
    });
    const edit = await pushProject({ folder: accountFolder, client });
    check('edits pushed without problems', edit.pushed > 0 && edit.problems.length === 0, JSON.stringify(edit.problems).slice(0, 800));
    const second = compare('after edits', on.pid);
    check('removed attachment ref removed', second && !(second.refs['associated_file:RotatingMeeting_Information.textClipping'] || {})[`spot:${spotWithFile && spotWithFile.id}`]);

    // A new micrograph with a new image: image uploaded before the create
    const newId = crypto.randomUUID();
    writeLocal((p, folder) => {
      const src = micrographs(p)[0];
      fs.copyFileSync(path.join(folder, 'images', src.id), path.join(folder, 'images', newId));
      fs.appendFileSync(path.join(folder, 'images', newId), Buffer.from([0]));
      fs.copyFileSync(path.join(folder, 'compositeThumbnails', src.id), path.join(folder, 'compositeThumbnails', newId));
      const m = JSON.parse(JSON.stringify(src));
      m.id = newId;
      m.name = 'New micrograph';
      m.spots = [{ id: crypto.randomUUID(), name: 'on new micrograph' }];
      delete m.parentID;
      p.datasets[0].samples[0].micrographs.push(m);
    });
    const added = await pushProject({ folder: accountFolder, client });
    check('new micrograph pushed', added.pushed >= 3 && added.filesUploaded >= 2 && added.problems.length === 0, JSON.stringify(added));
    compare('after new micrograph', on.pid);

    // Delete a micrograph that has nested children: one delete, the server cascades
    let deletedIds = [];
    writeLocal((p) => {
      const s = p.datasets[0].samples[0];
      const parent = s.micrographs.find((m) => s.micrographs.some((c) => c.parentID === m.id));
      deletedIds = [parent.id, ...s.micrographs.filter((c) => c.parentID === parent.id).map((c) => c.id)];
      s.micrographs = s.micrographs.filter((m) => !deletedIds.includes(m.id));
    });
    const orphaned = readLocal().pcs.length;
    const del = await pushProject({ folder: accountFolder, client });
    check('cascade delete pushed', del.problems.length === 0, JSON.stringify(del.problems).slice(0, 800));
    const again2 = await pushProject({ folder: accountFolder, client });
    check('orphaned point count files are not pushed again', again2.pushed === 0 && again2.problems.length === 0, JSON.stringify(again2));
    check('fixture really has orphaned point counts now', fs.readdirSync(path.join(accountFolder, 'point-counts')).length > orphaned);
    const st = await sidecar.loadState(accountFolder);
    check('deleted micrographs and their spots gone from the base', deletedIds.every((id) => !st.base[`micrograph:${id}`]) &&
      !Object.values(st.base).some((e) => e.type === 'spot' && deletedIds.includes(e.parentId)));
    compare('after cascade delete', on.pid);

    // A file ref for a micrograph deleted on the server meanwhile (not pulled yet) is skipped, not retried forever
    const st2 = await sidecar.loadState(accountFolder);
    const doomed = st2.base[`micrograph:${newId}`];
    const gone = await client.push(on.pid, crypto.randomUUID(), 'another-computer',
      [{ op: 'delete', type: 'micrograph', id: newId, baseVersion: doomed.version }]);
    check('another computer deletes the new micrograph', gone.results[0].status === 'accepted', JSON.stringify(gone.results));
    const thumbRk = `micrograph:${newId}|thumbnail`;
    const oldThumb = st2.refs[thumbRk];
    fs.appendFileSync(path.join(accountFolder, 'compositeThumbnails', newId), Buffer.from([1, 2, 3]));
    let skipped;
    try {
      skipped = await pushProject({ folder: accountFolder, client });
    } catch (err) {
      skipped = { error: err.message };
    }
    const st3 = await sidecar.loadState(accountFolder);
    check('a thumbnail for a micrograph deleted on the server does not stop the push', skipped && !skipped.error &&
      st3.refs[thumbRk] === oldThumb, JSON.stringify(skipped).slice(0, 300));

    // A role that may not change files (a Viewer, 403 forbidden on upload and refs) does not stop the push
    let uploadCalls = 0;
    const forbidding = createSyncClient({
      restServer: SERVER,
      getAccessToken: async () => who.token,
      fetchImpl: async (url, init) => {
        if (/\/(uploads|refs)/.test(String(url))) {
          uploadCalls++;
          return new Response(JSON.stringify({ error: 'forbidden', message: 'Viewers cannot upload' }), { status: 403 });
        }
        return fetch(url, init);
      },
    });
    const liveMic = Object.keys((await sidecar.loadState(accountFolder)).base).find((k) => k.startsWith('micrograph:'));
    const liveId = liveMic.slice(liveMic.indexOf(':') + 1);
    fs.appendFileSync(path.join(accountFolder, 'compositeThumbnails', liveId), Buffer.from([4, 5, 6]));
    let refusedFiles;
    try {
      refusedFiles = await pushProject({ folder: accountFolder, client: forbidding });
    } catch (err) {
      refusedFiles = { error: err.message };
    }
    check('a file my role may not upload (403) does not stop the push', refusedFiles && !refusedFiles.error && uploadCalls > 0,
      JSON.stringify(refusedFiles).slice(0, 300));
    // A copy that knows it is a Viewer does not try files at all
    const vs = await sidecar.loadState(accountFolder);
    await sidecar.saveState(accountFolder, { ...vs, role: 'viewer' });
    uploadCalls = 0;
    const asViewer = await pushProject({ folder: accountFolder, client: forbidding });
    check('a Viewer\'s copy sends no files', asViewer && uploadCalls === 0, `calls ${uploadCalls}`);
    await sidecar.saveState(accountFolder, { ...(await sidecar.loadState(accountFolder)), role: 'owner' });

    // Turning sync on again resumes (no new server project, nothing to send)
    const again = await turnSyncOn({ projectId: pid, restServer: SERVER, user: { pkey: who.pkey, email: who.email }, client });
    check('turning sync on again resumes the same project', again.status === 'synced' && again.pid === on.pid);
  } catch (e) {
    failures++;
    console.log('ERROR', e && e.stack);
  }
  try { fixture('cleanup'); } catch (_) { /* reported above */ }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(failures ? `\n${failures} FAILED (${passes} passed)` : `\nALL PASSED (${passes} checks)`);
  app.exit(failures ? 1 : 0);
});

function firstDiff(a, b, p = '') {
  const { deepEqual } = require(`${E}/shared/deepEqual.mjs`);
  if (deepEqual(a, b)) return '';
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const d = firstDiff(a[k], b[k], `${p}.${k}`);
      if (d) return d;
    }
  }
  return `${p}: server ${JSON.stringify(a)?.slice(0, 300)} vs local ${JSON.stringify(b)?.slice(0, 300)}`;
}
