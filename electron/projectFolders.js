/**
 * Project Folder Structure Management
 *
 * This module handles the creation and management of the StraboMicro2 project
 * folder structure for backwards compatibility with the legacy JavaFX app.
 *
 * Folder Structure:
 * ~/Documents/StraboMicro2Data/
 * ├── accounts/<serverHost>/<pkey>/<project-uuid>/   (synced copies, same layout as below)
 * └── <project-uuid>/                                 (local-only projects)
 *     ├── associatedFiles/
 *     ├── compositeImages/        (2000px max, micrograph+overlays, JPEG)
 *     ├── compositeThumbnails/    (250px max, micrograph+overlays, JPEG)
 *     ├── images/                 (full-size JPEG, named by micrograph ID, NO extension)
 *     ├── uiImages/               (2500px max, JPEG, for legacy app)
 *     ├── webImages/              (750px max, JPEG, for web upload)
 *     ├── webThumbnails/          (200px max, JPEG, for web upload)
 *     └── project.json            (legacy schema format)
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const os = require('os');
const crypto = require('crypto');

/**
 * Fallback Documents path derived purely from the home/profile directory.
 * Used only when Electron's shell-aware lookup is unavailable (e.g. app not
 * ready) — assumes Documents lives literally under the user profile, which is
 * NOT true when Windows redirects the Known Folder (OneDrive, roaming profiles).
 * @returns {string} Best-guess path to Documents folder
 */
function getFallbackDocumentsPath() {
  const platform = os.platform();

  switch (platform) {
    case 'win32': // Windows
      return process.env.USERPROFILE
        ? path.join(process.env.USERPROFILE, 'Documents')
        : path.join(os.homedir(), 'Documents');

    case 'darwin': // macOS
    case 'linux': // Linux (most distros use ~/Documents)
      return path.join(os.homedir(), 'Documents');

    default:
      // Fallback to home directory
      return os.homedir();
  }
}

/**
 * Get the platform-specific path to the user's Documents folder.
 *
 * Prefers Electron's `app.getPath('documents')`, which queries the OS shell for
 * the real Known Folder location. This is essential on Windows, where Documents
 * is routinely relocated by OneDrive "Known Folder Move" — in that case the
 * literal `%USERPROFILE%\Documents` may not exist as a directory at all, which
 * caused ENOTDIR failures creating the data folder (Sentry 2026-06-21).
 *
 * Falls back to a home-directory guess if the shell lookup is unavailable.
 * @returns {string} Path to Documents folder
 */
function getDocumentsPath() {
  try {
    // app.getPath throws if the location can't be resolved; it also requires
    // the app to be ready (always true by the time IPC handlers run).
    const documents = app.getPath('documents');
    if (documents) return documents;
  } catch (error) {
    console.warn(
      `[ProjectFolders] app.getPath('documents') failed, falling back to profile path:`,
      error
    );
  }

  return getFallbackDocumentsPath();
}

/**
 * Get the path to the StraboMicro2Data root directory
 * @returns {string} Path to StraboMicro2Data folder
 */
function getStraboMicro2DataPath() {
  return path.join(getDocumentsPath(), 'StraboMicro2Data');
}

/**
 * Ensure the StraboMicro2Data root directory exists
 * Creates it if it doesn't exist
 * @returns {Promise<string>} Path to StraboMicro2Data folder
 */
async function ensureStraboMicro2DataDir() {
  const dataPath = getStraboMicro2DataPath();

  try {
    // Check if directory exists
    await fs.promises.access(dataPath, fs.constants.F_OK);
    console.log(`[ProjectFolders] StraboMicro2Data directory exists: ${dataPath}`);
  } catch (error) {
    // Directory doesn't exist, create it
    console.log(`[ProjectFolders] Creating StraboMicro2Data directory: ${dataPath}`);
    try {
      await fs.promises.mkdir(dataPath, { recursive: true });
      console.log(`[ProjectFolders] Successfully created StraboMicro2Data directory`);
    } catch (mkdirError) {
      // ENOTDIR means a parent path component exists but is not a directory —
      // typically a OneDrive Known Folder redirect leaving %USERPROFILE%\Documents
      // as a non-directory placeholder. Surface something actionable instead of raw ENOTDIR.
      if (mkdirError && mkdirError.code === 'ENOTDIR') {
        const friendly = new Error(
          `Could not create the StraboMicro2 data folder because the Documents folder ` +
          `location ("${getDocumentsPath()}") is not a usable directory. This can happen ` +
          `when OneDrive has redirected your Documents folder. Please ensure your Documents ` +
          `folder is available locally, then try again.`
        );
        friendly.code = 'ENOTDIR';
        friendly.path = mkdirError.path;
        throw friendly;
      }
      throw mkdirError;
    }
  }

  return dataPath;
}

