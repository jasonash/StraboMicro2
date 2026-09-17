/**
 * Auto-updater module for StraboMicro2
 *
 * Handles checking for updates, downloading, and installing via electron-updater.
 * Uses GitHub Releases as the update source.
 */

const os = require('os');
const { app } = require('electron');
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

// Whether the most recent check was a silent (startup/periodic) one, and
// whether the "your OS is too old for the latest version" notice has already
// been shown this session. Silent checks show it once; manual checks always.
let lastCheckSilent = true;
let unsupportedOsNotified = false;

// os.release() on macOS is the Darwin kernel version, which is what
// electron-updater compares minimumSystemVersion against.
const DARWIN_TO_MACOS = {
  20: 'macOS 11 (Big Sur)',
  21: 'macOS 12 (Monterey)',
  22: 'macOS 13 (Ventura)',
  23: 'macOS 14 (Sonoma)',
  24: 'macOS 15 (Sequoia)',
  25: 'macOS 26 (Tahoe)',
};

/**
 * Compare two dotted numeric version strings ("22.6.0", "2.0.45").
 * Missing or non-numeric components count as 0.
 * @returns {number} negative if a < b, 0 if equal, positive if a > b
 */
function compareVersions(a, b) {
  const pa = String(a).split('.').map((x) => parseInt(x, 10) || 0);
  const pb = String(b).split('.').map((x) => parseInt(x, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Human-readable name for a minimumSystemVersion value from the update feed.
 * @param {string} minimumSystemVersion - Darwin version on macOS
 * @returns {string}
 */
function describeMinimumOs(minimumSystemVersion) {
  const major = parseInt(minimumSystemVersion, 10);
  if (process.platform === 'darwin' && DARWIN_TO_MACOS[major]) {
    return DARWIN_TO_MACOS[major];
  }
  return `OS version ${minimumSystemVersion}`;
}

/**
 * Detect "a newer version exists but this machine's OS is too old to run it".
 * electron-updater checks updateInfo.minimumSystemVersion against os.release()
 * and, when the OS is too old, reports a plain 'update-not-available', which
 * would leave the user believing they are current.
 *
 * @param {object} info - updateInfo from electron-updater
 * @returns {{version: string, requiredOs: string} | null}
 */
function unsupportedOsInfo(info) {
  if (!info || !info.minimumSystemVersion || !info.version) return null;
  if (compareVersions(info.version, app.getVersion()) <= 0) return null;
  if (compareVersions(os.release(), info.minimumSystemVersion) >= 0) return null;
  return {
    version: info.version,
    requiredOs: describeMinimumOs(info.minimumSystemVersion),
  };
}

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
    updateAvailable = null;

    const unsupported = unsupportedOsInfo(info);
    if (unsupported) {
      log.info(`Update ${unsupported.version} exists but requires ${unsupported.requiredOs}; this machine reports OS ${os.release()}`);
      if (!lastCheckSilent || !unsupportedOsNotified) {
        unsupportedOsNotified = true;
        sendStatusToWindow('unsupported-os', unsupported);
      }
      return;
    }

    log.info('No updates available. Current version:', info.version);
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
  lastCheckSilent = silent;
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
  cleanup,
  // Exported for tests
  compareVersions,
  unsupportedOsInfo,
};
