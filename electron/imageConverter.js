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
const scratchSpace = require('./scratchSpace');
const bmp = require('bmp-js');

// tiff is an ES module, we'll import it dynamically when needed
let decodeTIFF = null;
async function getTiffDecoder() {
  if (!decodeTIFF) {
    const tiffModule = await import('tiff');
    decodeTIFF = tiffModule.decode;
  }
  return decodeTIFF;
}

// Note: Sharp configuration is centralized in main.js to prevent conflicts
// Do not configure sharp.cache() or sharp.concurrency() here

/**
 * Maximum image dimension (long edge) for performance.
 * Images larger than this will be downscaled during import.
 * 10K pixels provides excellent detail while keeping tile counts manageable.
 */
const MAX_IMAGE_DIMENSION = 10000;

/**
 * Calculate downscaled dimensions if image exceeds MAX_IMAGE_DIMENSION.
 * Maintains aspect ratio, scaling based on the longer edge.
 * @param {number} width - Original width
 * @param {number} height - Original height
 * @returns {{width: number, height: number, downscaled: boolean}}
 */
function calculateDownscaledDimensions(width, height) {
  const longEdge = Math.max(width, height);
  if (longEdge <= MAX_IMAGE_DIMENSION) {
    return { width, height, downscaled: false };
  }

  const scale = MAX_IMAGE_DIMENSION / longEdge;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
    downscaled: true,
  };
}

/**
 * Convert TIFF (or other format) to JPEG in scratch space
 * This should be called IMMEDIATELY when user selects an image
 * Returns the scratch path where the JPEG is stored temporarily
 *
 * @param {string} inputPath - Path to input image (TIFF, PNG, BMP, etc.)
 * @param {Function} progressCallback - Optional callback for progress updates
 * @returns {Promise<Object>} Scratch identifier and metadata
 */
