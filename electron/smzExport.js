/**
 * SMZ Export Service
 *
 * Handles exporting projects as .smz archives (ZIP files with .smz extension).
 * Packages project data, images, composite thumbnails, and tile pyramids.
 *
 * Folder structure inside .smz:
 * <project-uuid>/
 * ├── project.json                    # Full project data (legacy schema compliant)
 * ├── project.pdf                     # PDF report of entire project
 * ├── README.txt                      # Archive description
 * ├── associatedFiles/                # External files (copied from project)
 * ├── point-counts/                   # Point count session JSON files
 * ├── images/                         # Full-size JPEGs (no extension), named by micrograph ID
 * ├── compositeThumbnails/            # 250px long edge, with overlays (sidebar thumbnails)
 * └── tiles/<micrographId>/           # Tile pyramid per micrograph
 *     ├── metadata.json               # Dimensions, tile count, tile size
 *     ├── thumbnail.jpg               # 512x512 plain preview
 *     ├── medium.jpg                  # 2048x2048 plain preview
 *     └── tiles/
 *         ├── tile_0_0.webp           # 256x256 WebP tiles
 *         └── ...
 */

const fs = require('fs');
const path = require('path');
const log = require('electron-log');
const sharp = require('sharp');
const archiver = require('archiver');
const tileCache = require('./tileCache');
const tileGenerator = require('./tileGenerator');

/**
 * Resolve image path with fallback to uiImages for legacy projects.
 *
 * Legacy projects (created with older versions of the JavaFX app) stored
 * original images in uiImages/ instead of images/. This function checks
 * if the image exists at the given path, and if not, tries the uiImages/
 * folder as a fallback.
 *
 * @param {string} imagePath - Full path to image in images/ folder
 * @returns {Promise<string>} - Resolved path (original or uiImages fallback)
 */
async function resolveImagePathWithLegacyFallback(imagePath) {
  // Check if file exists at the given path
  try {
    await fs.promises.access(imagePath, fs.constants.F_OK);
    return imagePath; // File exists, use original path
  } catch {
    // File doesn't exist, try uiImages fallback
  }

  // Check if this is an images/ path that we can convert to uiImages/
  if (imagePath.includes('/images/') || imagePath.includes('\\images\\')) {
    const uiImagesPath = imagePath
      .replace('/images/', '/uiImages/')
      .replace('\\images\\', '\\uiImages\\');

    try {
      await fs.promises.access(uiImagesPath, fs.constants.F_OK);
      log.info(`[Legacy Fallback] Image not found in images/, using uiImages/: ${uiImagesPath}`);
      return uiImagesPath; // Fallback exists, use it
    } catch {
      // Fallback doesn't exist either, return original path
    }
  }

  return imagePath; // Return original path (may not exist)
}

/**
 * Image size configuration retained for compositeThumbnails generation fallback
 */
const COMPOSITE_THUMBNAIL_SIZE = 250;

/**
 * Collect all micrograph IDs from project (for filtering during ZIP creation)
 * @param {Object} projectData - Project data
 * @returns {Set<string>} Set of micrograph IDs
 */
function collectMicrographIds(projectData) {
  const ids = new Set();
  for (const dataset of projectData.datasets || []) {
    for (const sample of dataset.samples || []) {
      for (const micrograph of sample.micrographs || []) {
        ids.add(micrograph.id);
      }
    }
  }
  return ids;
}

/**
 * Collect all micrographs from project (flattened list)
 * @param {Object} projectData - Project data
 * @returns {Array} Array of micrograph objects with metadata
 */
function collectAllMicrographs(projectData) {
  const micrographs = [];
  for (const dataset of projectData.datasets || []) {
    for (const sample of dataset.samples || []) {
      for (const micrograph of sample.micrographs || []) {
        micrographs.push({
          micrograph,
          datasetName: dataset.name || 'Unknown Dataset',
          sampleName: sample.name || sample.label || 'Unknown Sample',
        });
      }
    }
  }
  return micrographs;
}

/**
 * Generate README.txt content for the archive
 * @param {Object} projectData - Project data
 * @param {Array} allMicrographs - Flattened list of micrographs
 * @returns {string} README content
 */