// ---------------------------------------------------------------------------
// Project copies
//
// A local-only project lives at StraboMicro2Data/<projectId>. A synced copy
// lives at StraboMicro2Data/accounts/<serverHost>/<pkey>/<projectId>: one
// copy per StraboSpot account and server, so two people sharing a computer
// never push under each other's name, and a dev-server copy is never mistaken
// for a production one (collaboration spec v3 §11.4). Everything else in the
// app addresses a project by id; getProjectFolderPath() resolves which copy.
// ---------------------------------------------------------------------------

const ACCOUNTS_DIR = 'accounts';

/** Folder name for a server: its host (and port), safe on every platform. */
function serverFolderName(serverUrl) {
  let host = String(serverUrl || '').trim();
  try {
    host = new URL(host.includes('://') ? host : `https://${host}`).host;
  } catch (_) { /* keep the raw text */ }
  const safe = host.toLowerCase().replace(/[^a-z0-9.-]+/g, '_').replace(/^[._]+|[._]+$/g, '');
  if (!safe) throw new Error(`Cannot make a folder name for server "${serverUrl}"`);
  return safe;
}

/** StraboMicro2Data/accounts/<serverHost>/<pkey> */
function getAccountFolderPath(serverUrl, pkey) {
  const key = String(pkey);
  if (!/^\d+$/.test(key)) throw new Error(`Invalid account key "${pkey}"`);
  return path.join(getStraboMicro2DataPath(), ACCOUNTS_DIR, serverFolderName(serverUrl), key);
}

/** Where an account's synced copy of a project lives (whether or not it exists). */
function getAccountCopyPath(projectId, serverUrl, pkey) {
  return path.join(getAccountFolderPath(serverUrl, pkey), projectId);
}

/** projectId => folder of the copy in use (set when a copy is opened or moved). */
const copiesInUse = new Map();

/**
 * Use this copy of a project from now on (the app opened it, or it moved).
 * @param {string} projectId
 * @param {string} folderPath
 */
function useProjectCopy(projectId, folderPath) {
  copiesInUse.set(projectId, folderPath);
}

/** Stop pinning a copy (it was deleted); lookups fall back to the default rules. */
function forgetProjectCopy(projectId) {
  copiesInUse.delete(projectId);
}

/**
 * Account copies of a project found on disk (synchronous; small folder tree).
 * @param {string} projectId
 * @returns {string[]}
 */
function findAccountCopies(projectId) {
  const root = path.join(getStraboMicro2DataPath(), ACCOUNTS_DIR);
  const out = [];
  let servers = [];
  try {
    servers = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory());
  } catch (_) {
    return out;
  }
  for (const server of servers) {
    let accounts = [];
    try {
      accounts = fs.readdirSync(path.join(root, server.name), { withFileTypes: true }).filter((d) => d.isDirectory());
    } catch (_) {
      continue;
    }
    for (const account of accounts) {
      const candidate = path.join(root, server.name, account.name, projectId);
      if (fs.existsSync(path.join(candidate, 'project.json'))) out.push(candidate);
    }
  }
  return out;
}

/**
 * Get the path to a specific project folder: the copy in use if one was set,
 * else the local-only folder if it exists, else the only account copy on
 * disk, else the local-only location (new projects are created there).
 * @param {string} projectId - UUID of the project
 * @returns {string} Path to project folder
 */
function getProjectFolderPath(projectId) {
  const inUse = copiesInUse.get(projectId);
  if (inUse) return inUse;
  const local = path.join(getStraboMicro2DataPath(), projectId);
  if (fs.existsSync(local)) return local;
  const copies = findAccountCopies(projectId);
  return copies.length === 1 ? copies[0] : local;
}

