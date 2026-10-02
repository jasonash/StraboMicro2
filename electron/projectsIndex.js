/**
 * Projects Index Service
 *
 * Manages a lightweight index file (projects-index.json) that tracks all local
 * projects for quick access via the "Recent Projects" menu. The index stores
 * project IDs, names, and last-opened timestamps.
 *
 * The index is stored in the app's userData folder (not the projects folder)
 * to be less intrusive to users' data directories.
 *
 * The index is rebuilt on app startup by scanning ~/Documents/StraboMicro2Data/
 * and reading each project.json file. This ensures the index stays in sync
 * even if users manually add/remove project folders.
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const log = require('electron-log');
const projectFolders = require('./projectFolders');
const accounts = require('./accounts');

/**
 * One entry per project copy: a local-only project (account null) or an
 * account's synced copy ({ server: folder name, pkey }). Recent Projects
 * shows the copies of the logged-in account (else the last one) plus
 * local-only projects (spec v3 §11.4, 16d).
 */
function entryKey(id, account) {
  return account ? `${id}|${account.server}/${account.pkey}` : `${id}|`;
}

/** The folder of an index entry's copy */
function entryFolder(entry) {
  return entry.account
    ? path.join(projectFolders.getStraboMicro2DataPath(), 'accounts', entry.account.server, entry.account.pkey, entry.id)
    : path.join(projectFolders.getStraboMicro2DataPath(), entry.id);
}

// Index file location (inside app userData folder)
const INDEX_FILENAME = 'projects-index.json';

/**
 * Get the path to the projects index file
 * @returns {string} Path to projects-index.json in app userData folder
 */
function getIndexPath() {
  return path.join(app.getPath('userData'), INDEX_FILENAME);
}

/**
 * Load the current index from disk
 * @returns {Promise<Object>} Index data with projects array
 */
async function loadIndex() {
  const indexPath = getIndexPath();

  try {
    await fs.promises.access(indexPath, fs.constants.F_OK);
    const content = await fs.promises.readFile(indexPath, 'utf8');
    const index = JSON.parse(content);
    return index;
  } catch (error) {
    // Index doesn't exist or is invalid - return empty index
    if (error.code === 'ENOENT') {
      log.info('[ProjectsIndex] Index file does not exist, will create on rebuild');
    } else {
      log.warn('[ProjectsIndex] Error loading index, will rebuild:', error.message);
    }
    return { projects: [] };
  }
}

/**
 * Save the index to disk
 * @param {Object} index - Index data with projects array
 * @returns {Promise<void>}
 */
async function saveIndex(index) {
  const indexPath = getIndexPath();

  try {
    // Ensure StraboMicro2Data directory exists
    await projectFolders.ensureStraboMicro2DataDir();

    await fs.promises.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf8');
    log.info(`[ProjectsIndex] Saved index with ${index.projects.length} project(s)`);
  } catch (error) {
    log.error('[ProjectsIndex] Error saving index:', error);
    throw error;
  }
}

/**
 * Read project name from a project.json file
 * @param {string} projectId - Project UUID
 * @param {string} [folderPath] - The copy to read (default: the copy the app resolves)
 * @returns {Promise<Object|null>} Project info or null if invalid
 */
async function readProjectInfo(projectId, folderPath) {
  const projectJson = path.join(folderPath || projectFolders.getProjectFolderPath(projectId), 'project.json');

  try {
    await fs.promises.access(projectJson, fs.constants.F_OK);
    const content = await fs.promises.readFile(projectJson, 'utf8');
    const projectData = JSON.parse(content);

    return {
      id: projectId,
      name: projectData.name || 'Untitled Project',
      // Use modifiedTimestamp from project.json, or file mtime as fallback
      lastModified: projectData.modifiedTimestamp || null,
    };
  } catch (error) {
    // project.json doesn't exist or is invalid
    log.debug(`[ProjectsIndex] Could not read project.json for ${projectId}: ${error.message}`);
    return null;
  }
}

/**
 * Rebuild the index by scanning all project folders
 * This should be called on app startup
 * @returns {Promise<Object>} Updated index
 */
