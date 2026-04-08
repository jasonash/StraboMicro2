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
const sharp = require('sharp');
const projectFolders = require('./projectFolders');
const projectSerializer = require('./projectSerializer');
const versionHistory = require('./versionHistory');
const affineTileGenerator = require('./affineTileGenerator');
const tileCache = require('./tileCache');

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
 * Convert any non-JPEG images in the images folder to JPEG format.
 * Legacy projects may have TIFF or other format images that need conversion.
 * Uses Sharp to detect actual format (files have no extensions).
 *
 * @param {Object} folderPaths - Project folder paths
 * @param {Function} sendProgress - Progress callback
 * @returns {Promise<{converted: number, skipped: number, failed: number}>}
 */
async function convertNonJpegImages(folderPaths, sendProgress) {
  const stats = { converted: 0, skipped: 0, failed: 0 };

  try {
    // Get list of files in images folder
    let imageFiles = [];
    try {
      imageFiles = await fs.promises.readdir(folderPaths.images);
    } catch (err) {
      log.warn('[SmzImport] Could not read images folder:', err.message);
      return stats;
    }

    // Filter out hidden files and .gitkeep
    imageFiles = imageFiles.filter(f => !f.startsWith('.') && f !== '.gitkeep');

    if (imageFiles.length === 0) {
      log.info('[SmzImport] No images to check for conversion');
      return stats;
    }

    log.info(`[SmzImport] Checking ${imageFiles.length} images for format conversion...`);

    for (let i = 0; i < imageFiles.length; i++) {
      const filename = imageFiles[i];
      const imagePath = path.join(folderPaths.images, filename);

      try {
        // Use Sharp to detect the actual format
        const metadata = await sharp(imagePath, { limitInputPixels: false }).metadata();
        const format = metadata.format;

        if (format === 'jpeg') {
          // Already JPEG, skip
          stats.skipped++;
          continue;
        }

        // Non-JPEG format - convert it
        log.info(`[SmzImport] Converting ${filename} from ${format} to JPEG...`);

        if (sendProgress) {
          sendProgress('Converting images', 92, `Converting ${filename}...`);
        }

        // Read the image and convert to JPEG
        const jpegBuffer = await sharp(imagePath, { limitInputPixels: false })
          .jpeg({ quality: 95, mozjpeg: true })
          .toBuffer();

        // Write back to the same path (overwrite)
        await fs.promises.writeFile(imagePath, jpegBuffer);

        log.info(`[SmzImport] Successfully converted ${filename} from ${format} to JPEG`);
        stats.converted++;

      } catch (err) {
        log.error(`[SmzImport] Failed to process image ${filename}:`, err.message);
        stats.failed++;
      }
    }

    log.info(`[SmzImport] Image conversion complete: ${stats.converted} converted, ${stats.skipped} already JPEG, ${stats.failed} failed`);
    return stats;

  } catch (error) {
    log.error('[SmzImport] Error in convertNonJpegImages:', error);
    return stats;
  }
}

/**
 * Maximum image dimension (long edge) for performance.
 * Images larger than this will be downscaled during import.
 * 10K pixels provides excellent detail while keeping tile counts manageable.
 */
const MAX_IMAGE_DIMENSION = 10000;

/**
 * Downscale images that exceed the maximum dimension limit.
 * Large images (e.g., 24000x11000) result in thousands of tiles and poor performance.
 * This function limits the long edge to MAX_IMAGE_DIMENSION pixels.
 *
 * @param {Object} folderPaths - Project folder paths
 * @param {Function} sendProgress - Progress callback
 * @returns {Promise<{downscaled: number, skipped: number, failed: number}>}
 */
