/**
 * SMZ Import Service
 *
 * Handles importing .smz archives (ZIP files with .smz extension) into the application.
 * Extracts project data and images, replacing any existing local project with the same ID.
 *
 * IMPORTANT: Importing a project is a DESTRUCTIVE operation:
 * - If a project with the same ID exists locally, it will be COMPLETELY REPLACED
 * - All local version history for that project ID will be CLEARED
 * - Users should export their local copy or push to server before importing
 */

const fs = require('fs');
const path = require('path');
const log = require('electron-log');
const unzipper = require('unzipper');
const projectFolders = require('./projectFolders');
const projectSerializer = require('./projectSerializer');
const versionHistory = require('./versionHistory');

/**
 * Ensure the images folder has files.
 * Legacy .smz files may not have an images/ folder, only uiImages/.
 * In that case, copy all files from uiImages/ to images/.
 *
 * @param {Object} folderPaths - Project folder paths
 */
async function ensureImagesFolder(folderPaths) {
  try {
    // Check if images folder exists and has files
    let imagesFiles = [];
    try {
      imagesFiles = await fs.promises.readdir(folderPaths.images);
    } catch (err) {
      // Folder doesn't exist or can't be read
      imagesFiles = [];
    }

    // Filter out hidden files and .gitkeep
    imagesFiles = imagesFiles.filter(f => !f.startsWith('.') && f !== '.gitkeep');

    if (imagesFiles.length > 0) {
      log.info(`[SmzImport] Images folder has ${imagesFiles.length} files, no fallback needed`);
      return;
    }

    // Images folder is empty - check uiImages
    log.info('[SmzImport] Images folder is empty, checking uiImages for fallback...');

    let uiImagesFiles = [];
    try {
      uiImagesFiles = await fs.promises.readdir(folderPaths.uiImages);
    } catch (err) {
      log.warn('[SmzImport] uiImages folder not found or empty');
      return;
    }

    // Filter out hidden files and .gitkeep
    uiImagesFiles = uiImagesFiles.filter(f => !f.startsWith('.') && f !== '.gitkeep');

    if (uiImagesFiles.length === 0) {
      log.warn('[SmzImport] Both images and uiImages folders are empty');
      return;
    }

    // Copy files from uiImages to images
    log.info(`[SmzImport] Copying ${uiImagesFiles.length} files from uiImages to images (legacy fallback)`);

    for (const filename of uiImagesFiles) {
      const sourcePath = path.join(folderPaths.uiImages, filename);
      const destPath = path.join(folderPaths.images, filename);

      try {
        await fs.promises.copyFile(sourcePath, destPath);
        log.debug(`[SmzImport] Copied ${filename} to images folder`);
      } catch (err) {
        log.error(`[SmzImport] Failed to copy ${filename}:`, err);
      }
    }

    log.info('[SmzImport] Legacy image fallback complete');
  } catch (error) {
    log.error('[SmzImport] Error in ensureImagesFolder:', error);
    // Don't throw - this is a best-effort fallback
  }
}

/**
 * Extract and inspect an .smz file to get project info without importing
 * Used to check if project exists and show user confirmation dialog
 *
 * @param {string} smzPath - Path to the .smz file
 * @returns {Promise<{success: boolean, projectId?: string, projectName?: string, projectExists?: boolean, error?: string}>}
 */