async function rebuildIndex() {
  log.info('[ProjectsIndex] Rebuilding index from disk...');

  // Load existing index to preserve lastOpened timestamps (by copy; an
  // entry from before copies were listed separately matches by id)
  const existingIndex = await loadIndex();
  const existingByKey = new Map(existingIndex.projects.map(p => [entryKey(p.id, p.account), p]));
  const existingById = new Map(existingIndex.projects.map(p => [p.id, p]));

  // Every project copy: local-only folders, then synced account copies
  const copies = await projectFolders.listProjectCopies();

  log.info(`[ProjectsIndex] Found ${copies.length} project folder(s)`);

  // Read info from each project (only those with valid project.json)
  const projects = [];
  for (const copy of copies) {
    const info = await readProjectInfo(copy.projectId, copy.folderPath);
    if (info) {
      // Preserve lastOpened from existing index, or use lastModified as initial value
      const existing = existingByKey.get(entryKey(copy.projectId, copy.account)) || existingById.get(copy.projectId);
      projects.push({
        id: info.id,
        name: info.name,
        account: copy.account,
        lastOpened: existing?.lastOpened || info.lastModified || new Date().toISOString(),
      });
    }
  }

  // Sort by lastOpened (most recent first)
  projects.sort((a, b) => {
    const dateA = new Date(a.lastOpened || 0);
    const dateB = new Date(b.lastOpened || 0);
    return dateB.getTime() - dateA.getTime();
  });

  const newIndex = { projects };
  await saveIndex(newIndex);

  log.info(`[ProjectsIndex] Index rebuilt with ${projects.length} project(s)`);
  return newIndex;
}

/**
 * Update the lastOpened timestamp for a project
 * Call this when a project is opened or saved
 * @param {string} projectId - Project UUID
 * @param {string} projectName - Project name (in case it changed)
 * @returns {Promise<void>}
 */
async function updateProjectOpened(projectId, projectName) {
  log.info(`[ProjectsIndex] Updating lastOpened for project: ${projectId}`);

  const index = await loadIndex();
  const now = new Date().toISOString();
  // The copy the app uses now
  const account = projectFolders.accountOfFolder(projectFolders.getProjectFolderPath(projectId));
  const key = entryKey(projectId, account);

  // Find existing entry or create new one
  const existingIdx = index.projects.findIndex(p => entryKey(p.id, p.account) === key);
  if (existingIdx >= 0) {
    // Update existing entry
    index.projects[existingIdx].lastOpened = now;
    index.projects[existingIdx].name = projectName;
  } else {
    // Add new entry
    index.projects.push({
      id: projectId,
      name: projectName,
      account,
      lastOpened: now,
    });
  }

  // Re-sort by lastOpened (most recent first)
  index.projects.sort((a, b) => {
    const dateA = new Date(a.lastOpened || 0);
    const dateB = new Date(b.lastOpened || 0);
    return dateB.getTime() - dateA.getTime();
  });

  await saveIndex(index);
}

/**
 * Remove a project from the index
 * Call this when a project is deleted: the entries of its copies that are
 * no longer on disk go (other accounts' copies stay)
 * @param {string} projectId - Project UUID
 * @returns {Promise<void>}
 */
async function removeProject(projectId) {
  log.info(`[ProjectsIndex] Removing project from index: ${projectId}`);

  const index = await loadIndex();
  index.projects = index.projects.filter(
    p => p.id !== projectId || fs.existsSync(path.join(entryFolder(p), 'project.json'))
  );
  await saveIndex(index);
}

/**
 * Get the list of recent projects: local-only projects plus the copies of
 * the logged-in account, or, logged out, of the last account, labeled with
 * its owner ("Jason's copy", spec v3 16d). One entry per project id: the
 * account's copy when there is also a local-only one (as opening does).
 * @param {number} limit - Maximum number of projects to return (default 10)
 * @returns {Promise<Array>} Array of project entries sorted by lastOpened,
 *   each with ownerLabel (null unless it is the last account's copy, logged out)
 */
async function getRecentProjects(limit = 10) {
  const index = await loadIndex();
  const active = accounts.getActive();
  const own = active || accounts.getLast();
  const ownServer = own ? projectFolders.serverFolderName(own.server) : null;
  const isOwn = (p) => Boolean(own && p.account && p.account.server === ownServer && String(p.account.pkey) === own.pkey);
  const visible = index.projects.filter(p => !p.account || isOwn(p));
  const withOwnCopy = new Set(visible.filter(isOwn).map(p => p.id));
  const { copyLabel } = require('./shared/accountNames.mjs');
  return visible
    .filter(p => p.account || !withOwnCopy.has(p.id))
    .slice(0, limit)
    .map(p => ({ ...p, ownerLabel: !active && p.account && own ? copyLabel(own.name, own.email) : null }));
}

/**
 * Get all projects in the index
 * @returns {Promise<Array>} Array of all project entries
 */
async function getAllProjects() {
  const index = await loadIndex();
  return index.projects;
}

module.exports = {
  getIndexPath,
  loadIndex,
  saveIndex,
  readProjectInfo,
  rebuildIndex,
  updateProjectOpened,
  removeProject,
  getRecentProjects,
  getAllProjects,
};