async function downscaleLargeImages(folderPaths, sendProgress) {
  const stats = { downscaled: 0, skipped: 0, failed: 0 };

  try {
    // Get list of files in images folder
    let imageFiles = [];
    try {
      imageFiles = await fs.promises.readdir(folderPaths.images);
    } catch (err) {
      log.warn('[SmzImport] Could not read images folder:', err.message);
      return stats;
    }

    // Filter out hidden files and .gitkeep
    imageFiles = imageFiles.filter(f => !f.startsWith('.') && f !== '.gitkeep');

    if (imageFiles.length === 0) {
      log.info('[SmzImport] No images to check for downscaling');
      return stats;
    }

    log.info(`[SmzImport] Checking ${imageFiles.length} images for size limits...`);

    for (let i = 0; i < imageFiles.length; i++) {
      const filename = imageFiles[i];
      const imagePath = path.join(folderPaths.images, filename);

      try {
        // Get image dimensions
        const metadata = await sharp(imagePath, { limitInputPixels: false }).metadata();
        const { width, height } = metadata;
        const longEdge = Math.max(width, height);

        if (longEdge <= MAX_IMAGE_DIMENSION) {
          // Image is within limits
          stats.skipped++;
          continue;
        }

        // Calculate new dimensions (maintain aspect ratio)
        const scale = MAX_IMAGE_DIMENSION / longEdge;
        const newWidth = Math.round(width * scale);
        const newHeight = Math.round(height * scale);

        log.info(`[SmzImport] Downscaling ${filename}: ${width}x${height} → ${newWidth}x${newHeight}`);

        if (sendProgress) {
          sendProgress('Optimizing images', 92, `Optimizing ${filename}...`);
        }

        // Downscale the image
        const buffer = await sharp(imagePath, { limitInputPixels: false })
          .resize(newWidth, newHeight, { fit: 'inside' })
          .jpeg({ quality: 95, mozjpeg: true })
          .toBuffer();

        // Write back to the same path
        await fs.promises.writeFile(imagePath, buffer);

        log.info(`[SmzImport] Successfully downscaled ${filename}`);
        stats.downscaled++;

      } catch (err) {
        log.error(`[SmzImport] Failed to process image ${filename}:`, err.message);
        stats.failed++;
      }
    }

    log.info(`[SmzImport] Large image check complete: ${stats.downscaled} downscaled, ${stats.skipped} within limits, ${stats.failed} failed`);
    return stats;

  } catch (error) {
    log.error('[SmzImport] Error in downscaleLargeImages:', error);
    return stats;
  }
}

/**
 * Legacy JavaFX minimum display width for images.
 * The legacy app upscaled images with width < 2000px to 2000px for display,
 * and stored offsetInParent coordinates in that upscaled coordinate space.
 * See: legacy-java-code/src/main/java/org/strabospot/util/straboMicrographImages.java (line 62)
 */
const LEGACY_MIN_WIDTH = 2000;

/**
 * Upscale small images in legacy projects to match the legacy app's display coordinate space.
 *
 * The legacy JavaFX app resized all images with width < 2000px to width=2000 for display.
 * Associated micrograph offsetInParent coordinates were stored relative to this upscaled size.
 * Without upscaling, overlays render at incorrect positions on small parent images.
 *
 * Only called for legacy projects (numeric project IDs).
 *
 * @param {Object} folderPaths - Project folder paths
 * @param {Function} sendProgress - Progress callback
 * @returns {Promise<{upscaled: number, skipped: number, failed: number}>}
 */
async function upscaleLegacySmallImages(folderPaths, sendProgress) {
  const stats = { upscaled: 0, skipped: 0, failed: 0 };

  try {
    let imageFiles = [];
    try {
      imageFiles = await fs.promises.readdir(folderPaths.images);
    } catch (err) {
      log.warn('[SmzImport] Could not read images folder:', err.message);
      return stats;
    }

    imageFiles = imageFiles.filter(f => !f.startsWith('.') && f !== '.gitkeep');

    if (imageFiles.length === 0) {
      log.info('[SmzImport] No images to check for legacy upscaling');
      return stats;
    }

    log.info(`[SmzImport] Checking ${imageFiles.length} images for legacy upscaling (minWidth=${LEGACY_MIN_WIDTH})...`);

    for (let i = 0; i < imageFiles.length; i++) {
      const filename = imageFiles[i];
      const imagePath = path.join(folderPaths.images, filename);

      try {
        const metadata = await sharp(imagePath, { limitInputPixels: false }).metadata();
        const { width, height } = metadata;

        if (width >= LEGACY_MIN_WIDTH) {
          stats.skipped++;
          continue;
        }

        // Upscale to width=2000, maintaining aspect ratio (matches legacy Scalr.resize behavior)
        const newWidth = LEGACY_MIN_WIDTH;
        const newHeight = Math.round(height * (newWidth / width));

        log.info(`[SmzImport] Upscaling legacy image ${filename}: ${width}x${height} → ${newWidth}x${newHeight}`);

        if (sendProgress) {
          sendProgress('Upscaling images', 92, `Upscaling ${filename}...`);
        }

        const buffer = await sharp(imagePath, { limitInputPixels: false })
          .resize(newWidth, newHeight)
          .jpeg({ quality: 95, mozjpeg: true })
          .toBuffer();

        await fs.promises.writeFile(imagePath, buffer);

        log.info(`[SmzImport] Successfully upscaled ${filename}`);
        stats.upscaled++;

      } catch (err) {
        log.error(`[SmzImport] Failed to upscale image ${filename}:`, err.message);
        stats.failed++;
      }
    }

    log.info(`[SmzImport] Legacy upscale complete: ${stats.upscaled} upscaled, ${stats.skipped} already >= ${LEGACY_MIN_WIDTH}px, ${stats.failed} failed`);
    return stats;

  } catch (error) {
    log.error('[SmzImport] Error in upscaleLegacySmallImages:', error);
    return stats;
  }
}

