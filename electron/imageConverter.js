/**
 * Image Conversion Service
 *
 * This module handles conversion of various image formats (TIFF, PNG, BMP, etc.)
 * to JPEG format for backwards compatibility with the legacy JavaFX app.
 *
 * CRITICAL REQUIREMENTS:
 * - ALL images MUST be converted to JPEG before saving
 * - Legacy app cannot handle TIFF files
 * - Image filenames MUST be micrograph ID with NO file extension
 * - JPEG quality should be high (95) to preserve scientific data
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const log = require('electron-log');

/**
 * Convert any image format to JPEG
 * @param {string} inputPath - Path to input image (TIFF, PNG, BMP, etc.)
 * @param {string} outputPath - Path to output JPEG (should NOT include .jpg extension)
 * @param {Object} options - Conversion options
 * @param {number} options.quality - JPEG quality (1-100, default: 95)
 * @param {number} options.maxWidth - Maximum width (optional, for resizing)
 * @param {number} options.maxHeight - Maximum height (optional, for resizing)
 * @returns {Promise<Object>} Metadata about converted image
 */
async function convertToJPEG(inputPath, outputPath, options = {}) {
  const {
    quality = 95,
    maxWidth = null,
    maxHeight = null,
  } = options;

  try {
    log.info(`[ImageConverter] Converting image to JPEG: ${inputPath}`);
    log.info(`[ImageConverter] Output path: ${outputPath}`);
    log.info(`[ImageConverter] Quality: ${quality}, maxWidth: ${maxWidth}, maxHeight: ${maxHeight}`);

    // Create sharp instance
    let image = sharp(inputPath);

    // Get original metadata
    const metadata = await image.metadata();
    log.info(`[ImageConverter] Original image: ${metadata.width}x${metadata.height}, format: ${metadata.format}`);

    // Apply resizing if max dimensions specified
    if (maxWidth || maxHeight) {
      image = image.resize(maxWidth, maxHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      });
      log.info(`[ImageConverter] Resizing to fit within: ${maxWidth || 'auto'}x${maxHeight || 'auto'}`);
    }

    // Convert to JPEG and save
    const info = await image
      .jpeg({
        quality,
        mozjpeg: true, // Use mozjpeg for better compression
      })
      .toFile(outputPath);

    log.info(`[ImageConverter] Successfully converted to JPEG: ${info.width}x${info.height}, ${info.size} bytes`);

    return {
      success: true,
      originalWidth: metadata.width,
      originalHeight: metadata.height,
      originalFormat: metadata.format,
      outputWidth: info.width,
      outputHeight: info.height,
      outputSize: info.size,
      outputPath,
    };
  } catch (error) {
    log.error(`[ImageConverter] Error converting image to JPEG:`, error);
    throw error;
  }
}

/**
 * Convert and save a micrograph image to the project images folder
 * This is the PRIMARY function used when adding micrographs to a project
 *
 * @param {string} sourcePath - Path to source image file
 * @param {string} projectId - UUID of the project
 * @param {string} micrographId - UUID of the micrograph
 * @param {string} projectFoldersBasePath - Base path to StraboMicro2Data folder
 * @returns {Promise<Object>} Conversion result with metadata
 */
async function convertAndSaveMicrographImage(sourcePath, projectId, micrographId, projectFoldersBasePath) {
  try {
    log.info(`[ImageConverter] Converting micrograph image for project ${projectId}, micrograph ${micrographId}`);

    // Build path to project's images folder
    const imagesFolder = path.join(projectFoldersBasePath, projectId, 'images');

    // Ensure images folder exists
    await fs.promises.mkdir(imagesFolder, { recursive: true });

    // Output path: images/<micrograph-id> (NO extension!)
    const outputPath = path.join(imagesFolder, micrographId);

    // Convert to JPEG with high quality (95)
    const result = await convertToJPEG(sourcePath, outputPath, {
      quality: 95,
    });

    log.info(`[ImageConverter] Successfully saved micrograph image to: ${outputPath}`);

    return result;
  } catch (error) {
    log.error(`[ImageConverter] Error converting and saving micrograph image:`, error);
    throw error;
  }
}

/**
 * Generate multiple resized versions of an image for different purposes
 * This will be used later for composite images, thumbnails, web images, etc.
 *
 * @param {string} sourcePath - Path to source JPEG image
 * @param {string} projectId - UUID of the project
 * @param {string} micrographId - UUID of the micrograph
 * @param {string} projectFoldersBasePath - Base path to StraboMicro2Data folder
 * @returns {Promise<Object>} Paths to all generated images
 */
async function generateImageVariants(sourcePath, projectId, micrographId, projectFoldersBasePath) {
  try {
    log.info(`[ImageConverter] Generating image variants for micrograph ${micrographId}`);

    const projectPath = path.join(projectFoldersBasePath, projectId);

    // Define output paths (all without extension)
    const variants = [
      { folder: 'uiImages', maxSize: 2500, name: 'UI Image' },
      { folder: 'compositeImages', maxSize: 2000, name: 'Composite Image' },
      { folder: 'compositeThumbnails', maxSize: 250, name: 'Composite Thumbnail' },
      { folder: 'webImages', maxSize: 750, name: 'Web Image' },
      { folder: 'webThumbnails', maxSize: 200, name: 'Web Thumbnail' },
    ];

    const results = {};

    for (const variant of variants) {
      const outputFolder = path.join(projectPath, variant.folder);
      await fs.promises.mkdir(outputFolder, { recursive: true });

      const outputPath = path.join(outputFolder, micrographId);

      log.info(`[ImageConverter] Generating ${variant.name} (max ${variant.maxSize}px)...`);

      const result = await convertToJPEG(sourcePath, outputPath, {
        quality: 85, // Slightly lower quality for variants
        maxWidth: variant.maxSize,
        maxHeight: variant.maxSize,
      });

      results[variant.folder] = {
        path: outputPath,
        width: result.outputWidth,
        height: result.outputHeight,
        size: result.outputSize,
      };
    }

    log.info(`[ImageConverter] Successfully generated all image variants`);

    return {
      success: true,
      variants: results,
    };
  } catch (error) {
    log.error(`[ImageConverter] Error generating image variants:`, error);
    throw error;
  }
}

/**
 * Get image dimensions without loading the entire image
 * @param {string} imagePath - Path to image file
 * @returns {Promise<Object>} Image dimensions
 */
async function getImageDimensions(imagePath) {
  try {
    const metadata = await sharp(imagePath).metadata();
    return {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
    };
  } catch (error) {
    log.error(`[ImageConverter] Error getting image dimensions:`, error);
    throw error;
  }
}

/**
 * Check if a file is a valid image
 * @param {string} filePath - Path to file
 * @returns {Promise<boolean>} True if valid image
 */
async function isValidImage(filePath) {
  try {
    await sharp(filePath).metadata();
    return true;
  } catch (error) {
    return false;
  }
}

module.exports = {
  convertToJPEG,
  convertAndSaveMicrographImage,
  generateImageVariants,
  getImageDimensions,
  isValidImage,
};
