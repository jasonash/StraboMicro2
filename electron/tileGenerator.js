/**
 * Tile Generator Service
 *
 * Generates multi-resolution tiles from source images:
 * - Thumbnail (512x512) - Fast preview
 * - Medium (2048x2048) - Moderate zoom
 * - Full tiles (256x256 each) - High resolution viewing
 *
 * Uses tiff library for TIFF decoding and node-canvas for image processing
 */

const { createCanvas, loadImage } = require('canvas');
const tileCache = require('./tileCache');
const sharp = require('sharp');

// Configure Sharp for large images
// Set concurrency to 1 to reduce memory usage
sharp.concurrency(1);

// Set memory limits (optional, but helps prevent OOM)
// This limits the pixel cache size Sharp uses
sharp.cache({ memory: 512 }); // 512MB cache limit

// Tile configuration
const TILE_SIZE = 256;
const THUMBNAIL_SIZE = 512;
const MEDIUM_SIZE = 2048;
const JPEG_QUALITY = 0.85; // 85% quality for thumbnails/medium

class TileGenerator {
  /**
   * Process an image and generate all cached assets
   *
   * IMPORTANT: This does NOT load the full image into memory!
   * Only generates thumbnail and medium resolution.
   * Full tiles are generated on-demand to avoid OOM crashes.
   *
   * @param {string} imagePath - Path to source image
   * @returns {Promise<{hash: string, metadata: Object}>}
   */
  async processImage(imagePath) {
    // Generate hash and check cache
    const hash = await tileCache.generateImageHash(imagePath);
    const cacheStatus = await tileCache.isCacheValid(imagePath);

    if (cacheStatus.exists) {
      console.log(`Cache hit for image: ${imagePath}`);
      return {
        hash,
        metadata: cacheStatus.metadata,
        fromCache: true,
      };
    }

    console.log(`Cache miss - generating thumbnails for: ${imagePath}`);

    // Get image dimensions using Sharp metadata (doesn't load full image into memory)
    const sharpMetadata = await sharp(imagePath).metadata();
    const { width, height } = sharpMetadata;

    console.log(`Image dimensions: ${width}x${height} (format: ${sharpMetadata.format})`);

    // Create metadata
    const metadata = tileCache.createMetadata(imagePath, width, height);
    await tileCache.saveMetadata(hash, metadata);

    // Generate thumbnail and medium using sharp (more memory efficient)
    await this.generateThumbnailFromFile(hash, imagePath, width, height);
    await this.generateMediumFromFile(hash, imagePath, width, height);

    // Free the image data immediately
    // Tiles will be generated on-demand when requested

    console.log(`Cache created for image: ${imagePath}`);

    return {
      hash,
      metadata,
      fromCache: false,
    };
  }

  /**
   * Generate thumbnail directly from file using sharp (memory efficient)
   *
   * @param {string} hash - Image hash
   * @param {string} imagePath - Path to source image
   * @param {number} width - Original width
   * @param {number} height - Original height
   */
  async generateThumbnailFromFile(hash, imagePath, width, height) {
    // Check if already cached
    if (await tileCache.hasThumbnail(hash)) {
      return;
    }

    // Calculate thumbnail dimensions
    const scale = Math.min(THUMBNAIL_SIZE / width, THUMBNAIL_SIZE / height);
    const thumbWidth = Math.round(width * scale);
    const thumbHeight = Math.round(height * scale);

    // Use sharp to resize efficiently (doesn't load full image into canvas)
    const buffer = await sharp(imagePath)
      .resize(thumbWidth, thumbHeight, { fit: 'inside' })
      .jpeg({ quality: Math.round(JPEG_QUALITY * 100) })
      .toBuffer();

    await tileCache.saveThumbnail(hash, buffer);
    console.log(`Generated thumbnail: ${thumbWidth}x${thumbHeight}`);
  }

  /**
   * Generate medium resolution directly from file using sharp (memory efficient)
   *
   * @param {string} hash - Image hash
   * @param {string} imagePath - Path to source image
   * @param {number} width - Original width
   * @param {number} height - Original height
   */
  async generateMediumFromFile(hash, imagePath, width, height) {
    // Check if already cached
    if (await tileCache.hasMedium(hash)) {
      return;
    }

    // Skip if image is smaller than medium size
    if (width <= MEDIUM_SIZE && height <= MEDIUM_SIZE) {
      console.log('Image smaller than medium size, skipping');
      return;
    }

    // Calculate medium dimensions
    const scale = Math.min(MEDIUM_SIZE / width, MEDIUM_SIZE / height);
    const medWidth = Math.round(width * scale);
    const medHeight = Math.round(height * scale);

    // Use sharp to resize efficiently
    const buffer = await sharp(imagePath)
      .resize(medWidth, medHeight, { fit: 'inside' })
      .jpeg({ quality: Math.round(JPEG_QUALITY * 100) })
      .toBuffer();

    await tileCache.saveMedium(hash, buffer);
    console.log(`Generated medium: ${medWidth}x${medHeight}`);
  }