/**
 * Every project copy on disk.
 * @returns {Promise<Array<{projectId: string, folderPath: string, account: null | {server: string, pkey: string}}>>}
 */
async function listProjectCopies() {
  const out = [];
  for (const projectId of await listProjectFolders()) {
    out.push({ projectId, folderPath: path.join(getStraboMicro2DataPath(), projectId), account: null });
  }
  const root = path.join(getStraboMicro2DataPath(), ACCOUNTS_DIR);
  const dirs = async (p) => {
    try {
      return (await fs.promises.readdir(p, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
    } catch (_) {
      return [];
    }
  };
  for (const server of await dirs(root)) {
    for (const pkey of await dirs(path.join(root, server))) {
      for (const projectId of await dirs(path.join(root, server, pkey))) {
        const folderPath = path.join(root, server, pkey, projectId);
        if (fs.existsSync(path.join(folderPath, 'project.json'))) {
          out.push({ projectId, folderPath, account: { server, pkey } });
        }
      }
    }
  }
  return out;
}

/**
 * Create a complete project folder structure for a new project
 * @param {string} projectId - UUID of the project
 * @returns {Promise<Object>} Object containing paths to all created folders
 */
async function createProjectFolders(projectId) {
  console.log(`[ProjectFolders] Creating project folder structure for: ${projectId}`);

  // Ensure root StraboMicro2Data directory exists
  await ensureStraboMicro2DataDir();

  // Create project folder
  const projectPath = getProjectFolderPath(projectId);

  // Define all subfolders
  const subfolders = [
    'associatedFiles',
    'compositeImages',
    'compositeThumbnails',
    'images',
    'uiImages',
    'webImages',
    'webThumbnails'
  ];

  // Create project folder and all subfolders
  try {
    // Create project folder
    await fs.promises.mkdir(projectPath, { recursive: true });
    console.log(`[ProjectFolders] Created project folder: ${projectPath}`);

    // Create all subfolders
    const folderPaths = {};
    for (const subfolder of subfolders) {
      const subfolderPath = path.join(projectPath, subfolder);
      await fs.promises.mkdir(subfolderPath, { recursive: true });
      folderPaths[subfolder] = subfolderPath;
      console.log(`[ProjectFolders] Created subfolder: ${subfolder}`);
    }

    console.log(`[ProjectFolders] Successfully created all folders for project: ${projectId}`);

    return {
      projectPath,
      ...folderPaths
    };
  } catch (error) {
    console.error(`[ProjectFolders] Error creating project folders:`, error);
    throw error;
  }
}

/**
 * Check if a project folder exists
 * @param {string} projectId - UUID of the project
 * @returns {Promise<boolean>} True if folder exists, false otherwise
 */
async function projectFolderExists(projectId) {
  const projectPath = getProjectFolderPath(projectId);

  try {
    await fs.promises.access(projectPath, fs.constants.F_OK);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Get paths to all subfolders for a project
 * @param {string} projectId - UUID of the project
 * @returns {Object} Object containing paths to all subfolders
 */
function getProjectFolderPaths(projectId) {
  const projectPath = getProjectFolderPath(projectId);

  return {
    projectPath,
    associatedFiles: path.join(projectPath, 'associatedFiles'),
    compositeImages: path.join(projectPath, 'compositeImages'),
    compositeThumbnails: path.join(projectPath, 'compositeThumbnails'),
    images: path.join(projectPath, 'images'),
    uiImages: path.join(projectPath, 'uiImages'),
    webImages: path.join(projectPath, 'webImages'),
    webThumbnails: path.join(projectPath, 'webThumbnails'),
    projectJson: path.join(projectPath, 'project.json')
  };
}

/**
 * Delete a project folder and all its contents
 * WARNING: This is a destructive operation!
 * @param {string} projectId - UUID of the project
 * @returns {Promise<void>}
 */
async function deleteProjectFolder(projectId) {
  const projectPath = getProjectFolderPath(projectId);

  console.log(`[ProjectFolders] WARNING: Deleting project folder: ${projectPath}`);

  try {
    // maxRetries/retryDelay: on Windows, sync clients (OneDrive) and antivirus
    // hold transient locks that surface as EPERM/EBUSY/ENOTEMPTY on rmdir;
    // fs.rm retries those codes automatically with escalating backoff. Retries
    // compound across the recursive walk, so keep the budget modest: 5/200
    // rides out a few seconds of lock per directory but still fails within
    // ~20s (measured on Node 18) if a lock is never released.
    await fs.promises.rm(projectPath, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200
    });
    forgetProjectCopy(projectId);
    console.log(`[ProjectFolders] Successfully deleted project folder: ${projectId}`);
  } catch (error) {
    console.error(`[ProjectFolders] Error deleting project folder:`, error);

    if (error && (error.code === 'EPERM' || error.code === 'EBUSY' || error.code === 'ENOTEMPTY')) {
      const friendly = new Error(
        `Could not remove the project folder because another program is locking it — ` +
        `often OneDrive or antivirus syncing/scanning "${error.path || projectPath}". ` +
        `Pause file syncing (or wait a minute) and try again.`
      );
      friendly.code = error.code;
      friendly.path = error.path;
      throw friendly;
    }

    throw error;
  }
}

/**
 * List the local-only project folders in StraboMicro2Data (not account copies)
 * @returns {Promise<Array<string>>} Array of project UUIDs
 */
async function listProjectFolders() {
  const dataPath = getStraboMicro2DataPath();

  try {
    // Check if StraboMicro2Data exists
    await fs.promises.access(dataPath, fs.constants.F_OK);

    // Read directory contents
    const entries = await fs.promises.readdir(dataPath, { withFileTypes: true });

    // Filter for directories only (accounts/ holds synced copies, see listProjectCopies)
    const projectIds = entries
      .filter(entry => entry.isDirectory() && entry.name !== ACCOUNTS_DIR)
      .map(entry => entry.name);

    console.log(`[ProjectFolders] Found ${projectIds.length} project(s) in StraboMicro2Data`);
    return projectIds;
  } catch (error) {
    // If directory doesn't exist, return empty array
    if (error.code === 'ENOENT') {
      console.log(`[ProjectFolders] StraboMicro2Data directory does not exist yet`);
      return [];
    }
    throw error;
  }
}

/**
 * Compute the SHA-256 hex digest of a file by streaming it
 * @param {string} filePath - Full path to the file
 * @returns {Promise<string>} Hex digest
 */
function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(filePath)
      .on('error', reject)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')));
  });
}