function generateReadme(projectData, allMicrographs) {
  const now = new Date();
  const exportDate = now.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');

  // Count statistics
  const datasetCount = (projectData.datasets || []).length;
  let sampleCount = 0;
  let spotCount = 0;

  for (const dataset of projectData.datasets || []) {
    sampleCount += (dataset.samples || []).length;
    for (const sample of dataset.samples || []) {
      for (const micrograph of sample.micrographs || []) {
        spotCount += (micrograph.spots || []).length;
      }
    }
  }

  // Count reference vs associated micrographs
  const referenceMicrographs = allMicrographs.filter(m => !m.micrograph.parentID);
  const associatedMicrographs = allMicrographs.filter(m => m.micrograph.parentID);

  // Build sample list
  const sampleList = [];
  for (const dataset of projectData.datasets || []) {
    for (const sample of dataset.samples || []) {
      const microCount = (sample.micrographs || []).length;
      sampleList.push(`    • ${sample.label || sample.name || 'Unnamed'} (${microCount} micrograph${microCount !== 1 ? 's' : ''})`);
    }
  }

  const lines = [
    '═══════════════════════════════════════════════════════════════════════════════',
    '                         STRABOMICRO PROJECT ARCHIVE',
    '═══════════════════════════════════════════════════════════════════════════════',
    '',
    `  Project Name:     ${projectData.name || 'Untitled Project'}`,
    `  Project ID:       ${projectData.id}`,
    `  Export Date:      ${exportDate}`,
    '',
    '───────────────────────────────────────────────────────────────────────────────',
    '                              PROJECT SUMMARY',
    '───────────────────────────────────────────────────────────────────────────────',
    '',
  ];

  if (projectData.purposeOfStudy) {
    lines.push(`  Purpose:          ${projectData.purposeOfStudy}`);
  }
  if (projectData.areaOfInterest) {
    lines.push(`  Area of Interest: ${projectData.areaOfInterest}`);
  }
  if (projectData.startDate || projectData.endDate) {
    lines.push(`  Date Range:       ${projectData.startDate || '?'} to ${projectData.endDate || '?'}`);
  }
  if (projectData.otherTeamMembers) {
    lines.push(`  Team Members:     ${projectData.otherTeamMembers}`);
  }
  if (projectData.notes) {
    lines.push(`  Notes:            ${projectData.notes}`);
  }

  lines.push(
    '',
    '───────────────────────────────────────────────────────────────────────────────',
    '                               STATISTICS',
    '───────────────────────────────────────────────────────────────────────────────',
    '',
    `  Datasets:              ${datasetCount}`,
    `  Samples:               ${sampleCount}`,
    `  Total Micrographs:     ${allMicrographs.length}`,
    `    ├─ Reference:        ${referenceMicrographs.length}`,
    `    └─ Associated:       ${associatedMicrographs.length}`,
    `  Spots/Annotations:     ${spotCount}`,
    '',
  );

  if (sampleList.length > 0) {
    lines.push(
      '───────────────────────────────────────────────────────────────────────────────',
      '                                SAMPLES',
      '───────────────────────────────────────────────────────────────────────────────',
      '',
      ...sampleList,
      '',
    );
  }

  lines.push(
    '───────────────────────────────────────────────────────────────────────────────',
    '                            ARCHIVE CONTENTS',
    '───────────────────────────────────────────────────────────────────────────────',
    '',
    '  This .smz archive contains:',
    '',
    '  📄 project.json',
    '     Complete project data in JSON format. This is the primary data file',
    '     containing all metadata, sample information, micrograph properties,',
    '     and spot annotations.',
    '',
    '  📄 project.pdf',
    '     A comprehensive PDF report of the entire project including images,',
    '     metadata, and all annotations. Useful for printing or sharing.',
    '',
    '  📁 images/',
    '     Full-resolution micrograph images in JPEG format.',
    '     Files are named by micrograph UUID (no file extension).',
    '',
    '  📁 compositeThumbnails/',
    '     Small composite thumbnails (250px) for quick preview in sidebars.',
    '     Includes child micrograph overlays.',
    '',
    '  📁 tiles/<micrographId>/',
    '     Tile pyramid for each micrograph, used by the web viewer and',
    '     desktop app for efficient image display:',
    '       metadata.json  - Image dimensions and tile grid info',
    '       thumbnail.jpg  - 512x512 quick preview',
    '       medium.jpg     - 2048x2048 medium resolution preview',
    '       tiles/         - 256x256 WebP tiles for full-resolution viewing',
    '',
    '  📁 associatedFiles/',
    '     Any external files attached to the project (PDFs, documents, etc.).',
    '',
    '  📁 point-counts/',
    '     Point count session data (JSON files). Each file represents a',
    '     point counting session with grid configuration and classifications.',
    '',
    '───────────────────────────────────────────────────────────────────────────────',
    '                                 NOTES',
    '───────────────────────────────────────────────────────────────────────────────',
    '',
    '  • Image files in this archive do not have file extensions but are',
    '    standard JPEG format. Rename with .jpg extension if needed.',
    '',
    '  • This archive is compatible with StraboMicro (legacy) and StraboMicro2.',
    '',
    '  • The project.json file follows the legacy StraboMicro schema for',
    '    maximum compatibility.',
    '',
    '  • For questions or support, visit: https://strabospot.org',
    '',
    '═══════════════════════════════════════════════════════════════════════════════',
    `                    Generated by StraboMicro2 on ${now.toDateString()}`,
    '═══════════════════════════════════════════════════════════════════════════════',
    '',
  );

  return lines.join('\n');
}

