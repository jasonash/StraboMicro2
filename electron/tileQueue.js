/**
 * Tile Queue Service
 *
 * Manages tile generation with priority queue and deduplication.
 * Solves the problem of multiple concurrent tile requests causing memory pressure
 * and confusing UX when loading large projects.
 *
 * Features:
 * - Single-threaded tile generation (one image decoded at a time)
 * - Priority queue (current selection > visible overlays > background)
 * - Request deduplication (same tile only generated once)
 * - Progress reporting for UI feedback
 * - Cancellation support for rapid navigation
 */

const tileGenerator = require('./tileGenerator');
const tileCache = require('./tileCache');
const { EventEmitter } = require('events');

// Priority levels (lower number = higher priority)
const PRIORITY = {
  PREPARATION: 0,    // Initial project load preparation
  CURRENT: 1,        // Currently selected micrograph
  VISIBLE_OVERLAY: 2, // Visible overlay micrographs
  BACKGROUND: 3,     // Background tile generation
};

class TileQueue extends EventEmitter {
  constructor() {
    super();

    // Queue of pending requests
    this.queue = [];

    // Set of image hashes currently being processed or queued
    // Used for deduplication
    this.pendingImages = new Set();

    // Currently processing request
    this.currentRequest = null;

    // Is the queue actively processing?
    this.isProcessing = false;

    // Statistics for progress reporting
    this.stats = {
      totalImages: 0,
      completedImages: 0,
      currentImageName: '',
      isPreparationPhase: false,
    };
  }

  /**
   * Reset queue statistics (called at start of new project load)
   */
  resetStats() {
    this.stats = {
      totalImages: 0,
      completedImages: 0,
      currentImageName: '',
      isPreparationPhase: false,
    };
  }

  /**
   * Add an image to the preparation queue
   * This generates thumbnails, medium resolution, AND all full-resolution tiles
   *
   * @param {string} imagePath - Full path to source image
   * @param {string} imageName - Display name for progress UI
   * @param {number} priority - Priority level (default: PREPARATION)
   * @returns {Promise<{hash: string, metadata: object, fromCache: boolean}>}
   */
  async queuePreparation(imagePath, imageName, priority = PRIORITY.PREPARATION) {
    // Check if metadata exists
    const cacheStatus = await tileCache.isCacheValid(imagePath);

    if (cacheStatus.exists) {
      // Metadata exists, but we need to check if ALL tiles are cached
      const { tilesX, tilesY } = cacheStatus.metadata;
      let allTilesCached = true;

      for (let ty = 0; ty < tilesY && allTilesCached; ty++) {
        for (let tx = 0; tx < tilesX && allTilesCached; tx++) {
          const cached = await tileCache.loadTile(cacheStatus.hash, tx, ty);
          if (!cached) {
            allTilesCached = false;
          }
        }
      }

      if (allTilesCached) {
        // Everything is fully cached, skip this image
        return {
          hash: cacheStatus.hash,
          metadata: cacheStatus.metadata,
          fromCache: true,
          skipped: true,
        };
      }
      // Otherwise, some tiles are missing - need to process
      console.log(`[TileQueue] ${imageName}: metadata exists but some tiles missing, will regenerate`);
    }

    // Check if already queued/processing
    const hash = await tileCache.generateImageHash(imagePath);
    if (this.pendingImages.has(hash)) {
      // Return a promise that resolves when the existing request completes
      return this.waitForImage(hash);
    }

    // Add to pending set
    this.pendingImages.add(hash);

    // Create request
    return new Promise((resolve, reject) => {
      const request = {
        type: 'preparation',
        imagePath,
        imageName,
        hash,
        priority,
        resolve,
        reject,
        cancelled: false,
      };

      // Insert into queue based on priority
      this.insertByPriority(request);

      // Start processing if not already running
      this.processQueue();
    });
  }

