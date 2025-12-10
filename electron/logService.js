/**
 * Log Service - Persistent logging with rotation
 *
 * Provides a centralized logging service that writes to a file
 * in the app's user data directory. Supports log rotation to
 * prevent unbounded file growth.
 *
 * Log file location:
 * - macOS: ~/Library/Application Support/StraboMicro2/app.log
 * - Windows: %APPDATA%/StraboMicro2/app.log
 * - Linux: ~/.config/StraboMicro2/app.log
 */

const { app } = require('electron');
const fs = require('fs');
const path = require('path');

// Configuration
const MAX_LOG_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB max log file size
const MAX_BACKUP_FILES = 2; // Keep 2 backup files (app.log.1, app.log.2)
const LOG_FILENAME = 'app.log';

class LogService {
  constructor() {
    this.logDir = null;
    this.logPath = null;
    this.initialized = false;
  }

  /**
   * Initialize the log service
   * Must be called after app.whenReady()
   */
  init() {
    if (this.initialized) return;

    this.logDir = app.getPath('userData');
    this.logPath = path.join(this.logDir, LOG_FILENAME);
    this.initialized = true;

    // Perform rotation check on startup
    this._rotateIfNeeded();

    // Log startup
    this.info('='.repeat(60));
    this.info(`StraboMicro ${app.getVersion()} started`);
    this.info(`Platform: ${process.platform} ${process.arch}`);
    this.info(`Electron: ${process.versions.electron}`);
    this.info(`Node: ${process.versions.node}`);
    this.info('='.repeat(60));
  }

  /**
   * Get the path to the log file
   */
  getLogPath() {
    return this.logPath;
  }

  /**
   * Get the directory containing the log file
   */
  getLogDir() {
    return this.logDir;
  }

  /**
   * Read the current log file contents
   * @returns {string} Log file contents
   */
  readLog() {
    if (!this.initialized || !fs.existsSync(this.logPath)) {
      return '';
    }

    try {
      return fs.readFileSync(this.logPath, 'utf8');
    } catch (err) {
      console.error('Failed to read log file:', err);
      return `Error reading log file: ${err.message}`;
    }
  }

  /**
   * Write a log entry
   * @param {string} level - Log level (INFO, WARN, ERROR)
   * @param {string} message - Log message
   * @param {any} [data] - Optional additional data
   */
  _write(level, message, data) {
    if (!this.initialized) {
      console.warn('[LogService] Not initialized, cannot write log');
      return;
    }

    const timestamp = new Date().toISOString();
    let logLine = `[${timestamp}] [${level}] ${message}`;

    if (data !== undefined) {
      try {
        const dataStr =
          typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data);
        logLine += `\n${dataStr}`;
      } catch {
        logLine += `\n[Data serialization failed]`;
      }
    }

    logLine += '\n';

    try {
      fs.appendFileSync(this.logPath, logLine);
      this._rotateIfNeeded();
    } catch (err) {
      console.error('Failed to write to log file:', err);
    }
  }

  /**
   * Log an info message
   */
  info(message, data) {
    this._write('INFO', message, data);
  }

  /**
   * Log a warning message
   */
  warn(message, data) {
    this._write('WARN', message, data);
  }

  /**
   * Log an error message
   */
  error(message, data) {
    this._write('ERROR', message, data);
  }

  /**
   * Log a message from the renderer process
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {string} [source] - Source identifier (e.g., 'renderer', 'console')
   */
  fromRenderer(level, message, source = 'renderer') {
    this._write(level, `[${source}] ${message}`);
  }

  /**
   * Rotate log files if the current log exceeds MAX_LOG_SIZE_BYTES
   */
  _rotateIfNeeded() {
    if (!fs.existsSync(this.logPath)) return;

    try {
      const stats = fs.statSync(this.logPath);
      if (stats.size < MAX_LOG_SIZE_BYTES) return;

      // Rotate existing backup files
      // app.log.2 -> deleted
      // app.log.1 -> app.log.2
      // app.log -> app.log.1
      for (let i = MAX_BACKUP_FILES; i >= 1; i--) {
        const oldPath = path.join(this.logDir, `${LOG_FILENAME}.${i}`);
        const newPath = path.join(this.logDir, `${LOG_FILENAME}.${i + 1}`);

        if (i === MAX_BACKUP_FILES && fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath); // Delete oldest backup
        } else if (fs.existsSync(oldPath)) {
          fs.renameSync(oldPath, newPath);
        }
      }

      // Rotate current log to .1
      const backupPath = path.join(this.logDir, `${LOG_FILENAME}.1`);
      fs.renameSync(this.logPath, backupPath);

      // Create fresh log file
      fs.writeFileSync(this.logPath, '');

      console.log('[LogService] Log rotated, old log saved to:', backupPath);
    } catch (err) {
      console.error('[LogService] Failed to rotate log:', err);
    }
  }

  /**
   * Clear the current log file (for debugging/testing)
   */
  clear() {
    if (!this.initialized) return;

    try {
      fs.writeFileSync(this.logPath, '');
      this.info('Log cleared by user');
    } catch (err) {
      console.error('Failed to clear log file:', err);
    }
  }
}

// Export singleton instance
const logService = new LogService();
module.exports = logService;
