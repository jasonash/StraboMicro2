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
    const scratchPath = this.getScratchPath(identifier);

    // Ensure destination directory exists
    await fs.promises.mkdir(path.dirname(destination), { recursive: true });

    // Use copy+unlink instead of rename to support cross-filesystem moves
    // (On Linux, /tmp is often a separate tmpfs filesystem from /home)
    await fs.promises.copyFile(scratchPath, destination);

    // On Windows, antivirus scanners (e.g. Windows Defender) can briefly
    // lock newly-written files, causing EPERM on immediate unlink.
    // Retry with backoff; if all retries fail, log a warning and move on —
    // the copy already succeeded and cleanupAll() handles stale files on restart.
    const maxRetries = 3;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await fs.promises.unlink(scratchPath);
        break;
      } catch (unlinkError) {
        if (unlinkError.code === 'EPERM' && attempt < maxRetries) {
          const delay = (attempt + 1) * 200;
          log.warn(`[ScratchSpace] EPERM on unlink, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else if (unlinkError.code === 'ENOENT') {
          break; // Already gone
        } else if (attempt === maxRetries) {
          log.warn(`[ScratchSpace] Could not delete scratch file after ${maxRetries} retries (will be cleaned up on next launch): ${scratchPath}`);
        } else {
          throw unlinkError;
        }
      }
    }

    log.info(`[ScratchSpace] Moved ${identifier} to ${destination}`);
  }
}

module.exports = new ScratchSpace();
