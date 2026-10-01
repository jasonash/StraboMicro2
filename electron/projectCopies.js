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

module.exports = {
  moveProjectToAccount,
  rekeyTileCaches,
};