async function convertToScratchJPEG(inputPath, progressCallback = null) {
  try {
    log.info(`[ImageConverter] Converting to scratch JPEG: ${inputPath}`);

    // Ensure scratch directory exists
    await scratchSpace.ensureScratchDir();

    // Generate unique identifier for this conversion
    const identifier = `scratch-${Date.now()}.jpg`;
    const scratchPath = scratchSpace.getScratchPath(identifier);

    if (progressCallback) {
      progressCallback({ stage: 'reading', percent: 10 });
    }

    // Detect file format
    const ext = path.extname(inputPath).toLowerCase();
    const isTiff = ext === '.tif' || ext === '.tiff';

    if (isTiff) {
      // Use tiff library for TIFF files (bypasses libvips memory limits)
      log.info(`[ImageConverter] Detected TIFF file, using tiff library...`);

      // Get decode function (dynamic import)
      const decode = await getTiffDecoder();

      // Read TIFF file - use let so we can null it after use
      let fileBuffer = await fs.promises.readFile(inputPath);

      if (progressCallback) {
        progressCallback({ stage: 'converting', percent: 30 });
      }

      // Decode TIFF (this library handles large TIFFs efficiently)
      let tiffData = decode(fileBuffer);

      // Release file buffer immediately - no longer needed after decode
      fileBuffer = null;

      // Get first image (page 0)
      const image = tiffData[0];
      const width = image.width;
      const height = image.height;
      log.info(`[ImageConverter] TIFF dimensions: ${width}x${height}`);

      if (progressCallback) {
        progressCallback({ stage: 'converting', percent: 60 });
      }

      // Get image data - the tiff library returns data in different formats depending on the image
      // We need to convert it to a format Sharp can understand
      let rawBuffer;
      let channels;

      if (image.data) {
        // Image has raw pixel data
        rawBuffer = Buffer.from(image.data);

        // Determine number of channels from the data length
        const pixelCount = width * height;
        channels = rawBuffer.length / pixelCount;

        log.info(`[ImageConverter] Image has ${channels} channels`);
      } else {
        throw new Error('TIFF image data format not supported');
      }

      // Release tiffData - we've extracted what we need into rawBuffer
      tiffData = null;

      // Check if downscaling is needed
      const targetDims = calculateDownscaledDimensions(width, height);
      if (targetDims.downscaled) {
        log.info(`[ImageConverter] Image exceeds ${MAX_IMAGE_DIMENSION}px limit, will downscale to ${targetDims.width}x${targetDims.height}`);
      }

      log.info(`[ImageConverter] Converting raw pixel data to JPEG with Sharp...`);

      // Use Sharp to convert raw pixel data to JPEG (with optional downscale)
      let sharpPipeline = sharp(rawBuffer, {
        raw: {
          width,
          height,
          channels,
        },
      });

      if (targetDims.downscaled) {
        sharpPipeline = sharpPipeline.resize(targetDims.width, targetDims.height);
      }

      const info = await sharpPipeline
        .jpeg({
          quality: 95,
          mozjpeg: true,
        })
        .toFile(scratchPath);

      // Release rawBuffer - JPEG is now on disk
      rawBuffer = null;

      if (progressCallback) {
        progressCallback({ stage: 'complete', percent: 100 });
      }

      log.info(`[ImageConverter] Successfully converted TIFF to JPEG: ${info.width}x${info.height}, ${info.size} bytes`);
      log.info(`[ImageConverter] Scratch location: ${scratchPath}`);

      return {
        identifier,
        scratchPath,
        originalWidth: width,
        originalHeight: height,
        originalFormat: 'tiff',
        jpegWidth: info.width,
        jpegHeight: info.height,
        jpegSize: info.size,
      };
    } else if (ext === '.bmp') {
      // Use bmp-js library for BMP files (Sharp/libvips doesn't support BMP)
      log.info(`[ImageConverter] Detected BMP file, using bmp-js library...`);

      // Read BMP file - use let so we can null it after use
      let fileBuffer = await fs.promises.readFile(inputPath);

      if (progressCallback) {
        progressCallback({ stage: 'converting', percent: 30 });
      }

      // Decode BMP
      let bmpData = bmp.decode(fileBuffer);

      // Release file buffer immediately
      fileBuffer = null;

      const width = bmpData.width;
      const height = bmpData.height;
      log.info(`[ImageConverter] BMP dimensions: ${width}x${height}`);

      if (progressCallback) {
        progressCallback({ stage: 'converting', percent: 60 });
      }

      // bmp-js returns ABGR format (4 bytes per pixel: Alpha, Blue, Green, Red)
      // We need to convert to RGB for Sharp (JPEG doesn't support alpha anyway)
      const pixelCount = width * height;
      let rgbBuffer = Buffer.alloc(pixelCount * 3);

      for (let i = 0; i < pixelCount; i++) {
        const srcOffset = i * 4;
        const dstOffset = i * 3;
        // Convert ABGR to RGB (skip alpha, reorder BGR to RGB)
        rgbBuffer[dstOffset] = bmpData.data[srcOffset + 3];     // R (was at position 3)
        rgbBuffer[dstOffset + 1] = bmpData.data[srcOffset + 2]; // G (was at position 2)
        rgbBuffer[dstOffset + 2] = bmpData.data[srcOffset + 1]; // B (was at position 1)
      }

      // Release bmpData - we've extracted what we need
      bmpData = null;

      // Check if downscaling is needed
      const targetDims = calculateDownscaledDimensions(width, height);
      if (targetDims.downscaled) {
        log.info(`[ImageConverter] Image exceeds ${MAX_IMAGE_DIMENSION}px limit, will downscale to ${targetDims.width}x${targetDims.height}`);
      }

      log.info(`[ImageConverter] Converting BMP raw pixel data to JPEG with Sharp...`);

      // Use Sharp to convert raw pixel data to JPEG (with optional downscale)
      let sharpPipeline = sharp(rgbBuffer, {
        raw: {
          width,
          height,
          channels: 3,
        },
      });

      if (targetDims.downscaled) {
        sharpPipeline = sharpPipeline.resize(targetDims.width, targetDims.height);
      }

      const info = await sharpPipeline
        .jpeg({
          quality: 95,
          mozjpeg: true,
        })
        .toFile(scratchPath);

      // Release rgbBuffer - JPEG is now on disk
      rgbBuffer = null;

      if (progressCallback) {
        progressCallback({ stage: 'complete', percent: 100 });
      }

      log.info(`[ImageConverter] Successfully converted BMP to JPEG: ${info.width}x${info.height}, ${info.size} bytes`);
      log.info(`[ImageConverter] Scratch location: ${scratchPath}`);

      return {
        identifier,
        scratchPath,
        originalWidth: width,
        originalHeight: height,
        originalFormat: 'bmp',
        jpegWidth: info.width,
        jpegHeight: info.height,
        jpegSize: info.size,
      };
    } else {
      // For other files (JPEG, PNG), use Sharp directly
      log.info(`[ImageConverter] Using Sharp for standard image file...`);

      const metadata = await sharp(inputPath, {
        limitInputPixels: false,
        sequentialRead: true,
      }).metadata();

      log.info(`[ImageConverter] Source image: ${metadata.width}x${metadata.height}, format: ${metadata.format}`);

      // Check if downscaling is needed
      const targetDims = calculateDownscaledDimensions(metadata.width, metadata.height);
      if (targetDims.downscaled) {
        log.info(`[ImageConverter] Image exceeds ${MAX_IMAGE_DIMENSION}px limit, will downscale to ${targetDims.width}x${targetDims.height}`);
      }

      if (progressCallback) {
        progressCallback({ stage: 'converting', percent: 30 });
      }

      // Use Sharp to convert to JPEG (with optional downscale)
      let sharpPipeline = sharp(inputPath, {
        limitInputPixels: false,
        sequentialRead: true,
      });

      if (targetDims.downscaled) {
        sharpPipeline = sharpPipeline.resize(targetDims.width, targetDims.height);
      }

      const info = await sharpPipeline
        .jpeg({
          quality: 95,
          mozjpeg: true,
        })
        .toFile(scratchPath);

      if (progressCallback) {
        progressCallback({ stage: 'complete', percent: 100 });
      }

      log.info(`[ImageConverter] Successfully converted to JPEG: ${info.width}x${info.height}, ${info.size} bytes`);
      log.info(`[ImageConverter] Scratch location: ${scratchPath}`);

      return {
        identifier,
        scratchPath,
        originalWidth: metadata.width,
        originalHeight: metadata.height,
        originalFormat: metadata.format,
        jpegWidth: info.width,
        jpegHeight: info.height,
        jpegSize: info.size,
      };
    }
  } catch (error) {
    log.error(`[ImageConverter] Error converting to scratch JPEG:`, error);
    throw error;
  }
}

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