  /**
   * Add tile generation request to queue
   *
   * @param {string} imageHash - Image hash
   * @param {Array<{x: number, y: number}>} tiles - Tile coordinates to generate
   * @param {number} priority - Priority level
   * @returns {Promise<Array<{x: number, y: number, dataUrl: string}>>}
   */
  async queueTiles(imageHash, tiles, priority = PRIORITY.BACKGROUND) {
    // Check which tiles are already cached
    const uncachedTiles = [];
    const cachedResults = [];

    for (const { x, y } of tiles) {
      const cached = await tileCache.loadTile(imageHash, x, y);
      if (cached) {
        const base64 = cached.toString('base64');
        cachedResults.push({
          x,
          y,
          dataUrl: `data:image/webp;base64,${base64}`,
        });
      } else {
        uncachedTiles.push({ x, y });
      }
    }

    // If all tiles are cached, return immediately
    if (uncachedTiles.length === 0) {
      return cachedResults;
    }

    // Create request for uncached tiles
    return new Promise((resolve, reject) => {
      const request = {
        type: 'tiles',
        imageHash,
        tiles: uncachedTiles,
        cachedResults,
        priority,
        resolve,
        reject,
        cancelled: false,
      };

      this.insertByPriority(request);
      this.processQueue();
    });
  }

  /**
   * Wait for an image that's already being processed
   *
   * @param {string} hash - Image hash to wait for
   * @returns {Promise}
   */
  waitForImage(hash) {
    return new Promise((resolve) => {
      const checkComplete = () => {
        if (!this.pendingImages.has(hash)) {
          resolve({ fromCache: true, alreadyProcessing: true });
        } else {
          setTimeout(checkComplete, 100);
        }
      };
      checkComplete();
    });
  }

  /**
   * Insert request into queue based on priority
   *
   * @param {object} request - Request object
   */
  insertByPriority(request) {
    // Find insertion point
    let insertIndex = this.queue.length;
    for (let i = 0; i < this.queue.length; i++) {
      if (this.queue[i].priority > request.priority) {
        insertIndex = i;
        break;
      }
    }
    this.queue.splice(insertIndex, 0, request);
  }

  /**
   * Cancel all pending requests for a specific image
   * Used when user navigates away from an image
   *
   * @param {string} imageHash - Image hash to cancel
   */
  cancelForImage(imageHash) {
    // Mark queued requests as cancelled
    for (const request of this.queue) {
      if (request.hash === imageHash || request.imageHash === imageHash) {
        request.cancelled = true;
      }
    }

    // Remove cancelled requests from queue
    this.queue = this.queue.filter(r => !r.cancelled);
  }

  /**
   * Cancel all pending requests (except preparation)
   * Used when switching projects
   */
  cancelAll() {
    // Cancel all non-preparation requests
    for (const request of this.queue) {
      if (request.type !== 'preparation') {
        request.cancelled = true;
        request.reject?.(new Error('Cancelled'));
      }
    }

    // Remove cancelled requests
    this.queue = this.queue.filter(r => !r.cancelled);
  }

  /**
   * Boost priority of a specific image's requests
   * Used when user selects a new micrograph
   *
   * @param {string} imageHash - Image hash to boost
   */
  boostPriority(imageHash) {
    for (const request of this.queue) {
      if (request.hash === imageHash || request.imageHash === imageHash) {
        request.priority = PRIORITY.CURRENT;
      }
    }

    // Re-sort queue by priority
    this.queue.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Process the queue
   */
  async processQueue() {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0) {
      // Get next request
      const request = this.queue.shift();

      // Skip if cancelled
      if (request.cancelled) {
        continue;
      }

      this.currentRequest = request;

      try {
        if (request.type === 'preparation') {
          await this.processPreparation(request);
        } else if (request.type === 'tiles') {
          await this.processTiles(request);
        }
      } catch (error) {
        console.error('[TileQueue] Error processing request:', error);
        request.reject?.(error);
      }

      this.currentRequest = null;
    }

    this.isProcessing = false;

    // Emit queue empty event
    this.emit('queueEmpty');
  }

