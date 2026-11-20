/**
 * Importing a project file next to synced copies (electron/smzImport.js,
 * spec v3 11.4): my synced copy is never replaced, a separate copy gets a
 * new id, a local-only twin is replaced, version history of an id that has
 * an account copy is kept. A replace keeps this computer's images of the
 * micrographs the file has no image for (Sentry ELECTRON-39).
 *
 *   npm run test:smz-import
 *
 * Runs in a temporary Documents and userData; no server needed.
 */

const { app } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'smzimport-'));
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
    console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ''}`);
  }
}

/** An .smz holding <id>/project.json, plus extra entries (path in the project -> content) */
async function makeSmz(file, project, extra = {}) {
  const { createZipArchive } = require(`${E}/zipArchive`);
  const archive = await createZipArchive();
  const out = fs.createWriteStream(file);
  const done = new Promise((resolve, reject) => { out.on('close', resolve); archive.on('error', reject); });
  archive.pipe(out);
  archive.append(JSON.stringify(project), { name: `${project.id}/project.json` });
  for (const [name, content] of Object.entries(extra)) {
    archive.append(Buffer.from(content), { name: `${project.id}/${name}` });
  }
  await archive.finalize();
  await done;
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

app.whenReady().then(async () => {
  try {
    const projectFolders = require(`${E}/projectFolders`);
    const smzImport = require(`${E}/smzImport`);
    const data = projectFolders.getStraboMicro2DataPath();
    const P = 'f0a1b2c3-0000-4000-8000-000000000001';
    const smz = path.join(tmp, 'basalt.smz');
    await makeSmz(smz, { id: P, name: 'Basalt', datasets: [] });

    // My synced copy of P, with something in it and a version history
    projectFolders.setPreferredAccount({ server: 'https://strabospot.org', pkey: 5 });
    const mine = projectFolders.getAccountCopyPath(P, 'https://strabospot.org', 5);
    fs.mkdirSync(path.join(mine, 'sync'), { recursive: true });
    fs.writeFileSync(path.join(mine, 'project.json'), JSON.stringify({ id: P, name: 'Basalt (mine)', datasets: [] }));
    fs.writeFileSync(path.join(mine, 'sync', 'state.json'), '{}');
    const history = path.join(app.getPath('userData'), 'version-history', P);
    fs.mkdirSync(history, { recursive: true });
    fs.writeFileSync(path.join(history, 'manifest.json'), '{}');
    projectFolders.useProjectCopy(P, mine); // it is the open copy

    const inspect = await smzImport.inspectSmz(smz);
    check('inspect: my synced copy, no local copy', inspect.success && inspect.syncedCopy === true && inspect.projectExists === false,
      JSON.stringify(inspect));

    const refused = await smzImport.importSmz(smz, () => {});
    check('plain import next to my synced copy is refused', !refused.success, JSON.stringify(refused));
    check('my synced copy untouched', readJson(path.join(mine, 'project.json')).name === 'Basalt (mine)' &&
      fs.existsSync(path.join(mine, 'sync', 'state.json')));

    const copy = await smzImport.importSmz(smz, () => {}, { asCopy: true });
    const copyFolder = copy.projectId ? path.join(data, copy.projectId) : '';
    check('separate copy: new id, "(copy)" name, local-only folder',
      copy.success && copy.projectId !== P && /^[0-9a-f-]{36}$/.test(copy.projectId) &&
      copy.projectData.id === copy.projectId && copy.projectData.name === 'Basalt (copy)' &&
      readJson(path.join(copyFolder, 'project.json')).id === copy.projectId, JSON.stringify({ ...copy, projectData: copy.projectData && { id: copy.projectData.id, name: copy.projectData.name } }));
    check('separate copy: my synced copy, its pin and version history untouched',
      readJson(path.join(mine, 'project.json')).name === 'Basalt (mine)' && fs.existsSync(path.join(mine, 'sync', 'state.json')) &&
      projectFolders.getProjectFolderPath(P) === mine && fs.existsSync(path.join(history, 'manifest.json')));

    // Logged out with no last account: P has another account's copy pinned and a local twin
    projectFolders.setPreferredAccount(null);
    const local = projectFolders.getLocalProjectPath(P);
    fs.mkdirSync(local, { recursive: true });
    fs.writeFileSync(path.join(local, 'project.json'), JSON.stringify({ id: P, name: 'Old local', datasets: [] }));
    const twin = await smzImport.inspectSmz(smz);
    check('inspect: local twin, no synced copy of mine', twin.success && twin.projectExists === true && twin.syncedCopy === false,
      JSON.stringify(twin));
    const replaced = await smzImport.importSmz(smz, () => {});
    check('local twin replaced', replaced.success && replaced.projectId === P && readJson(path.join(local, 'project.json')).name === 'Basalt',
      JSON.stringify({ success: replaced.success, error: replaced.error }));
    check('the import is the copy in use now', projectFolders.getProjectFolderPath(P) === local);
    check('the account copy and the shared version history stay',
      readJson(path.join(mine, 'project.json')).name === 'Basalt (mine)' && fs.existsSync(path.join(history, 'manifest.json')));

    // Share codes (17b): own id per code, name kept; the same code replaces that copy
    const Q = 'f0a1b2c3-0000-4000-8000-000000000002';
    const smzQ = path.join(tmp, 'granite.smz');
    await makeSmz(smzQ, { id: Q, name: 'Granite', datasets: [] });
    let si = await smzImport.inspectSmz(smzQ, { shareCode: 'abc123' });
    check('share code: first time, nothing to replace', si.success && si.projectExists === false && si.syncedCopy === false, JSON.stringify(si));
    const s1 = await smzImport.importSmz(smzQ, () => {}, { shareCode: 'abc123' });
    const s1Folder = s1.projectId ? projectFolders.getLocalProjectPath(s1.projectId) : '';
    check('share code: new id, name kept, local-only', s1.success && s1.projectId !== Q &&
      readJson(path.join(s1Folder, 'project.json')).id === s1.projectId && s1.projectData.name === 'Granite' &&
      !fs.existsSync(projectFolders.getLocalProjectPath(Q)), JSON.stringify({ success: s1.success, id: s1.projectId, error: s1.error }));
    const codesFile = path.join(app.getPath('userData'), 'share-codes.json');
    check('share code: recorded in userData, not in project.json', readJson(codesFile).abc123 === s1.projectId &&
      !JSON.stringify(readJson(path.join(s1Folder, 'project.json'))).includes('abc123'));
    fs.writeFileSync(path.join(s1Folder, 'project.json'), JSON.stringify({ id: s1.projectId, name: 'Granite (edited)', datasets: [] }));
    si = await smzImport.inspectSmz(smzQ, { shareCode: 'ABC123' });
    check('share code again: offers to replace the copy it made', si.success && si.projectExists === true && si.projectId === s1.projectId,
      JSON.stringify(si));
    const s2 = await smzImport.importSmz(smzQ, () => {}, { shareCode: 'abc123' });
    check('share code again: replaces that copy (same id)', s2.success && s2.projectId === s1.projectId &&
      readJson(path.join(s1Folder, 'project.json')).name === 'Granite', JSON.stringify({ success: s2.success, id: s2.projectId }));
    const another = await smzImport.importSmz(smzQ, () => {}, { shareCode: 'zzz999' });
    check('another code for the same project: its own copy', another.success && another.projectId !== s1.projectId && another.projectId !== Q);

    // A copy made before 17b kept the original id: the code replaces it, as before
    si = await smzImport.inspectSmz(smz, { shareCode: 'old111' });
    check('pre-17b share-code copy: replaced in place', si.success && si.projectExists === true && si.projectId === P, JSON.stringify(si));
    const s3 = await smzImport.importSmz(smz, () => {}, { shareCode: 'old111' });
    check('pre-17b share-code copy: same id, recorded', s3.success && s3.projectId === P && readJson(codesFile).old111 === P);

    // My synced copy of the shared project's id is no obstacle (and untouched)
    fs.rmSync(local, { recursive: true, force: true });
    projectFolders.setPreferredAccount({ server: 'https://strabospot.org', pkey: 5 });
    const s4 = await smzImport.importSmz(smz, () => {}, { shareCode: 'new222' });
    check('share code next to my synced copy: a new copy, synced copy untouched', s4.success && s4.projectId !== P &&
      readJson(path.join(mine, 'project.json')).name === 'Basalt (mine)' && fs.existsSync(path.join(mine, 'sync', 'state.json')),
      JSON.stringify({ success: s4.success, id: s4.projectId, error: s4.error }));

    // ELECTRON-39: a file without some images replaces a local copy that has them
    projectFolders.setPreferredAccount(null);
    const R = 'f0a1b2c3-0000-4000-8000-000000000003';
    const withMicrographs = (id, name, ids) => ({
      id, name, datasets: [{ id: 'd1', name: 'D', samples: [{ id: 's1', name: 'S', micrographs: ids.map((m) => ({ id: m, name: m })) }] }],
    });
    // Real-looking image bytes are not needed: the replace moves files, it does not decode them
    const smzR = path.join(tmp, 'partial.smz');
    await makeSmz(smzR, withMicrographs(R, 'Partial', ['m1', 'm2', 'm3', 'm4', 'm5']),
      { 'images/m1': 'file-m1', 'images/m5': '' });
    const localR = projectFolders.getLocalProjectPath(R);
    const writeLocalR = () => {
      fs.rmSync(localR, { recursive: true, force: true });
      fs.mkdirSync(path.join(localR, 'images'), { recursive: true });
      fs.writeFileSync(path.join(localR, 'project.json'), JSON.stringify(withMicrographs(R, 'Local', ['m1', 'm2', 'm3', 'm9'])));
      for (const m of ['m1', 'm2', 'm3', 'm9']) fs.writeFileSync(path.join(localR, 'images', m), `local-${m}`);
    };
    writeLocalR();
    const ri = await smzImport.inspectSmz(smzR);
    check('inspect: counts the micrographs without an image in the file (a zero-byte entry is none)',
      ri.success && ri.projectExists === true && ri.micrographCount === 5 && ri.missingImages === 4, JSON.stringify(ri));
    check('inspect: of those, the images this computer has', ri.keptImages === 2, JSON.stringify(ri));

    const keptFolder = path.join(app.getPath('userData'), 'import-kept-images', R);
    const img = (m) => path.join(localR, 'images', m);
    const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null);
    const rr = await smzImport.importSmz(smzR, () => {});
    check('replace: succeeds and reports the kept images', rr.success && rr.keptImages === 2,
      JSON.stringify({ success: rr.success, kept: rr.keptImages, error: rr.error }));
    check('replace: the file\'s image wins where it has one', read(img('m1')) === 'file-m1', String(read(img('m1'))));
    check('replace: this computer\'s images kept where the file has none', read(img('m2')) === 'local-m2' && read(img('m3')) === 'local-m3',
      `${read(img('m2'))} ${read(img('m3'))}`);
    check('replace: no image where neither has one; nothing kept for a micrograph the file dropped',
      !fs.existsSync(img('m4')) && !fs.existsSync(img('m9')));
    check('replace: the holding folder is gone', !fs.existsSync(keptFolder));
    check('replace: the rest is the file\'s project', readJson(path.join(localR, 'project.json')).name === 'Partial');

    // The import fails after the local copy was deleted: the kept images go back
    writeLocalR();
    const realCreate = projectFolders.createProjectFolders;
    projectFolders.createProjectFolders = async () => { throw new Error('disk full (test)'); };
    let rf;
    try {
      rf = await smzImport.importSmz(smzR, () => {});
    } finally {
      projectFolders.createProjectFolders = realCreate;
    }
    check('failed replace: reported as failed', rf && !rf.success && /disk full/.test(rf.error || ''), JSON.stringify(rf));
    check('failed replace: the images moved aside are back', read(img('m2')) === 'local-m2' && read(img('m3')) === 'local-m3',
      `${read(img('m2'))} ${read(img('m3'))}`);
    check('failed replace: the holding folder is gone', !fs.existsSync(keptFolder));

    // A file with no images and nothing on this computer: told, nothing kept
    const S = 'f0a1b2c3-0000-4000-8000-000000000004';
    const smzS = path.join(tmp, 'noimages.smz');
    await makeSmz(smzS, withMicrographs(S, 'No images', ['a', 'b']));
    const ni = await smzImport.inspectSmz(smzS);
    check('inspect: a fresh file with no images', ni.success && ni.projectExists === false &&
      ni.micrographCount === 2 && ni.missingImages === 2 && ni.keptImages === 0, JSON.stringify(ni));
    const nr = await smzImport.importSmz(smzS, () => {});
    check('fresh import of a file with no images still imports', nr.success && nr.keptImages === 0, JSON.stringify({ success: nr.success, error: nr.error }));

    // Legacy (numeric id): uiImages/<id> counts as the image
    const L = '17671200000001';
    const smzL = path.join(tmp, 'legacy.smz');
    await makeSmz(smzL, withMicrographs(L, 'Legacy', ['17671200000002', '17671200000003']),
      { 'uiImages/17671200000002': 'ui', 'images/17671200000003': 'orig' });
    const li = await smzImport.inspectSmz(smzL);
    check('inspect: a legacy file\'s uiImages count as images', li.success && li.missingImages === 0 && li.micrographCount === 2, JSON.stringify(li));

    // A v1 file is saved in the app's own form at import, times kept: the
    // server's copy of the same project then matches it (2.0.60: a v1 import
    // of a synced project gave a conflict on every entity)
    const { inAppFormat, rewriteInAppFormat } = require(`${E}/projectSerializer`);
    const { deepEqual } = require(`${E}/deepEqual`);
    const { explode } = require(`${E}/shared/entityModel.mjs`);
    const V = '16918797370001';
    const v1 = {
      id: V, name: 'Olympics', date: '2023-08-12T22:35:37Z', modifiedTimestamp: '1744071412804', projectLocation: 'remote',
      datasets: [{
        id: '17388662920001', name: 'Billets', date: '2025-02-06T18:24:52.282Z', modifiedTimestamp: '1744058546155',
        samples: [{
          id: '17440528190001', existsOnServer: false, label: 'OL23-25', sampleID: 'OL23-25', name: 'OL23-25',
          inplacenessOfSample: '', orientedSample: 'unknown', sampleNotes: '', isExpanded: true,
          micrographs: [{
            id: '17440738530001', name: 'OL23-25-c-1', imageType: 'Plane Polarized Light', width: 2500, height: 1383,
            polish: false, polishDescription: '', notes: '', scalePixelsPerCentimeter: 430.693835542644,
            orientationInfo: { orientationMethod: 'unoriented' }, isMicroVisible: true,
            instrument: { instrumentType: 'Optical Microscopy', dataType: '', instrumentBrand: '' },
            spots: [{
              id: '17440747030001', name: 'RSCM_run0', labelColor: '0xffffffff', showLabel: false, color: '0xff00ffff',
              date: '2025-04-08T01:11:18.170Z', time: '2025-04-08T01:11:18.170Z', notes: '', modifiedTimestamp: 1744074678172,
              geometryType: 'point', points: [{ X: 1064.9965886761988, Y: 1154.0235283136174 }],
            }],
          }],
        }],
      }],
    };
    const normalized = inAppFormat(v1);
    const rawEntities = explode(v1, []);
    const differingRaw = rawEntities.order.filter((k) => !deepEqual(rawEntities.entities[k], explode(normalized, []).entities[k]));
    check('v1 fixture: raw and app form differ in every entity but the dataset (what made the conflicts)',
      differingRaw.length === 4 && !differingRaw.some((k) => k.startsWith('dataset:')), JSON.stringify(differingRaw));
    const smzV = path.join(tmp, 'v1.smz');
    await makeSmz(smzV, v1);
    const vr = await smzImport.importSmz(smzV, () => {});
    const vFile = path.join(projectFolders.getLocalProjectPath(V), 'project.json');
    const onDisk = vr.success ? readJson(vFile) : null;
    check('v1 import: project.json is in the app\'s own form', vr.success && deepEqual(onDisk, normalized),
      JSON.stringify({ success: vr.success, error: vr.error, project: onDisk && Object.keys(onDisk) }));
    check('v1 import: the project and dataset keep their modified times',
      !!onDisk && onDisk.modifiedTimestamp === '1744071412804' && onDisk.datasets[0].modifiedTimestamp === '1744058546155',
      JSON.stringify(onDisk && { p: onDisk.modifiedTimestamp, d: onDisk.datasets[0].modifiedTimestamp }));
    check('v1 import: numbers rounded as a save rounds them',
      !!onDisk && onDisk.datasets[0].samples[0].micrographs[0].spots[0].points[0].X === 1064.9965886762);
    check('app form: rewriting again changes nothing', (await rewriteInAppFormat(vFile)) === false);

    // A real v1 project.json (V1_PROJECT_JSON=/path/to/project.json): app form, times kept, stable
    if (process.env.V1_PROJECT_JSON) {
      const real = readJson(process.env.V1_PROJECT_JSON);
      const realFile = path.join(tmp, 'real-project.json');
      fs.writeFileSync(realFile, JSON.stringify(real));
      const changed = await rewriteInAppFormat(realFile);
      const after = readJson(realFile);
      const before = explode(real, []);
      const now = explode(after, []);
      const again = explode(inAppFormat(after), []);
      check('real v1: rewritten', changed === true);
      check('real v1: same entities, the project and dataset times kept',
        deepEqual(now.order, before.order) && after.modifiedTimestamp === real.modifiedTimestamp &&
        after.datasets.every((d, i) => d.modifiedTimestamp === real.datasets[i].modifiedTimestamp));
      check('real v1: in app form every entity is stable', now.order.every((k) => deepEqual(now.entities[k], again.entities[k])));
      console.log(`  real v1: ${before.order.length} entities, ${before.order.filter((k) => !deepEqual(before.entities[k], now.entities[k])).length} in another form before`);
    }
  } catch (e) {
    failures++;
    console.log('ERROR', e && e.stack);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(failures ? `\n${failures} FAILED (${passes} passed)` : `\nALL PASSED (${passes} checks)`);
  app.exit(failures ? 1 : 0);
});
