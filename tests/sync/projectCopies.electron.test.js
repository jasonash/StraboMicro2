/**
 * Tests for project copies (projectFolders resolver, projectCopies move,
 * tile cache re-keying, hard links). Runs inside Electron with Documents and
 * userData pointed at a temporary folder, so real data is never touched.
 *
 *   npm run test:project-copies
 */

const { app } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'smcopies-'));
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

app.whenReady().then(async () => {
  try {
    const sharp = require('sharp');
    const projectFolders = require(`${E}/projectFolders`);
    const projectCopies = require(`${E}/projectCopies`);
    const tileCache = require(`${E}/tileCache`);
    const tileGenerator = require(`${E}/tileGenerator`);
    const projectsIndex = require(`${E}/projectsIndex`);
    const imageConverter = require(`${E}/imageConverter`);
    const { linkOrCopyFile, copyFileAtomic } = require(`${E}/atomicFile`);
    await tileCache.ensureCacheDir?.();

    const data = projectFolders.getStraboMicro2DataPath();
    check('data root under the temporary Documents', data.startsWith(tmp));

    // Folder names
    check('server folder: host', projectFolders.serverFolderName('https://strabospot.org') === 'strabospot.org');
    check('server folder: port kept, made safe', projectFolders.serverFolderName('http://localhost:8080/') === 'localhost_8080');
    check('server folder: bare host, case folded', projectFolders.serverFolderName('StraboSpot.org') === 'strabospot.org');
    let threw = false;
    try { projectFolders.getAccountFolderPath('https://strabospot.org', '../x'); } catch { threw = true; }
    check('account key must be numeric', threw);
    check('account copy path', projectFolders.getAccountCopyPath('P1', 'https://strabospot.org', 5) ===
      path.join(data, 'accounts', 'strabospot.org', '5', 'P1'));

    // A local-only project with a real image and real tiles
    const pid = 'proj-1';
    await projectFolders.createProjectFolders(pid);
    const local = path.join(data, pid);
    check('new project resolves to the local-only folder', projectFolders.getProjectFolderPath(pid) === local);
    fs.writeFileSync(path.join(local, 'project.json'), JSON.stringify({ id: pid, name: 'Copy Test', datasets: [] }));
    const img = path.join(local, 'images', 'mic-1');
    await sharp({ create: { width: 700, height: 500, channels: 3, background: { r: 200, g: 50, b: 20 } } }).jpeg().toFile(img);
    await tileGenerator.processImageComplete(img);
    const oldCache = await tileCache.isCacheValid(img);
    check('tiles cached for the local path', oldCache.exists);

    // Move into the account folder
    const to = await projectCopies.moveProjectToAccount(pid, 'https://strabospot.org', 5);
    check('moved to accounts/<server>/<pkey>/<id>', to === path.join(data, 'accounts', 'strabospot.org', '5', pid) &&
      fs.existsSync(path.join(to, 'project.json')) && !fs.existsSync(local));
    check('resolver follows the move', projectFolders.getProjectFolderPath(pid) === to);
    const newImg = path.join(to, 'images', 'mic-1');
    const newCache = await tileCache.isCacheValid(newImg);
    check('tiles survive the move (valid for the new path)', newCache.exists, JSON.stringify(newCache).slice(0, 200));
    check('old cache key gone', !fs.existsSync(tileCache.getCacheDir(oldCache.hash)));
    const again = await tileGenerator.processImageComplete(newImg);
    check('no re-tiling needed after the move', again.fromCache === true, JSON.stringify(again).slice(0, 200));

    threw = false;
    try { await projectCopies.moveProjectToAccount(pid, 'https://strabospot.org', 5); } catch { threw = true; }
    check('moving again fails (no local-only project left)', threw);

    // Resolver without a pinned copy finds the only account copy
    projectFolders.forgetProjectCopy(pid);
    check('resolver finds the single account copy on disk', projectFolders.getProjectFolderPath(pid) === to);

    // Listing and Recent Projects
    const copies = await projectFolders.listProjectCopies();
    const mine = copies.find((c) => c.projectId === pid);
    check('listProjectCopies reports the account copy', mine && mine.folderPath === to &&
      mine.account && mine.account.server === 'strabospot.org' && mine.account.pkey === '5', JSON.stringify(copies));
    check('accounts/ is not listed as a local project', !(await projectFolders.listProjectFolders()).includes('accounts'));
    const index = await projectsIndex.rebuildIndex();
    const entry = index.projects.find((p) => p.id === pid);
    check('Recent Projects index still has the moved project', entry && entry.name === 'Copy Test' && entry.account?.pkey === '5', JSON.stringify(index));

    // Moving onto an existing account copy is refused
    // createProjectFolders(pid) would resolve to the copy in use (BatchImportDialog relies on
    // that for existing projects), so make a local-only folder with the same id by hand
    fs.mkdirSync(local, { recursive: true });
    fs.writeFileSync(path.join(local, 'project.json'), JSON.stringify({ id: pid, name: 'Second' }));
    projectFolders.useProjectCopy(pid, to); // the synced copy is the one open
    check('createProjectFolders on an open synced project targets its copy',
      (await projectFolders.createProjectFolders(pid)).projectPath === to);
    threw = false;
    try { await projectCopies.moveProjectToAccount(pid, 'https://strabospot.org', 5); } catch { threw = true; }
    check('move refused when the account already has a copy', threw && fs.existsSync(local) && fs.existsSync(to));
    projectFolders.forgetProjectCopy(pid);
    check('local-only folder wins over account copies when not pinned', projectFolders.getProjectFolderPath(pid) === local);
    projectFolders.useProjectCopy(pid, to);
    check('a pinned copy wins', projectFolders.getProjectFolderPath(pid) === to);
    fs.rmSync(local, { recursive: true, force: true });

    // Two account copies, nothing pinned: ambiguous, falls back to the local location
    const other = projectFolders.getAccountCopyPath(pid, 'http://localhost:8080', 5);
    fs.mkdirSync(other, { recursive: true });
    fs.writeFileSync(path.join(other, 'project.json'), JSON.stringify({ id: pid, name: 'Dev copy' }));
    projectFolders.forgetProjectCopy(pid);
    check('two account copies and none pinned: no guess', projectFolders.getProjectFolderPath(pid) === local);

    // Image conversion writes into the copy in use
    projectFolders.useProjectCopy(pid, to);
    const src = path.join(tmp, 'source.png');
    await sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 1, g: 2, b: 3 } } }).png().toFile(src);
    await imageConverter.convertAndSaveMicrographImage(src, pid, 'mic-2', projectFolders.getProjectFolderPath(pid));
    check('micrograph image saved into the account copy', fs.existsSync(path.join(to, 'images', 'mic-2')));

    // Hard links between two accounts' copies
    const linked = path.join(other, 'images', 'mic-1');
    fs.mkdirSync(path.dirname(linked), { recursive: true });
    const how = await linkOrCopyFile(newImg, linked);
    check('second copy hard-links the original', how === 'linked' && fs.statSync(linked).ino === fs.statSync(newImg).ino);
    const replacement = path.join(tmp, 'replacement.jpg');
    fs.writeFileSync(replacement, 'not the same bytes');
    await copyFileAtomic(replacement, newImg);
    check('replacing one copy leaves the other intact', fs.readFileSync(linked).length !== fs.statSync(newImg).size &&
      fs.statSync(linked).ino !== fs.statSync(newImg).ino);
    threw = false;
    try { await linkOrCopyFile(newImg, linked); } catch { threw = true; }
    check('link refuses an existing target', threw);
  } catch (e) {
    failures++;
    console.log('ERROR', e && e.stack);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(failures ? `\n${failures} FAILED (${passes} passed)` : `\nALL PASSED (${passes} checks)`);
  app.exit(failures ? 1 : 0);
});