async function inspectSmz(smzPath) {
  try {
    log.info(`[SmzImport] Inspecting .smz file: ${smzPath}`);

    // Verify file exists
    await fs.promises.access(smzPath, fs.constants.R_OK);

    // Open the ZIP file
    const directory = await unzipper.Open.file(smzPath);

    // Find the root folder (should be the project ID)
    // Structure: <project-uuid>/project.json, <project-uuid>/images/, etc.
    const rootFolders = new Set();
    for (const file of directory.files) {
      const parts = file.path.split('/');
      if (parts.length > 0 && parts[0]) {
        rootFolders.add(parts[0]);
      }
    }

    if (rootFolders.size === 0) {
      return { success: false, error: 'Invalid .smz file: no root folder found' };
    }

    if (rootFolders.size > 1) {
      log.warn('[SmzImport] Multiple root folders found, using first one');
    }

    const projectId = Array.from(rootFolders)[0];
    log.info(`[SmzImport] Found project ID: ${projectId}`);

    // Find and read project.json
    const projectJsonPath = `${projectId}/project.json`;
    const projectJsonFile = directory.files.find(f => f.path === projectJsonPath);

    if (!projectJsonFile) {
      return { success: false, error: 'Invalid .smz file: project.json not found' };
    }

    // Read project.json content
    const projectJsonBuffer = await projectJsonFile.buffer();
    const projectJson = JSON.parse(projectJsonBuffer.toString('utf-8'));

    const projectName = projectJson.name || 'Untitled Project';

    // Check if project already exists locally
    const projectExists = await projectFolders.projectFolderExists(projectId);

    log.info(`[SmzImport] Project "${projectName}" (${projectId}), exists locally: ${projectExists}`);

    return {
      success: true,
      projectId,
      projectName,
      projectExists,
    };
  } catch (error) {
    log.error('[SmzImport] Error inspecting .smz file:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Import an .smz file into the application
 * This is a DESTRUCTIVE operation - it replaces any existing project with the same ID
 *
 * @param {string} smzPath - Path to the .smz file
 * @param {Function} progressCallback - Callback for progress updates
 * @returns {Promise<{success: boolean, projectId?: string, projectData?: Object, error?: string}>}
 */
async function importSmz(smzPath, progressCallback) {
  try {
    log.info(`[SmzImport] Starting import of: ${smzPath}`);

    const sendProgress = (phase, percentage, detail) => {
      if (progressCallback) {
        progressCallback({ phase, percentage, detail });
      }
    };

    sendProgress('Inspecting archive', 0, 'Reading .smz file...');

    // First inspect to get project info
    const inspectResult = await inspectSmz(smzPath);
    if (!inspectResult.success) {
      return inspectResult;
    }

    const { projectId, projectName, projectExists } = inspectResult;

    sendProgress('Preparing', 5, 'Preparing to import...');

    // If project exists, delete it first (after user has confirmed)
    if (projectExists) {
      log.info(`[SmzImport] Deleting existing project folder: ${projectId}`);
      sendProgress('Removing existing project', 10, 'Clearing local data...');
      await projectFolders.deleteProjectFolder(projectId);
    }

    // Clear version history for this project ID (whether it existed or not)
    log.info(`[SmzImport] Clearing version history for project: ${projectId}`);
    sendProgress('Clearing version history', 15, 'Removing old versions...');
    await versionHistory.clearHistory(projectId);

    // Create fresh project folder structure
    log.info(`[SmzImport] Creating project folders for: ${projectId}`);
    sendProgress('Creating folders', 20, 'Setting up project structure...');
    await projectFolders.createProjectFolders(projectId);

    const folderPaths = projectFolders.getProjectFolderPaths(projectId);

    // Open the ZIP file for extraction
    const directory = await unzipper.Open.file(smzPath);

    // Get list of files to extract
    const files = directory.files.filter(f => !f.path.endsWith('/'));
    const totalFiles = files.length;
    let processedFiles = 0;

    log.info(`[SmzImport] Extracting ${totalFiles} files...`);

    // Process each file
    for (const file of files) {
      const relativePath = file.path;

      // Skip if path doesn't start with project ID
      if (!relativePath.startsWith(projectId + '/')) {
        log.warn(`[SmzImport] Skipping unexpected file: ${relativePath}`);
        continue;
      }

      // Get the path relative to project folder
      const pathWithinProject = relativePath.substring(projectId.length + 1);

      // Determine destination based on file type
      let destPath;
      if (pathWithinProject === 'project.json') {
        destPath = folderPaths.projectJson;
      } else if (pathWithinProject.startsWith('images/')) {
        const filename = path.basename(pathWithinProject);
        destPath = path.join(folderPaths.images, filename);
      } else if (pathWithinProject.startsWith('associatedFiles/')) {
        const filename = path.basename(pathWithinProject);
        // Skip .gitkeep files
        if (filename === '.gitkeep') {
          processedFiles++;
          continue;
        }
        destPath = path.join(folderPaths.associatedFiles, filename);
      } else if (pathWithinProject.startsWith('uiImages/')) {
        const filename = path.basename(pathWithinProject);
        destPath = path.join(folderPaths.uiImages, filename);
      } else if (pathWithinProject.startsWith('compositeImages/')) {
        const filename = path.basename(pathWithinProject);
        destPath = path.join(folderPaths.compositeImages, filename);
      } else if (pathWithinProject.startsWith('compositeThumbnails/')) {
        const filename = path.basename(pathWithinProject);
        destPath = path.join(folderPaths.compositeThumbnails, filename);
      } else if (pathWithinProject.startsWith('webImages/')) {
        const filename = path.basename(pathWithinProject);
        destPath = path.join(folderPaths.webImages, filename);
      } else if (pathWithinProject.startsWith('webThumbnails/')) {
        const filename = path.basename(pathWithinProject);
        destPath = path.join(folderPaths.webThumbnails, filename);
      } else if (pathWithinProject.startsWith('thumbnailImages/')) {
        // thumbnailImages folder - we don't have this in our folder structure
        // but we should preserve it if present
        const thumbnailImagesPath = path.join(folderPaths.projectPath, 'thumbnailImages');
        await fs.promises.mkdir(thumbnailImagesPath, { recursive: true });
        const filename = path.basename(pathWithinProject);
        destPath = path.join(thumbnailImagesPath, filename);
      } else if (pathWithinProject === 'project.pdf' || pathWithinProject === 'README.txt') {
        // Skip PDF and README - they're generated artifacts
        processedFiles++;
        continue;
      } else {
        // Unknown file - skip it
        log.debug(`[SmzImport] Skipping unknown file: ${pathWithinProject}`);
        processedFiles++;
        continue;
      }

      // Extract file
      try {
        const buffer = await file.buffer();
        await fs.promises.writeFile(destPath, buffer);
      } catch (err) {
        log.error(`[SmzImport] Error extracting file ${relativePath}:`, err);
        // Continue with other files
      }

      processedFiles++;
      const percentage = 20 + Math.round((processedFiles / totalFiles) * 70);
      sendProgress('Extracting files', percentage, path.basename(pathWithinProject));
    }

    // Check if images folder is empty (legacy .smz files may not have it)
    // If so, copy files from uiImages to images
    sendProgress('Checking images', 92, 'Verifying image files...');
    await ensureImagesFolder(folderPaths);

    // Load the project data
    log.info(`[SmzImport] Loading project data...`);
    sendProgress('Loading project', 95, 'Reading project data...');

    const projectData = await projectSerializer.loadProjectJson(projectId);

    log.info(`[SmzImport] Import complete: ${projectName} (${projectId})`);
    sendProgress('Complete', 100, 'Import complete!');

    return {
      success: true,
      projectId,
      projectData,
    };
  } catch (error) {
    log.error('[SmzImport] Import failed:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  inspectSmz,
  importSmz,
};