/**
 * Generate composite image buffer WITHOUT spots or labels
 * Only includes base image + child overlay micrographs
 *
 * @param {string} projectId - Project UUID
 * @param {Object} micrograph - Micrograph data
 * @param {Object} projectData - Full project data
 * @param {Object} folderPaths - Project folder paths
 * @returns {Promise<Buffer>} JPEG buffer
 */
async function generateCompositeBufferNoSpots(projectId, micrograph, projectData, folderPaths) {
  // Find child micrographs for this micrograph
  let childMicrographs = [];
  for (const dataset of projectData.datasets || []) {
    for (const sample of dataset.samples || []) {
      const children = (sample.micrographs || []).filter(
        m => m.parentID === micrograph.id
      );
      childMicrographs.push(...children);
    }
  }

  // Load base micrograph image (with fallback to uiImages for legacy projects)
  const basePath = await resolveImagePathWithLegacyFallback(
    path.join(folderPaths.images, micrograph.id)
  );
  let baseImage = sharp(basePath);
  const baseMetadata = await baseImage.metadata();
  const baseWidth = baseMetadata.width;
  const baseHeight = baseMetadata.height;

  // Build composite layers for child micrographs
  const compositeInputs = [];

  for (const child of childMicrographs) {
    try {
      // Skip point-located micrographs (they don't have image overlays)
      if (child.pointInParent) {
        continue;
      }

      // Skip hidden micrographs
      if (child.isMicroVisible === false) {
        continue;
      }

      // Handle affine-placed overlays specially
      if (child.placementType === 'affine') {
        try {
          const affineTileHash = child.affineTileHash;
          if (!affineTileHash) {
            log.warn(`[SmzExport] Affine overlay ${child.id} missing affineTileHash`);
            continue;
          }

          // Load pre-transformed image from affine tile cache
          const mediumBuffer = await tileCache.loadAffineMedium(affineTileHash);
          if (!mediumBuffer) {
            log.warn(`[SmzExport] Affine medium image not found for ${child.id}`);
            continue;
          }

          // Get bounds offset for positioning from micrograph data
          const boundsOffset = child.affineBoundsOffset || { x: 0, y: 0 };
          const transformedWidth = child.affineTransformedWidth || 0;
          const transformedHeight = child.affineTransformedHeight || 0;

          log.info(`[SmzExport] Affine overlay ${child.id}: bounds=(${boundsOffset.x}, ${boundsOffset.y}), size=${transformedWidth}x${transformedHeight}`);

          // Always resize medium image to full transformed dimensions
          let childImage = sharp(mediumBuffer);
          if (transformedWidth > 0 && transformedHeight > 0) {
            childImage = childImage.resize(transformedWidth, transformedHeight, {
              fit: 'fill',
              kernel: sharp.kernel.lanczos3
            });
          }

          // Apply opacity
          const childOpacity = child.opacity ?? 1.0;
          childImage = childImage.ensureAlpha();

          if (childOpacity < 1.0) {
            const { data, info } = await childImage.raw().toBuffer({ resolveWithObject: true });
            for (let i = 3; i < data.length; i += 4) {
              data[i] = Math.round(data[i] * childOpacity);
            }
            childImage = sharp(data, {
              raw: { width: info.width, height: info.height, channels: info.channels }
            });
          }

          const finalBuffer = await childImage.png().toBuffer();
          let finalX = Math.round(boundsOffset.x);
          let finalY = Math.round(boundsOffset.y);

          // Bounds checking and cropping (same as regular overlays)
          const childBufferMeta = await sharp(finalBuffer).metadata();
          const childW = childBufferMeta.width;
          const childH = childBufferMeta.height;

          if (finalX + childW <= 0 || finalY + childH <= 0 || finalX >= baseWidth || finalY >= baseHeight) {
            continue;
          }

          let cropX = 0, cropY = 0, cropW = childW, cropH = childH;
          let compositeX = finalX, compositeY = finalY;

          if (finalX < 0) { cropX = -finalX; cropW -= cropX; compositeX = 0; }
          if (finalY < 0) { cropY = -finalY; cropH -= cropY; compositeY = 0; }
          if (compositeX + cropW > baseWidth) { cropW = baseWidth - compositeX; }
          if (compositeY + cropH > baseHeight) { cropH = baseHeight - compositeY; }

          if (cropW <= 0 || cropH <= 0) continue;

          cropX = Math.round(cropX);
          cropY = Math.round(cropY);
          cropW = Math.round(cropW);
          cropH = Math.round(cropH);
          compositeX = Math.round(compositeX);
          compositeY = Math.round(compositeY);

          let compositeBuffer = finalBuffer;
          if (cropX > 0 || cropY > 0 || cropW !== childW || cropH !== childH) {
            compositeBuffer = await sharp(finalBuffer)
              .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
              .toBuffer();
          }

          compositeInputs.push({
            input: compositeBuffer,
            left: compositeX,
            top: compositeY
          });

          log.info(`[SmzExport] Added affine overlay ${child.id} at (${compositeX}, ${compositeY})`);
        } catch (err) {
          log.error(`[SmzExport] Error processing affine overlay ${child.id}:`, err);
        }
        continue;
      }

      // Skip children that haven't been located yet (no position data)
      // This prevents loading ALL child images when only some have position data
      if (!child.offsetInParent && child.xOffset === undefined) {
        log.info(`[SmzExport] Skipping unlocated child ${child.id} - no position data yet`);
        continue;
      }

      // Load child image (with fallback to uiImages for legacy projects)
      const childPath = await resolveImagePathWithLegacyFallback(
        path.join(folderPaths.images, child.id)
      );

      // Check if child image exists
      if (!fs.existsSync(childPath)) {
        log.warn(`[SmzExport] Child image not found: ${childPath}`);
        continue;
      }

      let childImage = sharp(childPath);
      const childMetadata = await childImage.metadata();

      // Use stored dimensions or fall back to metadata
      const childImageWidth = child.imageWidth || child.width || childMetadata.width;
      const childImageHeight = child.imageHeight || child.height || childMetadata.height;

      // Calculate display scale based on pixels per centimeter
      const childPxPerCm = child.scalePixelsPerCentimeter || 100;
      const parentPxPerCm = micrograph.scalePixelsPerCentimeter || 100;
      const displayScale = parentPxPerCm / childPxPerCm;

      // Calculate child dimensions in parent's coordinate space
      const childDisplayWidth = Math.round(childImageWidth * displayScale);
      const childDisplayHeight = Math.round(childImageHeight * displayScale);

      // Get child position (ensure integers for Sharp)
      let topLeftX = 0, topLeftY = 0;
      if (child.offsetInParent) {
        topLeftX = Math.round(child.offsetInParent.X);
        topLeftY = Math.round(child.offsetInParent.Y);
      } else if (child.xOffset !== undefined && child.yOffset !== undefined) {
        topLeftX = Math.round(child.xOffset);
        topLeftY = Math.round(child.yOffset);
      }

      // Resize child image to display dimensions
      childImage = childImage.resize(childDisplayWidth, childDisplayHeight, {
        fit: 'fill',
        kernel: sharp.kernel.lanczos3
      });

      // Apply opacity
      const childOpacity = child.opacity ?? 1.0;
      childImage = childImage.ensureAlpha();

      if (childOpacity < 1.0) {
        const { data, info } = await childImage.raw().toBuffer({ resolveWithObject: true });
        for (let i = 3; i < data.length; i += 4) {
          data[i] = Math.round(data[i] * childOpacity);
        }
        childImage = sharp(data, {
          raw: { width: info.width, height: info.height, channels: info.channels }
        });
      }

      // Apply rotation if needed
      let finalX = topLeftX, finalY = topLeftY, finalBuffer;
      if (child.rotation) {
        const centerX = topLeftX + childDisplayWidth / 2;
        const centerY = topLeftY + childDisplayHeight / 2;

        childImage = childImage.rotate(child.rotation, {
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        });

        const radians = (child.rotation * Math.PI) / 180;
        const cos = Math.abs(Math.cos(radians));
        const sin = Math.abs(Math.sin(radians));
        const rotatedWidth = childDisplayWidth * cos + childDisplayHeight * sin;
        const rotatedHeight = childDisplayWidth * sin + childDisplayHeight * cos;

        finalX = Math.round(centerX - rotatedWidth / 2);
        finalY = Math.round(centerY - rotatedHeight / 2);
        finalBuffer = await childImage.png().toBuffer();
      } else {
        finalBuffer = await childImage.png().toBuffer();
      }

      // Bounds checking and cropping
      const childBufferMeta = await sharp(finalBuffer).metadata();
      const childW = childBufferMeta.width;
      const childH = childBufferMeta.height;

      if (finalX + childW <= 0 || finalY + childH <= 0 || finalX >= baseWidth || finalY >= baseHeight) {
        continue;
      }

      let cropX = 0, cropY = 0, cropW = childW, cropH = childH;
      let compositeX = finalX, compositeY = finalY;

      if (finalX < 0) { cropX = -finalX; cropW -= cropX; compositeX = 0; }
      if (finalY < 0) { cropY = -finalY; cropH -= cropY; compositeY = 0; }
      if (compositeX + cropW > baseWidth) { cropW = baseWidth - compositeX; }
      if (compositeY + cropH > baseHeight) { cropH = baseHeight - compositeY; }

      if (cropW <= 0 || cropH <= 0) continue;

      // Ensure all values are integers for Sharp
      cropX = Math.round(cropX);
      cropY = Math.round(cropY);
      cropW = Math.round(cropW);
      cropH = Math.round(cropH);
      compositeX = Math.round(compositeX);
      compositeY = Math.round(compositeY);

      let compositeBuffer = finalBuffer;
      if (cropX > 0 || cropY > 0 || cropW !== childW || cropH !== childH) {
        compositeBuffer = await sharp(finalBuffer)
          .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
          .toBuffer();
      }

      compositeInputs.push({ input: compositeBuffer, left: compositeX, top: compositeY });
    } catch (error) {
      log.error(`[SmzExport] Failed to composite child ${child.id}:`, error);
    }
  }

  // Apply all composites (no spots/labels)
  let finalImage;
  if (compositeInputs.length > 0) {
    finalImage = baseImage.composite(compositeInputs);
  } else {
    finalImage = baseImage;
  }

  // Return JPEG buffer
  return await finalImage.jpeg({ quality: 95 }).toBuffer();
}

