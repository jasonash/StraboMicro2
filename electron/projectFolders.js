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

/**
 * Copy a file to the project's associatedFiles folder
 * @param {string} sourcePath - Full path to the source file
 * @param {string} projectId - UUID of the project
 * @param {string} fileName - Desired filename in the associatedFiles folder
 * @returns {Promise<Object>} Object with destinationPath and fileName
 */
async function copyFileToAssociatedFiles(sourcePath, projectId, fileName) {
  console.log(`[ProjectFolders] Copying file to associatedFiles for project: ${projectId}`);
  console.log(`[ProjectFolders] Source: ${sourcePath}`);
  console.log(`[ProjectFolders] Filename: ${fileName}`);

  try {
    // Get project folder paths
    const paths = getProjectFolderPaths(projectId);

    // Ensure associatedFiles folder exists
    await fs.promises.mkdir(paths.associatedFiles, { recursive: true });

    // Build destination path
    const destinationPath = path.join(paths.associatedFiles, fileName);

    // Check if file already exists in associatedFiles folder
    try {
      await fs.promises.access(destinationPath, fs.constants.F_OK);
      // File exists - throw error to prevent overwriting
      const error = new Error(`A file with the name "${fileName}" already exists in the associatedFiles folder. Please rename the file before adding it.`);
      error.code = 'FILE_EXISTS';
      console.error(`[ProjectFolders] File already exists: ${destinationPath}`);
      throw error;
    } catch (error) {
      // If error is not ENOENT (file not found), rethrow it
      if (error.code !== 'ENOENT' && error.code !== undefined) {
        throw error;
      }
      // File doesn't exist - proceed with copy
    }

    // Check if source file exists
    await fs.promises.access(sourcePath, fs.constants.R_OK);

    // Copy the file
    await fs.promises.copyFile(sourcePath, destinationPath);

    console.log(`[ProjectFolders] Successfully copied file to: ${destinationPath}`);

    return {
      destinationPath,
      fileName,
      success: true
    };
  } catch (error) {
    console.error(`[ProjectFolders] Error copying file:`, error);
    throw error;
  }
}

/**
 * Delete a file from the project's associatedFiles folder
 * @param {string} projectId - UUID of the project
 * @param {string} fileName - Filename to delete from associatedFiles folder
 * @returns {Promise<Object>} Object with success status
 */
async function deleteFromAssociatedFiles(projectId, fileName) {
  console.log(`[ProjectFolders] Deleting file from associatedFiles for project: ${projectId}`);
  console.log(`[ProjectFolders] Filename: ${fileName}`);

  try {
    // Get project folder paths
    const paths = getProjectFolderPaths(projectId);

    // Build file path
    const filePath = path.join(paths.associatedFiles, fileName);

    // Check if file exists
    try {
      await fs.promises.access(filePath, fs.constants.F_OK);
    } catch (error) {
      // File doesn't exist, consider it already deleted
      console.log(`[ProjectFolders] File does not exist (already deleted?): ${filePath}`);
      return {
        success: true,
        fileName,
        message: 'File does not exist'
      };
    }

    // Delete the file
    await fs.promises.unlink(filePath);

    console.log(`[ProjectFolders] Successfully deleted file: ${filePath}`);

    return {
      success: true,
      fileName
    };
  } catch (error) {
    console.error(`[ProjectFolders] Error deleting file:`, error);
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
  listProjectFolders,
  copyFileToAssociatedFiles,
  deleteFromAssociatedFiles
};
