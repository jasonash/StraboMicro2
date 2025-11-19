/**
 * Scratch Space Management
 *
 * Manages temporary storage for images during the workflow:
 * - Convert TIFF to JPEG immediately when selected
 * - Store in scratch space until micrograph is committed
 * - Clean up on cancel or app restart
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const log = require('electron-log');

class ScratchSpace {
  constructor() {
    // Use app's temp directory for scratch space
    this.scratchDir = path.join(app.getPath('temp'), 'StraboMicro2-scratch');
  }

  /**
   * Ensure scratch directory exists
   */
  async ensureScratchDir() {
    try {
      await fs.promises.mkdir(this.scratchDir, { recursive: true });
      log.info(`[ScratchSpace] Scratch directory ready: ${this.scratchDir}`);
    } catch (error) {
      log.error('[ScratchSpace] Error creating scratch directory:', error);
      throw error;
    }
  }

  /**
   * Get path for a scratch file
   * @param {string} identifier - Unique identifier (e.g., timestamp or UUID)
   * @returns {string} Full path to scratch file
   */
  getScratchPath(identifier) {
    return path.join(this.scratchDir, identifier);
  }

  /**
   * Check if a scratch file exists
   * @param {string} identifier - File identifier
   * @returns {Promise<boolean>}
   */
  async exists(identifier) {
    try {
      const filePath = this.getScratchPath(identifier);
      await fs.promises.access(filePath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete a specific scratch file
   * @param {string} identifier - File identifier
   */
  async deleteScratchFile(identifier) {
    try {
      const filePath = this.getScratchPath(identifier);
      await fs.promises.unlink(filePath);
      log.info(`[ScratchSpace] Deleted scratch file: ${identifier}`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        log.error('[ScratchSpace] Error deleting scratch file:', error);
      }
    }
  }

  /**
   * Clean up entire scratch directory
   * Should be called on app startup to remove old files
   */
  async cleanupAll() {
    try {
      log.info('[ScratchSpace] Cleaning up scratch directory');
      await fs.promises.rm(this.scratchDir, { recursive: true, force: true });
      await this.ensureScratchDir();
      log.info('[ScratchSpace] Scratch directory cleaned');
    } catch (error) {
      log.error('[ScratchSpace] Error cleaning scratch directory:', error);
    }
  }

  /**
   * Move file from scratch to final destination
   * @param {string} identifier - Scratch file identifier
   * @param {string} destination - Final destination path
   */
  async moveToFinal(identifier, destination) {
    try {
      const scratchPath = this.getScratchPath(identifier);

      // Ensure destination directory exists
      await fs.promises.mkdir(path.dirname(destination), { recursive: true });

      // Move file
      await fs.promises.rename(scratchPath, destination);
      log.info(`[ScratchSpace] Moved ${identifier} to ${destination}`);
    } catch (error) {
      log.error('[ScratchSpace] Error moving file to final destination:', error);
      throw error;
    }
  }
}

module.exports = new ScratchSpace();