  /**
   * Generate and cache thumbnail (512x512 max) - DEPRECATED - use generateThumbnailFromFile
   *
   * @param {string} hash - Image hash
   * @param {Canvas} sourceCanvas - Source image canvas
   * @param {number} width - Original width
   * @param {number} height - Original height
   */
  async generateThumbnail(hash, sourceCanvas, width, height) {
    // Check if already cached
    if (await tileCache.hasThumbnail(hash)) {
      return;
    }

    // Calculate thumbnail dimensions (maintain aspect ratio)
    const scale = Math.min(THUMBNAIL_SIZE / width, THUMBNAIL_SIZE / height);
    const thumbWidth = Math.round(width * scale);
    const thumbHeight = Math.round(height * scale);

    // Create thumbnail canvas
    const thumbCanvas = createCanvas(thumbWidth, thumbHeight);
    const thumbCtx = thumbCanvas.getContext('2d');

    // Use high-quality image smoothing
    thumbCtx.imageSmoothingEnabled = true;
    thumbCtx.imageSmoothingQuality = 'high';

    // Draw scaled image
    thumbCtx.drawImage(sourceCanvas, 0, 0, thumbWidth, thumbHeight);

    // Save as JPEG
    const buffer = thumbCanvas.toBuffer('image/jpeg', { quality: JPEG_QUALITY });
    await tileCache.saveThumbnail(hash, buffer);

    console.log(`Generated thumbnail: ${thumbWidth}x${thumbHeight}`);
  }

  /**
   * Generate and cache medium resolution image (2048x2048 max)
   *
   * @param {string} hash - Image hash
   * @param {Canvas} sourceCanvas - Source image canvas
   * @param {number} width - Original width
   * @param {number} height - Original height
   */
  async generateMedium(hash, sourceCanvas, width, height) {
    // Check if already cached
    if (await tileCache.hasMedium(hash)) {
      return;
    }

    // If image is smaller than medium size, skip (just use original)
    if (width <= MEDIUM_SIZE && height <= MEDIUM_SIZE) {
      console.log('Image smaller than medium size, skipping medium generation');
      return;
    }

    // Calculate medium dimensions (maintain aspect ratio)
    const scale = Math.min(MEDIUM_SIZE / width, MEDIUM_SIZE / height);
    const medWidth = Math.round(width * scale);
    const medHeight = Math.round(height * scale);

    // Create medium canvas
    const medCanvas = createCanvas(medWidth, medHeight);
    const medCtx = medCanvas.getContext('2d');

    // Use high-quality image smoothing
    medCtx.imageSmoothingEnabled = true;
    medCtx.imageSmoothingQuality = 'high';

    // Draw scaled image
    medCtx.drawImage(sourceCanvas, 0, 0, medWidth, medHeight);

    // Save as JPEG
    const buffer = medCanvas.toBuffer('image/jpeg', { quality: JPEG_QUALITY });
    await tileCache.saveMedium(hash, buffer);

    console.log(`Generated medium: ${medWidth}x${medHeight}`);
  }

