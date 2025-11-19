/**
 * Project Folder Structure Management
 *
 * This module handles the creation and management of the StraboMicro2 project
 * folder structure for backwards compatibility with the legacy JavaFX app.
 *
 * Folder Structure:
 * ~/Documents/StraboMicro2Data/
 * └── <project-uuid>/
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

/**
 * Get the platform-specific path to the user's Documents folder
 * @returns {string} Path to Documents folder
 */
function getDocumentsPath() {
  const platform = os.platform();

  switch (platform) {
    case 'darwin': // macOS
      return path.join(os.homedir(), 'Documents');

    case 'win32': // Windows
      // Try to get the Documents folder from Windows environment
      const winDocuments = process.env.USERPROFILE
        ? path.join(process.env.USERPROFILE, 'Documents')
        : path.join(os.homedir(), 'Documents');
      return winDocuments;

    case 'linux': // Linux
      // Many Linux distros use ~/Documents
      return path.join(os.homedir(), 'Documents');

    default:
      // Fallback to home directory
      return os.homedir();
  }
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
    await fs.promises.mkdir(dataPath, { recursive: true });
    console.log(`[ProjectFolders] Successfully created StraboMicro2Data directory`);
  }

  return dataPath;
}

/**
 * Get the path to a specific project folder
 * @param {string} projectId - UUID of the project
 * @returns {string} Path to project folder
 */
function getProjectFolderPath(projectId) {
  return path.join(getStraboMicro2DataPath(), projectId);
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
    await fs.promises.rm(projectPath, { recursive: true, force: true });
    console.log(`[ProjectFolders] Successfully deleted project folder: ${projectId}`);
  } catch (error) {
    console.error(`[ProjectFolders] Error deleting project folder:`, error);
    throw error;
  }
}

/**
 * List all project folders in StraboMicro2Data
 * @returns {Promise<Array<string>>} Array of project UUIDs
 */
async function listProjectFolders() {
  const dataPath = getStraboMicro2DataPath();

  try {
    // Check if StraboMicro2Data exists
    await fs.promises.access(dataPath, fs.constants.F_OK);

    // Read directory contents
    const entries = await fs.promises.readdir(dataPath, { withFileTypes: true });

    // Filter for directories only
    const projectIds = entries
      .filter(entry => entry.isDirectory())
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

module.exports = {
  getDocumentsPath,
  getStraboMicro2DataPath,
  ensureStraboMicro2DataDir,
  getProjectFolderPath,
  createProjectFolders,
  projectFolderExists,
  getProjectFolderPaths,
  deleteProjectFolder,
  listProjectFolders
};