  /**
   * Process a preparation request (thumbnail + medium + ALL tiles)
   *
   * @param {object} request - Preparation request
   */
  async processPreparation(request) {
    const { imagePath, imageName, hash, resolve } = request;

    // Update stats
    this.stats.currentImageName = imageName;
    this.emit('progress', { ...this.stats });

    try {
      // Generate thumbnail, medium, AND all tiles using processImageComplete
      // This ensures everything is cached before user starts browsing
      const result = await tileGenerator.processImageComplete(imagePath, (currentTile, totalTiles) => {
        // Emit tile progress (optional - could be used for more detailed progress UI)
        this.emit('tileProgress', {
          imageName,
          currentTile,
          totalTiles,
        });
      });

      // Remove from pending set
      this.pendingImages.delete(hash);

      // Update stats
      this.stats.completedImages++;
      this.emit('progress', { ...this.stats });

      resolve({
        hash: result.hash,
        metadata: result.metadata,
        fromCache: result.fromCache,
        tilesGenerated: result.tilesGenerated,
      });
    } catch (error) {
      this.pendingImages.delete(hash);
      throw error;
    }
  }

  /**
   * Process a tiles request
   *
   * @param {object} request - Tiles request
   */
  async processTiles(request) {
    const { imageHash, tiles, cachedResults, resolve } = request;

    try {
      // Load metadata
      const metadata = await tileCache.loadMetadata(imageHash);
      if (!metadata) {
        throw new Error(`Metadata not found for hash: ${imageHash}`);
      }

      // Decode image once
      const imageData = await tileGenerator.decodeAuto(metadata.originalPath);

      // Generate all uncached tiles
      const generatedResults = [];
      for (const { x, y } of tiles) {
        // Check if request was cancelled mid-processing
        if (request.cancelled) {
          throw new Error('Cancelled');
        }

        const buffer = await tileGenerator.generateTile(imageHash, imageData, x, y);
        const base64 = buffer.toString('base64');
        generatedResults.push({
          x,
          y,
          dataUrl: `data:image/webp;base64,${base64}`,
        });
      }

      // Combine cached and generated results
      resolve([...cachedResults, ...generatedResults]);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Prepare all images in a project
   * This is the "preparation phase" that runs on project load
   *
   * @param {Array<{imagePath: string, imageName: string}>} images - List of images to prepare
   * @returns {Promise<{prepared: number, cached: number, total: number}>}
   */
  async prepareProject(images) {
    // Reset stats
    this.resetStats();
    this.stats.totalImages = images.length;
    this.stats.isPreparationPhase = true;
    this.emit('preparationStart', { total: images.length });

    let prepared = 0;
    let cached = 0;

    // Queue all images for preparation
    const promises = images.map(async ({ imagePath, imageName }) => {
      try {
        const result = await this.queuePreparation(imagePath, imageName, PRIORITY.PREPARATION);
        if (result.skipped || result.fromCache) {
          cached++;
        } else {
          prepared++;
        }
        return result;
      } catch (error) {
        console.error(`[TileQueue] Failed to prepare ${imageName}:`, error);
        return null;
      }
    });

    // Wait for all preparations to complete
    await Promise.all(promises);

    // End preparation phase
    this.stats.isPreparationPhase = false;
    this.emit('preparationComplete', { prepared, cached, total: images.length });

    return { prepared, cached, total: images.length };
  }

  /**
   * Get current queue status
   *
   * @returns {object} - Queue status
   */
  getStatus() {
    return {
      queueLength: this.queue.length,
      isProcessing: this.isProcessing,
      currentRequest: this.currentRequest ? {
        type: this.currentRequest.type,
        imageName: this.currentRequest.imageName,
      } : null,
      stats: { ...this.stats },
    };
  }
}

// Export singleton instance
module.exports = new TileQueue();
module.exports.PRIORITY = PRIORITY;
