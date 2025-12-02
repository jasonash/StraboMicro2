/**
 * Tile Cache System
 *
 * Implements disk-based caching for image tiles as discussed in:
 * docs/tile-cache-discussion.md
 *
 * Cache Structure:
 * <userData>/tile-cache/
 *   <image-hash>/
 *     metadata.json         - Image dimensions, tile info, original path
 *     thumbnail.jpg         - 512x512 thumbnail (for quick preview)
 *     medium.jpg            - 2048x2048 medium resolution
 *     tiles/
 *       tile_0_0.png        - Full resolution tiles (256x256 default)
 *       tile_0_1.png
 *       ...
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');

// Configuration
const TILE_SIZE = 256;           // 256x256 pixel tiles
const THUMBNAIL_SIZE = 512;      // 512x512 thumbnail
const MEDIUM_SIZE = 2048;        // 2048x2048 medium resolution
const CACHE_VERSION = '1.0';     // Increment to invalidate old caches

class TileCache {
  constructor() {
    this.cacheDir = path.join(app.getPath('userData'), 'tile-cache');
    this.ensureCacheDirectory();
  }

  /**
   * Ensure the cache directory exists
   */
  async ensureCacheDirectory() {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create cache directory:', error);
    }
  }

  /**
   * Generate a unique hash for an image file
   * Uses file path + size to identify images.
   *
   * Note: We intentionally exclude mtime because when importing .smz files,
   * the extraction process sets a new mtime even though the content is identical.
   * This allows the tile cache to be reused across project re-imports.
   *
   * @param {string} imagePath - Absolute path to image file
   * @returns {Promise<string>} - SHA-256 hash
   */
  async generateImageHash(imagePath) {
    try {
      const stats = await fs.stat(imagePath);
      const hashInput = `${imagePath}:${stats.size}`;
      return crypto.createHash('sha256').update(hashInput).digest('hex');
    } catch (error) {
      console.error('Failed to generate image hash:', error);
      throw error;
    }
  }

  /**
   * Get the cache directory path for an image
   *
   * @param {string} imageHash - Image hash
   * @returns {string} - Path to cache directory
   */
  getCacheDir(imageHash) {
    return path.join(this.cacheDir, imageHash);
  }

  /**
   * Check if cache exists and is valid for an image
   *
   * @param {string} imagePath - Path to original image
   * @returns {Promise<{exists: boolean, hash: string}>}
   */
  async isCacheValid(imagePath) {
    try {
      const hash = await this.generateImageHash(imagePath);
      const cacheDir = this.getCacheDir(hash);
      const metadataPath = path.join(cacheDir, 'metadata.json');

      // Check if metadata exists
      const metadataExists = fsSync.existsSync(metadataPath);
      if (!metadataExists) {
        return { exists: false, hash };
      }

      // Validate metadata
      const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));

      // Check cache version
      if (metadata.cacheVersion !== CACHE_VERSION) {
        console.log('Cache version mismatch, invalidating cache');
        return { exists: false, hash };
      }

      // Check if original file still exists and hasn't changed
      if (metadata.originalPath !== imagePath) {
        console.log('Image path mismatch, invalidating cache');
        console.log('  Expected:', metadata.originalPath);
        console.log('  Got:', imagePath);
        return { exists: false, hash };
      }

      return { exists: true, hash, metadata };
    } catch (error) {
      console.error('Error checking cache validity:', error);
      return { exists: false, hash: null };
    }
  }

  /**
   * Create metadata for an image
   *
   * @param {string} imagePath - Original image path
   * @param {number} width - Image width in pixels
   * @param {number} height - Image height in pixels
   * @returns {Object} - Metadata object
   */
  createMetadata(imagePath, width, height) {
    const tilesX = Math.ceil(width / TILE_SIZE);
    const tilesY = Math.ceil(height / TILE_SIZE);

    return {
      cacheVersion: CACHE_VERSION,
      originalPath: imagePath,
      width,
      height,
      tileSize: TILE_SIZE,
      tilesX,
      tilesY,
      totalTiles: tilesX * tilesY,
      thumbnailSize: THUMBNAIL_SIZE,
      mediumSize: MEDIUM_SIZE,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Save metadata to cache
   *
   * @param {string} imageHash - Image hash
   * @param {Object} metadata - Metadata object
   */
  async saveMetadata(imageHash, metadata) {
    const cacheDir = this.getCacheDir(imageHash);
    await fs.mkdir(cacheDir, { recursive: true });

    const metadataPath = path.join(cacheDir, 'metadata.json');
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  }

  /**
   * Load metadata from cache
   *
   * @param {string} imageHash - Image hash
   * @returns {Promise<Object|null>} - Metadata object or null if not found
   */
  async loadMetadata(imageHash) {
    try {
      const metadataPath = path.join(this.getCacheDir(imageHash), 'metadata.json');
      const data = await fs.readFile(metadataPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }

  /**
   * Get path to thumbnail image
   *
   * @param {string} imageHash - Image hash
   * @returns {string} - Path to thumbnail
   */
  getThumbnailPath(imageHash) {
    return path.join(this.getCacheDir(imageHash), 'thumbnail.jpg');
  }

  /**
   * Get path to medium resolution image
   *
   * @param {string} imageHash - Image hash
   * @returns {string} - Path to medium image
   */
  getMediumPath(imageHash) {
    return path.join(this.getCacheDir(imageHash), 'medium.jpg');
  }

  /**
   * Get path to a specific tile
   *
   * @param {string} imageHash - Image hash
   * @param {number} x - Tile X coordinate
   * @param {number} y - Tile Y coordinate
   * @returns {string} - Path to tile
   */
  getTilePath(imageHash, x, y) {
    const tilesDir = path.join(this.getCacheDir(imageHash), 'tiles');
    return path.join(tilesDir, `tile_${x}_${y}.webp`);
  }

  /**
   * Check if thumbnail exists in cache
   *
   * @param {string} imageHash - Image hash
   * @returns {Promise<boolean>}
   */
  async hasThumbnail(imageHash) {
    try {
      await fs.access(this.getThumbnailPath(imageHash));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if medium resolution image exists in cache
   *
   * @param {string} imageHash - Image hash
   * @returns {Promise<boolean>}
   */
  async hasMedium(imageHash) {
    try {
      await fs.access(this.getMediumPath(imageHash));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if a tile exists in cache
   *
   * @param {string} imageHash - Image hash
   * @param {number} x - Tile X coordinate
   * @param {number} y - Tile Y coordinate
   * @returns {Promise<boolean>}
   */
  async hasTile(imageHash, x, y) {
    try {
      await fs.access(this.getTilePath(imageHash, x, y));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Save thumbnail to cache
   *
   * @param {string} imageHash - Image hash
   * @param {Buffer} buffer - Image buffer (JPEG)
   */
  async saveThumbnail(imageHash, buffer) {
    const thumbnailPath = this.getThumbnailPath(imageHash);
    await fs.mkdir(path.dirname(thumbnailPath), { recursive: true });
    await fs.writeFile(thumbnailPath, buffer);
  }

  /**
   * Save medium resolution image to cache
   *
   * @param {string} imageHash - Image hash
   * @param {Buffer} buffer - Image buffer (JPEG)
   */
  async saveMedium(imageHash, buffer) {
    const mediumPath = this.getMediumPath(imageHash);
    await fs.mkdir(path.dirname(mediumPath), { recursive: true });
    await fs.writeFile(mediumPath, buffer);
  }

  /**
   * Save tile to cache
   *
   * @param {string} imageHash - Image hash
   * @param {number} x - Tile X coordinate
   * @param {number} y - Tile Y coordinate
   * @param {Buffer} buffer - Tile image buffer (PNG)
   */
  async saveTile(imageHash, x, y, buffer) {
    const tilePath = this.getTilePath(imageHash, x, y);
    await fs.mkdir(path.dirname(tilePath), { recursive: true });
    await fs.writeFile(tilePath, buffer);
  }

  /**
   * Load thumbnail from cache
   *
   * @param {string} imageHash - Image hash
   * @returns {Promise<Buffer|null>}
   */
  async loadThumbnail(imageHash) {
    try {
      return await fs.readFile(this.getThumbnailPath(imageHash));
    } catch {
      return null;
    }
  }

  /**
   * Load medium resolution image from cache
   *
   * @param {string} imageHash - Image hash
   * @returns {Promise<Buffer|null>}
   */
  async loadMedium(imageHash) {
    try {
      return await fs.readFile(this.getMediumPath(imageHash));
    } catch {
      return null;
    }
  }

  /**
   * Load tile from cache
   *
   * @param {string} imageHash - Image hash
   * @param {number} x - Tile X coordinate
   * @param {number} y - Tile Y coordinate
   * @returns {Promise<Buffer|null>}
   */
  async loadTile(imageHash, x, y) {
    try {
      return await fs.readFile(this.getTilePath(imageHash, x, y));
    } catch {
      return null;
    }
  }

  /**
   * Clear cache for a specific image
   *
   * @param {string} imageHash - Image hash
   */
  async clearImageCache(imageHash) {
    try {
      const cacheDir = this.getCacheDir(imageHash);
      await fs.rm(cacheDir, { recursive: true, force: true });
    } catch (error) {
      console.error('Failed to clear image cache:', error);
    }
  }

  /**
   * Clear all caches (useful for debugging/maintenance)
   */
  async clearAllCaches() {
    try {
      await fs.rm(this.cacheDir, { recursive: true, force: true });
      await this.ensureCacheDirectory();
    } catch (error) {
      console.error('Failed to clear all caches:', error);
    }
  }

  /**
   * Get cache statistics
   *
   * @returns {Promise<Object>} - Cache statistics
   */
  async getCacheStats() {
    try {
      const entries = await fs.readdir(this.cacheDir);
      let totalSize = 0;
      let imageCount = 0;

      for (const entry of entries) {
        const entryPath = path.join(this.cacheDir, entry);
        const stats = await fs.stat(entryPath);

        if (stats.isDirectory()) {
          imageCount++;
          // Calculate directory size recursively
          totalSize += await this.getDirectorySize(entryPath);
        }
      }

      return {
        imageCount,
        totalSizeBytes: totalSize,
        totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
        cacheDirectory: this.cacheDir,
      };
    } catch (error) {
      console.error('Failed to get cache stats:', error);
      return {
        imageCount: 0,
        totalSizeBytes: 0,
        totalSizeMB: '0.00',
        cacheDirectory: this.cacheDir,
        error: error.message,
      };
    }
  }

  /**
   * Get total size of a directory
   *
   * @param {string} dirPath - Directory path
   * @returns {Promise<number>} - Total size in bytes
   */
  async getDirectorySize(dirPath) {
    let totalSize = 0;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          totalSize += await this.getDirectorySize(entryPath);
        } else {
          const stats = await fs.stat(entryPath);
          totalSize += stats.size;
        }
      }
    } catch (error) {
      console.error('Failed to get directory size:', error);
    }

    return totalSize;
  }
}

// Export singleton instance
module.exports = new TileCache();
