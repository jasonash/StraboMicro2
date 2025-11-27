/**
 * SMZ Export Service
 *
 * Handles exporting projects as .smz archives (ZIP files with .smz extension).
 * Generates all required image variants and packages them with project data.
 *
 * Folder structure inside .smz:
 * <project-uuid>/
 * ├── project.json                    # Full project data (legacy schema compliant)
 * ├── project.pdf                     # PDF report of entire project
 * ├── associatedFiles/                # External files (copied from project)
 * ├── images/                         # Full-size JPEGs (no extension), named by micrograph ID
 * ├── uiImages/                       # 2500px long edge, plain images
 * ├── compositeImages/                # 2000px long edge, with overlays (no spots/labels)
 * ├── compositeThumbnails/            # 250px long edge, with overlays
 * ├── webImages/                      # 750px long edge, with overlays
 * └── webThumbnails/                  # 200px long edge, with overlays
 */

const fs = require('fs');
const path = require('path');
const log = require('electron-log');
const sharp = require('sharp');
const archiver = require('archiver');

/**
 * Image size configurations for export
 */
const IMAGE_SIZES = {
  uiImages: { maxLongEdge: 2500, isComposite: false },
  compositeImages: { maxLongEdge: 2000, isComposite: true },
  compositeThumbnails: { maxLongEdge: 250, isComposite: true },
  webImages: { maxLongEdge: 750, isComposite: true },
  webThumbnails: { maxLongEdge: 200, isComposite: true },
};

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

  // Load base micrograph image
  const basePath = path.join(folderPaths.images, micrograph.id);
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

      const childPath = path.join(folderPaths.images, child.id);

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
    // Steps: project.json (1) + each micrograph * 6 image types + associatedFiles (1) + PDF (1)
    // Image types: images(copy), uiImages, compositeImages, compositeThumbnails, webImages, webThumbnails
    const totalSteps = 1 + (totalMicrographs * 6) + 1 + 1;
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

    // --- Step 2: Process each micrograph ---
    for (const { micrograph } of allMicrographs) {
      const micrographName = micrograph.name || micrograph.id;
      const micrographId = micrograph.id;

      // Check if source image exists
      const sourceImagePath = path.join(folderPaths.images, micrographId);
      if (!fs.existsSync(sourceImagePath)) {
        log.warn(`[SmzExport] Source image not found: ${sourceImagePath}`);
        // Skip steps for this micrograph but still count them
        currentStep += 6;
        continue;
      }

      // 2a. Copy original image to images/ folder
      sendProgress('Copying original images', micrographName);
      const imageBuffer = await fs.promises.readFile(sourceImagePath);
      archive.append(imageBuffer, { name: `${projectId}/images/${micrographId}` });

      // 2b. Generate uiImages (2500px, plain - no overlays)
      sendProgress('Generating UI images', micrographName);
      try {
        const uiBuffer = await generatePlainResized(sourceImagePath, IMAGE_SIZES.uiImages.maxLongEdge);
        archive.append(uiBuffer, { name: `${projectId}/uiImages/${micrographId}` });
      } catch (err) {
        log.error(`[SmzExport] Failed to generate uiImage for ${micrographId}:`, err);
      }

      // 2c. Generate compositeImages (2000px, with overlays, no spots)
      sendProgress('Generating composite images', micrographName);
      try {
        const compositeBuffer = await generateCompositeBufferNoSpots(projectId, micrograph, projectData, folderPaths);
        const resizedComposite = await resizeToMaxLongEdge(compositeBuffer, IMAGE_SIZES.compositeImages.maxLongEdge);
        archive.append(resizedComposite, { name: `${projectId}/compositeImages/${micrographId}` });
      } catch (err) {
        log.error(`[SmzExport] Failed to generate compositeImage for ${micrographId}:`, err);
      }

      // 2d. Generate compositeThumbnails (250px, with overlays, no spots)
      sendProgress('Generating composite thumbnails', micrographName);
      try {
        const compositeBuffer = await generateCompositeBufferNoSpots(projectId, micrograph, projectData, folderPaths);
        const resizedThumb = await resizeToMaxLongEdge(compositeBuffer, IMAGE_SIZES.compositeThumbnails.maxLongEdge);
        archive.append(resizedThumb, { name: `${projectId}/compositeThumbnails/${micrographId}` });
      } catch (err) {
        log.error(`[SmzExport] Failed to generate compositeThumbnail for ${micrographId}:`, err);
      }

      // 2e. Generate webImages (750px, with overlays, no spots)
      sendProgress('Generating web images', micrographName);
      try {
        const compositeBuffer = await generateCompositeBufferNoSpots(projectId, micrograph, projectData, folderPaths);
        const resizedWeb = await resizeToMaxLongEdge(compositeBuffer, IMAGE_SIZES.webImages.maxLongEdge);
        archive.append(resizedWeb, { name: `${projectId}/webImages/${micrographId}` });
      } catch (err) {
        log.error(`[SmzExport] Failed to generate webImage for ${micrographId}:`, err);
      }

      // 2f. Generate webThumbnails (200px, with overlays, no spots)
      sendProgress('Generating web thumbnails', micrographName);
      try {
        const compositeBuffer = await generateCompositeBufferNoSpots(projectId, micrograph, projectData, folderPaths);
        const resizedWebThumb = await resizeToMaxLongEdge(compositeBuffer, IMAGE_SIZES.webThumbnails.maxLongEdge);
        archive.append(resizedWebThumb, { name: `${projectId}/webThumbnails/${micrographId}` });
      } catch (err) {
        log.error(`[SmzExport] Failed to generate webThumbnail for ${micrographId}:`, err);
      }
    }

    // --- Step 3: Copy associatedFiles folder and all contents ---
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

    // --- Step 4: Generate project.pdf ---
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
  IMAGE_SIZES,
};