/**
 * Resize a scratch image to target dimensions
 * Used when adding XPL sibling that has different dimensions than PPL
 * @param {string} identifier - Scratch identifier
 * @param {number} targetWidth - Target width in pixels
 * @param {number} targetHeight - Target height in pixels
 * @returns {Promise<Object>} Result with new dimensions
 */
async function resizeScratchImage(identifier, targetWidth, targetHeight) {
  try {
    const scratchPath = scratchSpace.getScratchPath(identifier);
    log.info(`[ImageConverter] Resizing scratch image ${identifier} to ${targetWidth}x${targetHeight}`);

    // Read the current image
    const imageBuffer = await fs.readFile(scratchPath);

    // Resize to target dimensions
    const resizedBuffer = await sharp(imageBuffer)
      .resize(targetWidth, targetHeight, {
        fit: 'fill', // Exact dimensions (aspect ratios should already match)
        kernel: sharp.kernel.lanczos3,
      })
      .jpeg({ quality: 95 })
      .toBuffer();

    // Write back to the same scratch path
    await fs.writeFile(scratchPath, resizedBuffer);

    log.info(`[ImageConverter] Successfully resized scratch image to ${targetWidth}x${targetHeight}`);

    return {
      success: true,
      width: targetWidth,
      height: targetHeight,
    };
  } catch (error) {
    log.error(`[ImageConverter] Error resizing scratch image: ${error.message}`);
    throw error;
  }
}

module.exports = {
  convertToScratchJPEG,
  convertToJPEG,
  convertAndSaveMicrographImage,
  generateImageVariants,
  getImageDimensions,
  isValidImage,
  resizeScratchImage,
};