/**
 * Check whether two files have identical content (size first, then hash)
 * @param {string} pathA - Full path to the first file
 * @param {string} pathB - Full path to the second file
 * @returns {Promise<boolean>} True if the contents are identical
 */
async function filesHaveSameContent(pathA, pathB) {
  const [statA, statB] = await Promise.all([fs.promises.stat(pathA), fs.promises.stat(pathB)]);
  if (statA.size !== statB.size) return false;
  const [hashA, hashB] = await Promise.all([hashFile(pathA), hashFile(pathB)]);
  return hashA === hashB;
}

/**
 * Build a numbered variant of a filename: "EDS map.png" -> "EDS map (2).png"
 * @param {string} fileName - Original filename
 * @param {number} n - Number to insert
 * @returns {string} Numbered filename
 */
function numberedFileName(fileName, n) {
  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);
  return `${base} (${n})${ext}`;
}

/**
 * Copy a file to the project's associatedFiles folder.
 *
 * The folder is flat and attachments reference files by name only, so a name
 * must always mean one content. If the desired name is free, the file is copied
 * under it. If a file with that name (compared case-insensitively, so macOS,
 * Windows and Linux agree) already holds IDENTICAL content, it is reused. If it
 * holds DIFFERENT content, the next free or identical numbered name is used
 * ("EDS map (2).png"). Callers must store the returned fileName.
 *
 * @param {string} sourcePath - Full path to the source file
 * @param {string} projectId - UUID of the project
 * @param {string} fileName - Desired filename in the associatedFiles folder
 * @returns {Promise<Object>} { destinationPath, fileName, renamed, reused, success }
 */
