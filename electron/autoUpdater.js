/**
 * Auto-updater module for StraboMicro2
 *
 * Handles checking for updates, downloading, and installing via electron-updater.
 * Uses GitHub Releases as the update source.
 */

const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

// Configure logging for auto-updater
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

// Don't automatically download updates - wait for user action
autoUpdater.autoDownload = false;

// Auto-install downloaded updates when the user quits the app
autoUpdater.autoInstallOnAppQuit = true;

// Store reference to main window for sending IPC messages
let mainWindow = null;

// Track update state
let updateAvailable = null;
let downloadProgress = null;
let updateDownloaded = false;
let checkInterval = null;

// Check for updates every 4 hours
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

/**
 * Initialize the auto-updater with the main window reference
 * @param {BrowserWindow} window - The main application window
 */
function initAutoUpdater(window) {
  mainWindow = window;

  // Set up event handlers
  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for updates...');
    sendStatusToWindow('checking');
  });

  autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info.version);
    updateAvailable = {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes
    };
    sendStatusToWindow('available', updateAvailable);
  });

  autoUpdater.on('update-not-available', (info) => {
    log.info('No updates available. Current version:', info.version);
    updateAvailable = null;
    sendStatusToWindow('not-available', { version: info.version });
  });

  autoUpdater.on('error', (err) => {
    log.error('Auto-updater error:', err);
    sendStatusToWindow('error', { message: err.message });
  });

  autoUpdater.on('download-progress', (progress) => {
    downloadProgress = {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total
    };
    sendStatusToWindow('downloading', downloadProgress);
  });

  autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded:', info.version);
    updateDownloaded = true;
    sendStatusToWindow('downloaded', {
      version: info.version,
      releaseNotes: info.releaseNotes
    });
  });

  // Periodic silent check for updates (every 4 hours)
  checkInterval = setInterval(() => {
    if (updateDownloaded) {
      // Remind user about downloaded update waiting to be installed
      log.info('[AutoUpdater] Reminding user about pending update...');
      sendStatusToWindow('downloaded', {
        version: updateAvailable?.version,
        releaseNotes: updateAvailable?.releaseNotes
      });
    } else if (!updateAvailable) {
      log.info('[AutoUpdater] Periodic update check...');
      checkForUpdates(true);
    }
  }, CHECK_INTERVAL_MS);
}

/**
 * Send update status to the renderer process
 * @param {string} status - The update status
 * @param {object} data - Additional data to send
 */
function sendStatusToWindow(status, data = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', { status, ...data });
  }
}

/**
 * Check for updates
 * @param {boolean} silent - If true, don't notify if no update is available
 */
async function checkForUpdates(silent = true) {
  try {
    if (!silent) {
      sendStatusToWindow('checking');
    }
    await autoUpdater.checkForUpdates();
  } catch (error) {
    log.error('Error checking for updates:', error);
    if (!silent) {
      sendStatusToWindow('error', { message: error.message });
    }
  }
}

/**
 * Download the available update
 */
async function downloadUpdate() {
  if (!updateAvailable) {
    log.warn('No update available to download');
    return;
  }

  try {
    sendStatusToWindow('downloading', { percent: 0 });
    await autoUpdater.downloadUpdate();
  } catch (error) {
    log.error('Error downloading update:', error);
    sendStatusToWindow('error', { message: error.message });
  }
}

/**
 * Quit and install the downloaded update
 */
function quitAndInstall() {
  if (!updateDownloaded) {
    log.warn('No update downloaded to install');
    return;
  }

  log.info('Quitting and installing update...');
  autoUpdater.quitAndInstall();
}

/**
 * Get the current update state
 * @returns {object} Current update state
 */
function getUpdateState() {
  return {
    updateAvailable,
    downloadProgress,
    updateDownloaded
  };
}

/**
 * Clean up the periodic check interval
 */
function cleanup() {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
}

module.exports = {
  initAutoUpdater,
  checkForUpdates,
  downloadUpdate,
  quitAndInstall,
  getUpdateState,
  cleanup
};