/**
 * Update micrograph dimensions in project data to match actual image file dimensions.
 * Legacy projects may have stored uiImages dimensions (downscaled) instead of actual image dimensions.
 * This causes rendering issues when the viewer uses project.json dimensions but tiles use actual dimensions.
 *
 * @param {Object} projectData - The project data object
 * @param {Object} folderPaths - Project folder paths
 * @param {Function} sendProgress - Progress callback
 * @returns {Promise<{updated: number, skipped: number, failed: number}>}
 */
async function syncMicrographDimensions(projectData, folderPaths, sendProgress) {
  const stats = { updated: 0, skipped: 0, failed: 0 };

  try {
    // Collect all micrographs from the project
    const micrographs = [];
    for (const dataset of projectData.datasets || []) {
      for (const sample of dataset.samples || []) {
        for (const micrograph of sample.micrographs || []) {
          micrographs.push(micrograph);
        }
      }
    }

    if (micrographs.length === 0) {
      log.info('[SmzImport] No micrographs to sync dimensions');
      return stats;
    }

    log.info(`[SmzImport] Syncing dimensions for ${micrographs.length} micrograph(s)...`);

    for (let i = 0; i < micrographs.length; i++) {
      const micrograph = micrographs[i];
      const imagePath = path.join(folderPaths.images, micrograph.id);

      try {
        // Check if image file exists
        if (!fs.existsSync(imagePath)) {
          log.warn(`[SmzImport] Image not found for micrograph ${micrograph.id}, skipping dimension sync`);
          stats.skipped++;
          continue;
        }

        // Get actual image dimensions using Sharp
        const metadata = await sharp(imagePath, { limitInputPixels: false }).metadata();
        const actualWidth = metadata.width;
        const actualHeight = metadata.height;

        // Check if dimensions need updating
        // Use imageWidth/imageHeight if available, otherwise width/height
        const storedWidth = micrograph.imageWidth || micrograph.width;
        const storedHeight = micrograph.imageHeight || micrograph.height;

        if (storedWidth !== actualWidth || storedHeight !== actualHeight) {
          log.info(`[SmzImport] Updating dimensions for ${micrograph.name || micrograph.id}: ${storedWidth}x${storedHeight} → ${actualWidth}x${actualHeight}`);

          // Update both imageWidth/imageHeight (preferred) and width/height (legacy)
          micrograph.imageWidth = actualWidth;
          micrograph.imageHeight = actualHeight;
          micrograph.width = actualWidth;
          micrograph.height = actualHeight;

          stats.updated++;

          if (sendProgress) {
            sendProgress('Syncing dimensions', 93, `Updated: ${micrograph.name || micrograph.id}`);
          }
        } else {
          stats.skipped++;
        }

      } catch (err) {
        log.error(`[SmzImport] Failed to sync dimensions for ${micrograph.id}:`, err.message);
        stats.failed++;
      }
    }

    log.info(`[SmzImport] Dimension sync complete: ${stats.updated} updated, ${stats.skipped} unchanged, ${stats.failed} failed`);
    return stats;

  } catch (error) {
    log.error('[SmzImport] Error in syncMicrographDimensions:', error);
    return stats;
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
      } else if (pathWithinProject.startsWith('tiles/')) {
        // Tile pyramid files — extract to a temporary tiles/ directory within the project
        // These will be restored into the tile cache after all images are extracted
        const tilesBasePath = path.join(folderPaths.projectPath, 'tiles');
        const relativeTilePath = pathWithinProject.substring('tiles/'.length);
        const tileDest = path.join(tilesBasePath, relativeTilePath);
        await fs.promises.mkdir(path.dirname(tileDest), { recursive: true });
        destPath = tileDest;
      } else if (pathWithinProject.startsWith('thumbnailImages/')) {
        // thumbnailImages folder - we don't have this in our folder structure
        // but we should preserve it if present
        const thumbnailImagesPath = path.join(folderPaths.projectPath, 'thumbnailImages');
        await fs.promises.mkdir(thumbnailImagesPath, { recursive: true });
        const filename = path.basename(pathWithinProject);
        destPath = path.join(thumbnailImagesPath, filename);
      } else if (pathWithinProject.startsWith('point-counts/')) {
        // Point count session files
        const pointCountsPath = path.join(folderPaths.projectPath, 'point-counts');
        await fs.promises.mkdir(pointCountsPath, { recursive: true });
        const filename = path.basename(pathWithinProject);
        // Only restore .json session files
        if (filename.endsWith('.json')) {
          destPath = path.join(pointCountsPath, filename);
          log.info(`[SmzImport] Restoring point count session: ${filename}`);
        } else {
          processedFiles++;
          continue;
        }
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
    sendProgress('Checking images', 91, 'Verifying image files...');
    await ensureImagesFolder(folderPaths);

    // Convert any non-JPEG images to JPEG (legacy projects may have TIFF images)
    sendProgress('Converting images', 91, 'Checking image formats...');
    const conversionStats = await convertNonJpegImages(folderPaths, sendProgress);
    if (conversionStats.converted > 0) {
      log.info(`[SmzImport] Converted ${conversionStats.converted} legacy images to JPEG format`);
    }

    // Downscale any images that exceed the maximum dimension limit (10K pixels)
    sendProgress('Optimizing images', 92, 'Checking image sizes...');
    const downscaleStats = await downscaleLargeImages(folderPaths, sendProgress);
    if (downscaleStats.downscaled > 0) {
      log.info(`[SmzImport] Downscaled ${downscaleStats.downscaled} large images for better performance`);
    }

    // Upscale small images in legacy projects to match the legacy app's coordinate space.
    // The legacy JavaFX app displayed images at min width=2000px and stored overlay positions
    // (offsetInParent) in that upscaled coordinate space. Without this, overlays render at
    // incorrect positions on small parent images.
    const isLegacyProject = /^\d+$/.test(projectId);
    if (isLegacyProject) {
      sendProgress('Upscaling images', 92, 'Adjusting legacy image sizes...');
      const upscaleStats = await upscaleLegacySmallImages(folderPaths, sendProgress);
      if (upscaleStats.upscaled > 0) {
        log.info(`[SmzImport] Upscaled ${upscaleStats.upscaled} small legacy images to ${LEGACY_MIN_WIDTH}px width`);
      }
    }

    // Load the project data
    log.info(`[SmzImport] Loading project data...`);
    sendProgress('Loading project', 93, 'Reading project data...');

    const projectData = await projectSerializer.loadProjectJson(projectId);

    // Sync micrograph dimensions with actual image files
    // Legacy projects may have stored uiImages dimensions (downscaled) instead of actual dimensions
    sendProgress('Syncing dimensions', 93, 'Verifying image dimensions...');
    const dimensionStats = await syncMicrographDimensions(projectData, folderPaths, sendProgress);
    if (dimensionStats.updated > 0) {
      log.info(`[SmzImport] Updated dimensions for ${dimensionStats.updated} micrograph(s), saving project...`);
      await projectSerializer.saveProjectJson(projectData, projectId);
    }

    // --- Restore tiles from archive into local tile cache ---
    const extractedTilesPath = path.join(folderPaths.projectPath, 'tiles');
    let tilesRestored = 0;

    if (fs.existsSync(extractedTilesPath)) {
      log.info('[SmzImport] Found tiles/ directory in archive, restoring to tile cache...');
      sendProgress('Restoring tiles', 94, 'Restoring tile cache from archive...');

      // Get list of micrograph IDs that have tiles
      let tileMicrographDirs = [];
      try {
        tileMicrographDirs = await fs.promises.readdir(extractedTilesPath);
        tileMicrographDirs = tileMicrographDirs.filter(f => !f.startsWith('.'));
      } catch (err) {
        log.warn('[SmzImport] Could not read extracted tiles directory:', err.message);
      }

      for (const micrographId of tileMicrographDirs) {
        try {
          // The image should already be extracted to images/<micrographId>
          const imagePath = path.join(folderPaths.images, micrographId);
          if (!fs.existsSync(imagePath)) {
            log.warn(`[SmzImport] Image not found for tile restoration: ${micrographId}`);
            continue;
          }

          // Compute the tile cache hash for the extracted image
          const imageHash = await tileCache.generateImageHash(imagePath);
          const cacheDir = tileCache.getCacheDir(imageHash);

          // Check if tiles already exist in cache (from a previous import)
          const cacheStatus = await tileCache.isCacheValid(imagePath);
          if (cacheStatus.exists) {
            log.info(`[SmzImport] Tile cache already exists for ${micrographId}, skipping restore`);
            tilesRestored++;
            continue;
          }

          // Create cache directory
          await fs.promises.mkdir(cacheDir, { recursive: true });

          // Source tile directory from the extracted archive
          const sourceTileDir = path.join(extractedTilesPath, micrographId);

          // Copy metadata.json and update originalPath
          const sourceMetadataPath = path.join(sourceTileDir, 'metadata.json');
          if (fs.existsSync(sourceMetadataPath)) {
            const metadataContent = await fs.promises.readFile(sourceMetadataPath, 'utf-8');
            const metadata = JSON.parse(metadataContent);
            // Update originalPath to point to the newly extracted image
            metadata.originalPath = imagePath;
            await fs.promises.writeFile(
              path.join(cacheDir, 'metadata.json'),
              JSON.stringify(metadata, null, 2)
            );
          }

          // Copy thumbnail.jpg
          const sourceThumbnail = path.join(sourceTileDir, 'thumbnail.jpg');
          if (fs.existsSync(sourceThumbnail)) {
            await fs.promises.copyFile(sourceThumbnail, path.join(cacheDir, 'thumbnail.jpg'));
          }

          // Copy medium.jpg
          const sourceMedium = path.join(sourceTileDir, 'medium.jpg');
          if (fs.existsSync(sourceMedium)) {
            await fs.promises.copyFile(sourceMedium, path.join(cacheDir, 'medium.jpg'));
          }

          // Copy all tile files
          const sourceTilesSubdir = path.join(sourceTileDir, 'tiles');
          if (fs.existsSync(sourceTilesSubdir)) {
            const destTilesSubdir = path.join(cacheDir, 'tiles');
            await fs.promises.mkdir(destTilesSubdir, { recursive: true });

            const tileFiles = await fs.promises.readdir(sourceTilesSubdir);
            for (const tileFile of tileFiles) {
              await fs.promises.copyFile(
                path.join(sourceTilesSubdir, tileFile),
                path.join(destTilesSubdir, tileFile)
              );
            }
            log.info(`[SmzImport] Restored ${tileFiles.length} tiles for ${micrographId}`);
          }

          tilesRestored++;
          const pct = 94 + Math.round((tilesRestored / tileMicrographDirs.length) * 3);
          sendProgress('Restoring tiles', pct, `Restored: ${micrographId.substring(0, 8)}...`);
        } catch (err) {
          log.error(`[SmzImport] Error restoring tiles for ${micrographId}:`, err);
        }
      }

      // Clean up the extracted tiles directory (it was temporary)
      try {
        await fs.promises.rm(extractedTilesPath, { recursive: true, force: true });
        log.info('[SmzImport] Cleaned up extracted tiles directory');
      } catch (err) {
        log.warn('[SmzImport] Failed to clean up extracted tiles directory:', err.message);
      }

      log.info(`[SmzImport] Tile restoration complete: ${tilesRestored} micrograph(s) restored`);
    }

    // Regenerate affine tiles for any affine-placed micrographs
    const affineMicrographs = [];
    for (const dataset of projectData.datasets || []) {
      for (const sample of dataset.samples || []) {
        for (const micrograph of sample.micrographs || []) {
          if (micrograph.placementType === 'affine' && micrograph.affineMatrix) {
            affineMicrographs.push(micrograph);
          }
        }
      }
    }

    if (affineMicrographs.length > 0) {
      log.info(`[SmzImport] Regenerating affine tiles for ${affineMicrographs.length} micrograph(s)...`);
      sendProgress('Regenerating affine tiles', 94, `Processing ${affineMicrographs.length} affine overlay(s)...`);

      for (let i = 0; i < affineMicrographs.length; i++) {
        const micro = affineMicrographs[i];
        try {
          // Get the original image path
          const imagePath = path.join(folderPaths.images, micro.id);

          // Check if image file exists
          if (!fs.existsSync(imagePath)) {
            log.warn(`[SmzImport] Image not found for affine micrograph ${micro.id}, skipping tile generation`);
            continue;
          }

          log.info(`[SmzImport] Generating affine tiles for: ${micro.name || micro.id}`);
          sendProgress('Regenerating affine tiles', 94 + Math.round((i / affineMicrographs.length) * 4), `Processing: ${micro.name || micro.id}`);

          // Generate affine tiles using the stored matrix
          await affineTileGenerator.generateAffineTiles(
            imagePath,
            micro.affineTileHash,
            micro.affineMatrix
          );

          log.info(`[SmzImport] Affine tiles regenerated for: ${micro.name || micro.id}`);
        } catch (err) {
          log.error(`[SmzImport] Error generating affine tiles for ${micro.id}:`, err);
          // Continue with other micrographs
        }
      }
    }

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