  /**
   * Generate a single tile on-demand
   *
   * @param {string} hash - Image hash
   * @param {Object} imageData - Image data
   * @param {number} tileX - Tile X coordinate
   * @param {number} tileY - Tile Y coordinate
   * @returns {Promise<Buffer>} - PNG tile buffer
   */
  async generateTile(hash, imageData, tileX, tileY) {
    const { width, height, data } = imageData;

    // Check if tile already cached
    const cached = await tileCache.loadTile(hash, tileX, tileY);
    if (cached) {
      return cached;
    }

    // Calculate tile bounds
    const x = tileX * TILE_SIZE;
    const y = tileY * TILE_SIZE;
    const tileWidth = Math.min(TILE_SIZE, width - x);
    const tileHeight = Math.min(TILE_SIZE, height - y);

    // Create tile canvas
    const tileCanvas = createCanvas(TILE_SIZE, TILE_SIZE);
    const tileCtx = tileCanvas.getContext('2d');

    // Fill with transparent background (for edge tiles)
    tileCtx.clearRect(0, 0, TILE_SIZE, TILE_SIZE);

    // Extract tile data from source image
    const tileData = tileCtx.createImageData(tileWidth, tileHeight);

    // Copy pixel data for this tile
    for (let row = 0; row < tileHeight; row++) {
      const sourceRow = y + row;
      const sourceOffset = (sourceRow * width + x) * 4;
      const tileOffset = row * tileWidth * 4;

      const sourceSlice = data.slice(sourceOffset, sourceOffset + tileWidth * 4);
      tileData.data.set(sourceSlice, tileOffset);
    }

    // Draw tile data to canvas
    tileCtx.putImageData(tileData, 0, 0);

    // Save as PNG
    const buffer = tileCanvas.toBuffer('image/png');
    await tileCache.saveTile(hash, tileX, tileY, buffer);

    return buffer;
  }

  /**
   * Generate multiple tiles in batch
   *
   * @param {string} hash - Image hash
   * @param {Object} imageData - Image data
   * @param {Array<{x: number, y: number}>} tiles - Array of tile coordinates
   * @returns {Promise<Array<{x: number, y: number, buffer: Buffer}>>}
   */
  async generateTiles(hash, imageData, tiles) {
    const results = [];

    for (const { x, y } of tiles) {
      const buffer = await this.generateTile(hash, imageData, x, y);
      results.push({ x, y, buffer });
    }

    return results;
  }

  /**
   * Decode TIFF image and return RGBA data
   * Implements RGB to RGBA conversion as documented in docs/TIFF-RGB-to-RGBA-Conversion.md
   *
   * @param {string} imagePath - Path to TIFF file
   * @returns {Promise<{width: number, height: number, data: Buffer}>}
   */
  async decodeTiff(imagePath) {
    // Dynamic import for ES module
    const { decode } = await import('tiff');
    const fs = require('fs').promises;

    // Read TIFF file
    const buffer = await fs.readFile(imagePath);
    const tiffData = decode(buffer);

    // Get first image (page 0)
    const image = tiffData[0];
    const { width, height, data } = image;

    // Detect format by calculating bytes per pixel
    const bytesPerPixel = data.length / (width * height);
    console.log(`TIFF decoded: ${width}x${height}, ${data.length} bytes, ${bytesPerPixel} bytes/pixel`);

    const sourceData = new Uint8Array(data);
    let rgbaData;

    if (bytesPerPixel === 3) {
      // RGB format - need to convert to RGBA
      console.log('Converting RGB to RGBA');
      const pixelCount = width * height;
      rgbaData = new Uint8Array(pixelCount * 4);

      // RGB to RGBA conversion loop
      // Two index pointers: i for source (RGB), j for destination (RGBA)
      for (let i = 0, j = 0; i < sourceData.length; i += 3, j += 4) {
        rgbaData[j] = sourceData[i];         // R
        rgbaData[j + 1] = sourceData[i + 1]; // G
        rgbaData[j + 2] = sourceData[i + 2]; // B
        rgbaData[j + 3] = 255;               // A (fully opaque)
      }
    } else if (bytesPerPixel === 4) {
      // Already RGBA format
      console.log('Already RGBA format');
      rgbaData = sourceData;
    } else {
      throw new Error(`Unsupported TIFF format: ${bytesPerPixel} bytes per pixel`);
    }

    return {
      width,
      height,
      data: Buffer.from(rgbaData),
    };
  }

  /**
   * Load image from various formats (JPEG, PNG, etc.)
   *
   * @param {string} imagePath - Path to image file
   * @returns {Promise<{width: number, height: number, data: Buffer}>}
   */
  async decodeImage(imagePath) {
    const image = await loadImage(imagePath);
    const { width, height } = image;

    // Create canvas and extract RGBA data
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);

    const imageData = ctx.getImageData(0, 0, width, height);

    return {
      width,
      height,
      data: Buffer.from(imageData.data),
    };
  }

  /**
   * Auto-detect format and decode image
   *
   * @param {string} imagePath - Path to image file
   * @returns {Promise<{width: number, height: number, data: Buffer}>}
   */
  async decodeAuto(imagePath) {
    const ext = imagePath.toLowerCase().split('.').pop();

    if (ext === 'tif' || ext === 'tiff') {
      return this.decodeTiff(imagePath);
    } else {
      return this.decodeImage(imagePath);
    }
  }
}

module.exports = new TileGenerator();
