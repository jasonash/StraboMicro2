/**
 * Moving a project between local-only and account copies
 *
 * Turning sync on moves a local-only project (StraboMicro2Data/<id>) into
 * its account folder (StraboMicro2Data/accounts/<serverHost>/<pkey>/<id>).
 * The move is a rename on the same disk, so it is instant at any size; the
 * caller does it while the project is not loaded (before opening or after
 * closing), so Windows has no open files in the folder. Tiles survive: the
 * tile cache is keyed by image path, so each image's cache is re-keyed.
 */

const fs = require('fs');
const path = require('path');
const log = require('electron-log');
const projectFolders = require('./projectFolders');
const tileCache = require('./tileCache');
const { withRetry } = require('./atomicFile');

/** Folders whose images have tile caches (uiImages: legacy v1 projects). */
const TILED_FOLDERS = ['images', 'uiImages'];

/**
 * Re-key the tile cache of every image after a project folder moved
 * @param {string} fromFolder
 * @param {string} toFolder
 * @returns {Promise<number>} Caches moved
 */
async function rekeyTileCaches(fromFolder, toFolder) {
  let moved = 0;
  for (const sub of TILED_FOLDERS) {
    let names = [];
    try {
      names = await fs.promises.readdir(path.join(toFolder, sub));
    } catch (_) {
      continue;
    }
    for (const name of names) {
      try {
        if (await tileCache.rekeyImage(path.join(fromFolder, sub, name), path.join(toFolder, sub, name))) moved++;
      } catch (err) {
        log.warn(`[ProjectCopies] Could not keep tiles for ${sub}/${name}: ${err.message}`);
      }
    }
  }
  return moved;
}

/**
 * Move a local-only project into an account's folder (turning sync on)
 * @param {string} projectId
 * @param {string} serverUrl - The StraboSpot server the copy is bound to
 * @param {string | number} pkey - The account's user pkey on that server
 * @returns {Promise<string>} The new project folder
 */
async function moveProjectToAccount(projectId, serverUrl, pkey) {
  const from = path.join(projectFolders.getStraboMicro2DataPath(), projectId);
  const to = projectFolders.getAccountCopyPath(projectId, serverUrl, pkey);
  if (!fs.existsSync(path.join(from, 'project.json'))) {
    throw new Error(`No local-only project ${projectId} to move`);
  }
  if (fs.existsSync(to)) {
    throw new Error(`This account already has a copy of project ${projectId}`);
  }
  await fs.promises.mkdir(path.dirname(to), { recursive: true });
  await withRetry(() => fs.promises.rename(from, to));
  projectFolders.useProjectCopy(projectId, to);
  const tiles = await rekeyTileCaches(from, to);
  log.info(`[ProjectCopies] Moved project ${projectId} to ${to} (${tiles} tile caches kept)`);
  return to;
}

/**
 * Turn a synced copy (not loaded) into a separate local-only project with a
 * NEW id that never syncs (17j leave and keep, 17k removed, later 17p
 * shared project deleted). The folder moves to StraboMicro2Data/<new id>,
 * its sync state goes, project.json gets the new id (name unchanged), and
 * version history starts with one version of the copy as it was: the old
 * id's versions stay with that id (they carry the old id, so restoring one
 * here would bring it back).
 * @param {string} projectId - The synced copy's id
 * @param {string} [versionLabel] - Name of the first version
 * @returns {Promise<{ projectId: string, folder: string, name: string }>}
 */
async function makeSeparateCopy(projectId, versionLabel = 'Separate copy made') {
  const crypto = require('crypto');
  const projectSerializer = require('./projectSerializer');
  const versionHistory = require('./versionHistory');
  const projectsIndex = require('./projectsIndex');
  const from = projectFolders.getProjectFolderPath(projectId);
  if (!projectFolders.accountOfFolder(from) || !fs.existsSync(path.join(from, 'project.json'))) {
    throw new Error(`Project ${projectId} has no synced copy on this computer`);
  }
  const newId = crypto.randomUUID();
  const to = projectFolders.getLocalProjectPath(newId);
  await withRetry(() => fs.promises.rename(from, to));
  projectFolders.useProjectCopy(newId, to);
  let project;
  try {
    project = await projectSerializer.loadProjectJson(newId);
    if (!project) throw new Error('project.json could not be read');
    project.id = newId;
    await projectSerializer.saveProjectJson(project, newId);
  } catch (err) {
    // Put the synced copy back as it was
    projectFolders.forgetProjectCopy(newId);
    await withRetry(() => fs.promises.rename(to, from));
    projectFolders.useProjectCopy(projectId, from);
    throw err;
  }
  projectFolders.forgetProjectCopy(projectId);
  await fs.promises.rm(path.join(to, 'sync'), { recursive: true, force: true });
  const tiles = await rekeyTileCaches(from, to);
  try {
    await versionHistory.createVersion(newId, project, versionLabel, null);
  } catch (err) {
    log.warn(`[ProjectCopies] First version of the separate copy failed: ${err.message}`);
  }
  await projectsIndex.removeProject(projectId);
  await projectsIndex.updateProjectOpened(newId, project.name || 'Untitled Project');
  log.info(`[ProjectCopies] Synced copy ${projectId} is now the separate copy ${newId} (${tiles} tile caches kept)`);
  return { projectId: newId, folder: to, name: project.name || '' };
}

module.exports = {
  moveProjectToAccount,
  makeSeparateCopy,
  rekeyTileCaches,
};