/**
 * Resize an image buffer to fit within a maximum long edge
 * Enlarges if necessary (per legacy app requirements)
 *
 * @param {Buffer} inputBuffer - Input image buffer
 * @param {number} maxLongEdge - Maximum size for the longest edge
 * @returns {Promise<Buffer>} Resized JPEG buffer
 */
async function resizeToMaxLongEdge(inputBuffer, maxLongEdge) {
  const metadata = await sharp(inputBuffer).metadata();
  const { width, height } = metadata;

  const longestEdge = Math.max(width, height);
  const scale = maxLongEdge / longestEdge;

  const newWidth = Math.round(width * scale);
  const newHeight = Math.round(height * scale);

  return await sharp(inputBuffer)
    .resize(newWidth, newHeight, {
      fit: 'fill',
      kernel: sharp.kernel.lanczos3
    })
    .jpeg({ quality: 90 })
    .toBuffer();
}

/**
 * Generate a plain (non-composite) resized image
 *
 * @param {string} imagePath - Path to source image
 * @param {number} maxLongEdge - Maximum size for the longest edge
 * @returns {Promise<Buffer>} Resized JPEG buffer
 */
async function generatePlainResized(imagePath, maxLongEdge) {
  const metadata = await sharp(imagePath).metadata();
  const { width, height } = metadata;

  const longestEdge = Math.max(width, height);
  const scale = maxLongEdge / longestEdge;

  const newWidth = Math.round(width * scale);
  const newHeight = Math.round(height * scale);

  return await sharp(imagePath)
    .resize(newWidth, newHeight, {
      fit: 'fill',
      kernel: sharp.kernel.lanczos3
    })
    .jpeg({ quality: 90 })
    .toBuffer();
}

