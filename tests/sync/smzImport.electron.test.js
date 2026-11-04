/**
 * Importing a project file next to synced copies (electron/smzImport.js,
 * spec v3 11.4): my synced copy is never replaced, a separate copy gets a
 * new id, a local-only twin is replaced, version history of an id that has
 * an account copy is kept.
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

/** An .smz holding <id>/project.json */
async function makeSmz(file, project) {
  const { createZipArchive } = require(`${E}/zipArchive`);
  const archive = await createZipArchive();
  const out = fs.createWriteStream(file);
  const done = new Promise((resolve, reject) => { out.on('close', resolve); archive.on('error', reject); });
  archive.pipe(out);
  archive.append(JSON.stringify(project), { name: `${project.id}/project.json` });
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
  } catch (e) {
    failures++;
    console.log('ERROR', e && e.stack);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(failures ? `\n${failures} FAILED (${passes} passed)` : `\nALL PASSED (${passes} checks)`);
  app.exit(failures ? 1 : 0);
});