async function copyFileToAssociatedFiles(sourcePath, projectId, fileName) {
  console.log(`[ProjectFolders] Copying file to associatedFiles for project: ${projectId}`);
  console.log(`[ProjectFolders] Source: ${sourcePath}`);
  console.log(`[ProjectFolders] Filename: ${fileName}`);

  try {
    // Check if source file exists
    await fs.promises.access(sourcePath, fs.constants.R_OK);

    // Get project folder paths
    const paths = getProjectFolderPaths(projectId);

    // Ensure associatedFiles folder exists
    await fs.promises.mkdir(paths.associatedFiles, { recursive: true });

    // Existing names, keyed case-insensitively
    const existing = new Map();
    for (const name of await fs.promises.readdir(paths.associatedFiles)) {
      existing.set(name.toLowerCase(), name);
    }

    for (let n = 1; n <= 9999; n++) {
      const candidate = n === 1 ? fileName : numberedFileName(fileName, n);
      const onDisk = existing.get(candidate.toLowerCase());

      if (!onDisk) {
        const destinationPath = path.join(paths.associatedFiles, candidate);
        await fs.promises.copyFile(sourcePath, destinationPath);
        console.log(`[ProjectFolders] Successfully copied file to: ${destinationPath}`);
        return {
          destinationPath,
          fileName: candidate,
          renamed: candidate !== fileName,
          reused: false,
          success: true
        };
      }

      const destinationPath = path.join(paths.associatedFiles, onDisk);
      if (await filesHaveSameContent(sourcePath, destinationPath)) {
        // Same content already stored under this name: reuse it
        console.log(`[ProjectFolders] Identical file already present, reusing: ${destinationPath}`);
        return {
          destinationPath,
          fileName: onDisk,
          renamed: onDisk !== fileName,
          reused: true,
          success: true
        };
      }
      // Different content under this name: try the next numbered name
    }

    throw new Error(`No free filename for ${fileName}`);
  } catch (error) {
    console.error(`[ProjectFolders] Error copying file:`, error);
    throw error;
  }
}

/**
 * Clean up orphaned files in the project's associatedFiles folder.
 * Compares files on disk against all filenames referenced in the project data,
 * and deletes any files not referenced.
 * @param {string} projectId - UUID of the project
 * @param {object} projectData - The full project metadata object
 * @returns {Promise<number>} Number of orphaned files deleted
 */
async function cleanupOrphanedAssociatedFiles(projectId, projectData) {
  const paths = getProjectFolderPaths(projectId);
  const assocDir = paths.associatedFiles;

  // Read files on disk (may not exist yet)
  let filesOnDisk;
  try {
    filesOnDisk = await fs.promises.readdir(assocDir);
  } catch (error) {
    if (error.code === 'ENOENT') return 0; // No directory, nothing to clean
    throw error;
  }

  if (filesOnDisk.length === 0) return 0;

  // Build set of all referenced file names from project data
  const referencedFiles = new Set();
  for (const dataset of projectData.datasets || []) {
    for (const sample of dataset.samples || []) {
      for (const micrograph of sample.micrographs || []) {
        for (const af of micrograph.associatedFiles || []) {
          if (af.fileName) referencedFiles.add(af.fileName);
        }
        for (const spot of micrograph.spots || []) {
          for (const af of spot.associatedFiles || []) {
            if (af.fileName) referencedFiles.add(af.fileName);
          }
        }
      }
    }
  }

  // Delete orphaned files
  let deletedCount = 0;
  for (const fileName of filesOnDisk) {
    if (!referencedFiles.has(fileName)) {
      const filePath = path.join(assocDir, fileName);
      try {
        await fs.promises.unlink(filePath);
        console.log(`[ProjectFolders] Deleted orphaned associated file: ${fileName}`);
        deletedCount++;
      } catch (error) {
        console.error(`[ProjectFolders] Failed to delete orphaned file ${fileName}:`, error);
      }
    }
  }

  if (deletedCount > 0) {
    console.log(`[ProjectFolders] Cleaned up ${deletedCount} orphaned associated file(s)`);
  }

  return deletedCount;
}

module.exports = {
  getDocumentsPath,
  getStraboMicro2DataPath,
  ensureStraboMicro2DataDir,
  getProjectFolderPath,
  createProjectFolders,
  projectFolderExists,
  getProjectFolderPaths,
  deleteProjectFolder,
  listProjectFolders,
  listProjectCopies,
  serverFolderName,
  getAccountFolderPath,
  getAccountCopyPath,
  useProjectCopy,
  forgetProjectCopy,
  copyFileToAssociatedFiles,
  cleanupOrphanedAssociatedFiles
};