/**
 * Export project as .smz archive
 *
 * @param {string} outputPath - Path for output .smz file
 * @param {string} projectId - Project UUID
 * @param {Object} projectData - Full project data
 * @param {Object} folderPaths - Project folder paths
 * @param {Function} progressCallback - Callback for progress updates
 * @param {Function} pdfGenerator - Function to generate project PDF
 * @param {Object} projectSerializer - Project serialization module
 * @returns {Promise<{success: boolean, filePath?: string, error?: string}>}
 */
async function exportSmz(
  outputPath,
  projectId,
  projectData,
  folderPaths,
  progressCallback,
  pdfGenerator,
  projectSerializer
) {
  try {
    log.info(`[SmzExport] Starting .smz export for project: ${projectId}`);

    // Collect all micrographs
    const allMicrographs = collectAllMicrographs(projectData);
    const micrographIds = collectMicrographIds(projectData);
    const totalMicrographs = allMicrographs.length;

    log.info(`[SmzExport] Found ${totalMicrographs} micrographs`);

    // Calculate total steps for progress
    // Steps: project.json (1) + tile completeness pass (totalMicrographs)
    //        + each micrograph * 3 (image + thumbnail + tiles) + associatedFiles (1) + PDF (1)
    const totalSteps = 1 + totalMicrographs + (totalMicrographs * 3) + 1 + 1;
    let currentStep = 0;

    const sendProgress = (phase, itemName) => {
      currentStep++;
      const percentage = Math.round((currentStep / totalSteps) * 100);
      progressCallback({
        phase,
        current: currentStep,
        total: totalSteps,
        itemName,
        percentage: Math.min(percentage, 100),
      });
    };

    // Create ZIP archive
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 6 } });

    // Handle errors
    archive.on('error', (err) => {
      throw err;
    });

    // Pipe archive to output file
    archive.pipe(output);

    // --- Step 1: Save project.json ---
    sendProgress('Saving project data', 'project.json');

    const legacyJson = projectSerializer.serializeToLegacyFormat(projectData);
    const projectJsonContent = JSON.stringify(legacyJson, null, 2);
    archive.append(projectJsonContent, { name: `${projectId}/project.json` });

    // --- Step 1b: Generate README.txt ---
    const readmeContent = generateReadme(projectData, allMicrographs);
    archive.append(readmeContent, { name: `${projectId}/README.txt` });

    // --- Step 2: Tile completeness pass ---
    // Ensure all tiles exist in the local tile cache before packaging
    log.info(`[SmzExport] Running tile completeness pass for ${totalMicrographs} micrographs...`);

    for (const { micrograph } of allMicrographs) {
      const micrographName = micrograph.name || micrograph.id;
      const micrographId = micrograph.id;

      sendProgress('Generating tiles', micrographName);

      const sourceImagePath = await resolveImagePathWithLegacyFallback(
        path.join(folderPaths.images, micrographId)
      );

      if (!fs.existsSync(sourceImagePath)) {
        log.warn(`[SmzExport] Source image not found for tile generation: ${sourceImagePath}`);
        continue;
      }

      try {
        // processImageComplete generates thumbnail, medium, and ALL tiles
        // It checks cache first and only generates missing tiles
        const result = await tileGenerator.processImageComplete(sourceImagePath);
        if (result.fromCache) {
          log.info(`[SmzExport] Tiles already complete for: ${micrographName}`);
        } else {
          log.info(`[SmzExport] Generated ${result.tilesGenerated} tiles for: ${micrographName}`);
        }
      } catch (err) {
        log.error(`[SmzExport] Failed to complete tiles for ${micrographId}:`, err);
      }
    }

    // --- Step 3: Process each micrograph ---
    for (const { micrograph } of allMicrographs) {
      const micrographName = micrograph.name || micrograph.id;
      const micrographId = micrograph.id;

      // Check if source image exists (with fallback to uiImages for legacy projects)
      const sourceImagePath = await resolveImagePathWithLegacyFallback(
        path.join(folderPaths.images, micrographId)
      );
      if (!fs.existsSync(sourceImagePath)) {
        log.warn(`[SmzExport] Source image not found: ${sourceImagePath}`);
        currentStep += 3;
        continue;
      }

      // 3a. Copy original image to images/ folder
      sendProgress('Copying original images', micrographName);
      const imageBuffer = await fs.promises.readFile(sourceImagePath);
      archive.append(imageBuffer, { name: `${projectId}/images/${micrographId}` });

      // 3b. Copy composite thumbnail from disk (already maintained by desktop app)
      sendProgress('Copying composite thumbnails', micrographName);
      try {
        const compositeThumbnailPath = path.join(folderPaths.compositeThumbnails, micrographId);
        if (fs.existsSync(compositeThumbnailPath)) {
          const thumbBuffer = await fs.promises.readFile(compositeThumbnailPath);
          archive.append(thumbBuffer, { name: `${projectId}/compositeThumbnails/${micrographId}` });
        } else {
          // Fallback: generate composite thumbnail if not on disk
          log.warn(`[SmzExport] Composite thumbnail not found on disk for ${micrographId}, generating...`);
          try {
            const compositeBuffer = await generateCompositeBufferNoSpots(projectId, micrograph, projectData, folderPaths);
            const resizedThumb = await resizeToMaxLongEdge(compositeBuffer, COMPOSITE_THUMBNAIL_SIZE);
            archive.append(resizedThumb, { name: `${projectId}/compositeThumbnails/${micrographId}` });
          } catch (genErr) {
            log.error(`[SmzExport] Failed to generate fallback compositeThumbnail for ${micrographId}:`, genErr);
          }
        }
      } catch (err) {
        log.error(`[SmzExport] Failed to copy compositeThumbnail for ${micrographId}:`, err);
      }

      // 3c. Package tile cache into tiles/<micrographId>/
      // For affine-placed overlays (3-point registration), package the pre-transformed
      // pyramid from tiles-affine/ so the web viewer renders the warped image at
      // affineBoundsOffset — the transform is baked into the pixels.
      sendProgress('Packaging tiles', micrographName);
      try {
        const tileArchivePrefix = `${projectId}/tiles/${micrographId}`;
        const isAffine = micrograph.placementType === 'affine';

        if (isAffine) {
          const affineHash = micrograph.affineTileHash;
          if (!affineHash) {
            log.warn(`[SmzExport] Affine micrograph ${micrographId} missing affineTileHash, skipping tiles`);
          } else {
            const affineDir = tileCache.getAffineTilesDir(affineHash);

            // Normalize metadata: web viewer's TileMetadata expects width/height,
            // but the affine generator writes transformedWidth/transformedHeight.
            const affineMetadataPath = tileCache.getAffineMetadataPath(affineHash);
            if (fs.existsSync(affineMetadataPath)) {
              const raw = JSON.parse(await fs.promises.readFile(affineMetadataPath, 'utf-8'));
              const normalized = {
                ...raw,
                width: raw.transformedWidth ?? raw.width,
                height: raw.transformedHeight ?? raw.height,
              };
              archive.append(JSON.stringify(normalized, null, 2), { name: `${tileArchivePrefix}/metadata.json` });
            } else {
              log.warn(`[SmzExport] Affine tile metadata not found for ${micrographId}`);
            }

            const affineThumbPath = tileCache.getAffineThumbnailPath(affineHash);
            if (fs.existsSync(affineThumbPath)) {
              const thumbBuffer = await fs.promises.readFile(affineThumbPath);
              archive.append(thumbBuffer, { name: `${tileArchivePrefix}/thumbnail.jpg` });
            }

            const affineMediumPath = tileCache.getAffineMediumPath(affineHash);
            if (fs.existsSync(affineMediumPath)) {
              const mediumBuffer = await fs.promises.readFile(affineMediumPath);
              archive.append(mediumBuffer, { name: `${tileArchivePrefix}/medium.jpg` });
            }

            if (fs.existsSync(affineDir)) {
              const tileFiles = await fs.promises.readdir(affineDir);
              const webpFiles = tileFiles.filter(f => f.startsWith('tile_') && f.endsWith('.webp'));
              for (const tileFile of webpFiles) {
                const tilePath = path.join(affineDir, tileFile);
                const tileBuffer = await fs.promises.readFile(tilePath);
                archive.append(tileBuffer, { name: `${tileArchivePrefix}/tiles/${tileFile}` });
              }
              log.info(`[SmzExport] Packaged ${webpFiles.length} affine tiles for ${micrographName}`);
            } else {
              log.warn(`[SmzExport] Affine tiles directory not found for ${micrographId}`);
            }
          }
        } else {
          const imageHash = await tileCache.generateImageHash(sourceImagePath);
          const cacheDir = tileCache.getCacheDir(imageHash);

          // Copy metadata.json
          const metadataPath = path.join(cacheDir, 'metadata.json');
          if (fs.existsSync(metadataPath)) {
            const metadataBuffer = await fs.promises.readFile(metadataPath);
            archive.append(metadataBuffer, { name: `${tileArchivePrefix}/metadata.json` });
          } else {
            log.warn(`[SmzExport] Tile metadata not found for ${micrographId}`);
          }

          // Copy thumbnail.jpg
          const thumbnailPath = tileCache.getThumbnailPath(imageHash);
          if (fs.existsSync(thumbnailPath)) {
            const thumbBuffer = await fs.promises.readFile(thumbnailPath);
            archive.append(thumbBuffer, { name: `${tileArchivePrefix}/thumbnail.jpg` });
          }

          // Copy medium.jpg
          const mediumPath = tileCache.getMediumPath(imageHash);
          if (fs.existsSync(mediumPath)) {
            const mediumBuffer = await fs.promises.readFile(mediumPath);
            archive.append(mediumBuffer, { name: `${tileArchivePrefix}/medium.jpg` });
          }

          // Copy all tile files
          const tilesDir = path.join(cacheDir, 'tiles');
          if (fs.existsSync(tilesDir)) {
            const tileFiles = await fs.promises.readdir(tilesDir);
            const webpFiles = tileFiles.filter(f => f.endsWith('.webp'));
            for (const tileFile of webpFiles) {
              const tilePath = path.join(tilesDir, tileFile);
              const tileBuffer = await fs.promises.readFile(tilePath);
              archive.append(tileBuffer, { name: `${tileArchivePrefix}/tiles/${tileFile}` });
            }
            log.info(`[SmzExport] Packaged ${webpFiles.length} tiles for ${micrographName}`);
          } else {
            log.warn(`[SmzExport] Tiles directory not found for ${micrographId}`);
          }
        }
      } catch (err) {
        log.error(`[SmzExport] Failed to package tiles for ${micrographId}:`, err);
      }
    }

    // --- Step 4: Copy associatedFiles folder and all contents ---
    sendProgress('Copying associated files', 'associatedFiles');
    try {
      const associatedFilesPath = folderPaths.associatedFiles;
      if (fs.existsSync(associatedFilesPath)) {
        const files = await fs.promises.readdir(associatedFilesPath);
        for (const file of files) {
          const filePath = path.join(associatedFilesPath, file);
          const stat = await fs.promises.stat(filePath);
          if (stat.isFile()) {
            const fileBuffer = await fs.promises.readFile(filePath);
            archive.append(fileBuffer, { name: `${projectId}/associatedFiles/${file}` });
            log.info(`[SmzExport] Added associated file: ${file}`);
          }
        }
        // If folder was empty, still create the directory in the archive
        if (files.length === 0) {
          archive.append('', { name: `${projectId}/associatedFiles/.gitkeep` });
        }
      } else {
        // Create empty folder if it doesn't exist
        archive.append('', { name: `${projectId}/associatedFiles/.gitkeep` });
      }
    } catch (err) {
      log.error('[SmzExport] Failed to copy associated files:', err);
      // Create empty folder on error
      archive.append('', { name: `${projectId}/associatedFiles/.gitkeep` });
    }

    // --- Step 4b: Copy point-counts folder and all session files ---
    sendProgress('Copying point count sessions', 'point-counts');
    try {
      const pointCountsPath = path.join(folderPaths.projectPath, 'point-counts');
      if (fs.existsSync(pointCountsPath)) {
        const files = await fs.promises.readdir(pointCountsPath);
        const jsonFiles = files.filter(f => f.endsWith('.json'));
        for (const file of jsonFiles) {
          const filePath = path.join(pointCountsPath, file);
          const stat = await fs.promises.stat(filePath);
          if (stat.isFile()) {
            const fileBuffer = await fs.promises.readFile(filePath);
            archive.append(fileBuffer, { name: `${projectId}/point-counts/${file}` });
            log.info(`[SmzExport] Added point count session: ${file}`);
          }
        }
        if (jsonFiles.length > 0) {
          log.info(`[SmzExport] Added ${jsonFiles.length} point count session(s)`);
        }
      }
    } catch (err) {
      log.error('[SmzExport] Failed to copy point count sessions:', err);
      // Non-critical - continue without point counts
    }

    // --- Step 5: Generate project.pdf ---
    sendProgress('Generating PDF report', 'project.pdf');
    try {
      // Create a temporary file for the PDF
      const tempPdfPath = path.join(folderPaths.projectPath, 'project_temp.pdf');

      // Generate PDF using the provided generator
      await pdfGenerator(
        tempPdfPath,
        projectData,
        projectId,
        folderPaths,
        () => {}, // No nested progress callback needed
      );

      // Add PDF to archive
      if (fs.existsSync(tempPdfPath)) {
        const pdfBuffer = await fs.promises.readFile(tempPdfPath);
        archive.append(pdfBuffer, { name: `${projectId}/project.pdf` });

        // Clean up temp file
        await fs.promises.unlink(tempPdfPath);
      }
    } catch (err) {
      log.error('[SmzExport] Failed to generate PDF:', err);
      // Continue without PDF - not critical
    }

    // Finalize archive
    await archive.finalize();

    // Wait for output stream to finish
    await new Promise((resolve, reject) => {
      output.on('close', resolve);
      output.on('error', reject);
    });

    log.info(`[SmzExport] Export complete: ${outputPath}`);

    return {
      success: true,
      filePath: outputPath,
    };

  } catch (error) {
    log.error('[SmzExport] Export failed:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

module.exports = {
  exportSmz,
  collectMicrographIds,
  collectAllMicrographs,
  generateCompositeBufferNoSpots,
  generatePlainResized,
  resizeToMaxLongEdge,
};
