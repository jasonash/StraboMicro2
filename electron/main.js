// Configure libvips memory limits BEFORE loading Sharp
// VIPS_DISC_THRESHOLD controls when libvips switches to disc caching
// Setting to 0 forces disc caching immediately, avoiding memory limits
process.env.VIPS_DISC_THRESHOLD = '0';

// Remove libvips memory limits entirely
process.env.VIPS_NOVECTOR = '1';

const { app, BrowserWindow, Menu, ipcMain, dialog, screen, nativeTheme, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const log = require('electron-log');
const Sentry = require('@sentry/electron/main');

// Initialize Sentry for error tracking (production only)
Sentry.init({
  dsn: 'https://a0a059594ef2ba9bfecb1e6bf028afde@o4510450188484608.ingest.us.sentry.io/4510450322046976',
  // Only enable in packaged builds
  enabled: app.isPackaged,
  // Add app version for release tracking
  release: `strabomicro2@${app.getVersion()}`,
  // Set environment
  environment: app.isPackaged ? 'production' : 'development',
  // Filter out sensitive file paths
  beforeSend(event) {
    // Scrub user home directory from file paths
    const homeDir = app.getPath('home');
    const eventStr = JSON.stringify(event);
    const scrubbedStr = eventStr.replace(new RegExp(homeDir, 'g'), '~');
    return JSON.parse(scrubbedStr);
  },
});
const sharp = require('sharp');

// Centralized Sharp/libvips configuration to prevent OOM crashes
// These settings apply to all modules that use sharp
sharp.concurrency(1); // Single-threaded to reduce memory pressure
sharp.cache({ memory: 256, files: 0, items: 50 }); // Conservative 256MB cache

const archiver = require('archiver');
const projectFolders = require('./projectFolders');
const imageConverter = require('./imageConverter');
const projectSerializer = require('./projectSerializer');
const scratchSpace = require('./scratchSpace');
const pdfExport = require('./pdfExport');
// Use React-PDF for better layout and working internal links
const pdfProjectExport = require('./pdfReactExport');
const smzExport = require('./smzExport');
const serverUpload = require('./serverUpload');
const versionHistory = require('./versionHistory');
const projectsIndex = require('./projectsIndex');
const svgExport = require('./svgExport');
const smzImport = require('./smzImport');
const serverDownload = require('./serverDownload');
const autoUpdaterModule = require('./autoUpdater');
const logService = require('./logService');

// Handle EPIPE errors at process level (prevents crash on broken stdout pipe)
process.stdout.on('error', (err) => {
  if (err.code === 'EPIPE') {
    // Ignore EPIPE errors - this happens when stdout is closed
    return;
  }
  console.error('stdout error:', err);
});

process.stderr.on('error', (err) => {
  if (err.code === 'EPIPE') {
    // Ignore EPIPE errors - this happens when stderr is closed
    return;
  }
  console.error('stderr error:', err);
});

// Configure electron-log
log.transports.file.level = 'info';
log.transports.console.level = 'debug';

// Prevent EPIPE errors when console transport pipe is closed
log.transports.console.useStyles = false;
log.errorHandler.startCatching({
  onError: ({ error, errorName }) => {
    // Suppress EPIPE errors from console transport
    if (error.code === 'EPIPE') {
      return;
    }
    // Log other errors to file only
    log.transports.console.level = false;
    log.error(`${errorName}:`, error);
  }
});

// Log application startup
log.info('StraboMicro application starting...');
log.info(`Electron version: ${process.versions.electron}`);
log.info(`Node version: ${process.versions.node}`);
log.info(`Chrome version: ${process.versions.chrome}`);

let mainWindow;
let splashWindow;

// Track if the user has requested to quit the app (via Cmd+Q or menu)
let isQuitting = false;

// Track file to open when app launches (from double-click or command line)
let pendingFileToOpen = null;

// =============================================================================
// FILE ASSOCIATION HANDLING (macOS and Windows)
// =============================================================================

/**
 * Handle opening an .smz file
 * Called when user double-clicks an .smz file or opens via command line
 */
function handleOpenFile(filePath) {
  if (!filePath || !filePath.toLowerCase().endsWith('.smz')) {
    log.info('[FileAssoc] Ignoring non-.smz file:', filePath);
    return;
  }

  log.info('[FileAssoc] Opening .smz file:', filePath);

  // Check if the file exists
  if (!fs.existsSync(filePath)) {
    log.error('[FileAssoc] File does not exist:', filePath);
    return;
  }

  // If window is ready, send the file path to renderer
  if (mainWindow && mainWindow.webContents) {
    log.info('[FileAssoc] Sending file to renderer');
    mainWindow.webContents.send('file:open-smz', filePath);
  } else {
    // Window not ready yet, store for later
    log.info('[FileAssoc] Window not ready, storing file path for later');
    pendingFileToOpen = filePath;
  }
}

// macOS: Handle file open events (double-click on .smz file)
// This event fires when file is opened while app is running OR when launching
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  log.info('[FileAssoc] macOS open-file event:', filePath);
  handleOpenFile(filePath);
});

// Windows/Linux: Single instance lock and command line argument handling
// When a second instance tries to open, we get the file path from argv
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Another instance is already running, quit this one
  // The other instance will receive the second-instance event with our argv
  log.info('[FileAssoc] Another instance is running, quitting');
  app.quit();
} else {
  // We got the lock, handle second-instance events
  app.on('second-instance', (event, argv, workingDirectory) => {
    log.info('[FileAssoc] second-instance event, argv:', argv);

    // Find .smz file in command line arguments
    const smzFile = argv.find(arg => arg.toLowerCase().endsWith('.smz'));
    if (smzFile) {
      handleOpenFile(smzFile);
    }

    // Focus our window
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });
}

// Window state management
const windowStateFile = path.join(app.getPath('userData'), 'window-state.json');

function loadWindowState() {
  try {
    if (fs.existsSync(windowStateFile)) {
      const data = fs.readFileSync(windowStateFile, 'utf8');
      const state = JSON.parse(data);
      log.info('Loaded window state:', state);
      return state;
    }
  } catch (error) {
    log.error('Error loading window state:', error);
  }
  // Return default state
  return {
    width: 1400,
    height: 900,
    x: undefined,
    y: undefined
  };
}

function saveWindowState() {
  if (!mainWindow) return;

  try {
    const bounds = mainWindow.getBounds();
    const state = {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      isMaximized: mainWindow.isMaximized()
    };
    fs.writeFileSync(windowStateFile, JSON.stringify(state, null, 2));
    log.info('Saved window state:', state);
  } catch (error) {
    log.error('Error saving window state:', error);
  }
}

// Session state management (persists zustand store to file instead of localStorage)
const sessionStateFile = path.join(app.getPath('userData'), 'session-state.json');

function loadSessionState() {
  try {
    if (fs.existsSync(sessionStateFile)) {
      const data = fs.readFileSync(sessionStateFile, 'utf8');
      log.info('[Session] Loaded session state from file');
      return data; // Return raw JSON string
    }
  } catch (error) {
    log.error('[Session] Error loading session state:', error);
  }
  return null;
}

function saveSessionState(jsonString) {
  try {
    fs.writeFileSync(sessionStateFile, jsonString, 'utf8');
    log.info('[Session] Saved session state to file');
  } catch (error) {
    log.error('[Session] Error saving session state:', error);
  }
}

function ensureWindowIsVisible(bounds) {
  // Get all displays
  const displays = screen.getAllDisplays();

  // Check if the window position is within any display
  const isVisible = displays.some(display => {
    const { x, y, width, height } = display.bounds;
    return bounds.x >= x && bounds.x < x + width &&
           bounds.y >= y && bounds.y < y + height;
  });

  if (!isVisible) {
    // Window is off-screen, reset to default position
    log.info('Window position off-screen, resetting to center');
    return { x: undefined, y: undefined };
  }

  // Check if window would be too large for any display
  const fitsInDisplay = displays.some(display => {
    return bounds.width <= display.bounds.width &&
           bounds.height <= display.bounds.height;
  });

  if (!fitsInDisplay) {
    // Window is too large, use default size
    log.info('Window size too large for display, resetting to default');
    return { width: 1400, height: 900, x: undefined, y: undefined };
  }

  return bounds;
}

function createSplashWindow() {
  // Get package.json version
  const packageJson = require('../package.json');
  const version = packageJson.version;

  splashWindow = new BrowserWindow({
    width: 400,
    height: 400,
    frame: false,
    transparent: true,
    resizable: false,
    center: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Load splash HTML with logo embedded as base64
  // Check if running in packaged app (app.isPackaged is more reliable than NODE_ENV)
  const logoPath = app.isPackaged
    ? path.join(process.resourcesPath, 'splash-logo.png')
    : path.join(__dirname, '../src/assets/app-icon.png');
  const splashHtmlPath = path.join(__dirname, 'splash.html');

  log.info('[Splash] app.isPackaged:', app.isPackaged);
  log.info('[Splash] Logo path:', logoPath);
  log.info('[Splash] Logo exists:', fs.existsSync(logoPath));

  // Read logo and convert to base64 data URL
  let logoDataUrl = '';
  try {
    const logoBuffer = fs.readFileSync(logoPath);
    logoDataUrl = `data:image/png;base64,${logoBuffer.toString('base64')}`;
    log.info('[Splash] Logo loaded, base64 length:', logoDataUrl.length);
  } catch (err) {
    log.error('[Splash] Failed to load logo:', err);
  }

  // Read the HTML template and inject the logo and version
  let splashHtml = fs.readFileSync(splashHtmlPath, 'utf8');
  splashHtml = splashHtml.replace('LOGO_PATH', logoDataUrl);
  splashHtml = splashHtml.replace('VERSION_NUMBER', version);

  // Load the modified HTML as a data URL
  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml)}`);

  splashWindow.on('closed', () => {
    splashWindow = null;
  });

  log.info('[Splash] Splash window created');
}

function createWindow() {
  // Load previous window state
  const savedState = loadWindowState();
  const windowState = ensureWindowIsVisible(savedState);

  mainWindow = new BrowserWindow({
    width: windowState.width || 1400,
    height: windowState.height || 900,
    x: windowState.x,
    y: windowState.y,
    minWidth: 1024,
    minHeight: 768,
    backgroundColor: '#1e1e1e',
    title: 'StraboMicro',
    show: false, // Hidden until ready - splash screen shows during load
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Restore maximized state if needed
  if (savedState.isMaximized) {
    mainWindow.maximize();
  }

  // Save window state on resize or move (debounced)
  let saveStateTimeout;
  const debouncedSaveState = () => {
    clearTimeout(saveStateTimeout);
    saveStateTimeout = setTimeout(saveWindowState, 500);
  };

  mainWindow.on('resize', debouncedSaveState);
  mainWindow.on('move', debouncedSaveState);
  mainWindow.on('maximize', saveWindowState);
  mainWindow.on('unmaximize', saveWindowState);

  // Track auth state for menu
  let isLoggedIn = false;

  // Track current project ID for menu
  let currentProjectId = null;

  // Cache for recent projects (to avoid disk reads on every menu build)
  let recentProjectsCache = [];

  /**
   * Format a relative date string (e.g., "Today", "Yesterday", "Nov 25")
   */
  function formatRelativeDate(isoString) {
    if (!isoString) return '';

    const date = new Date(isoString);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    if (dateOnly.getTime() === today.getTime()) {
      return 'Today';
    } else if (dateOnly.getTime() === yesterday.getTime()) {
      return 'Yesterday';
    } else {
      // Format as "Nov 25" or "Nov 25, 2024" if different year
      const options = { month: 'short', day: 'numeric' };
      if (date.getFullYear() !== now.getFullYear()) {
        options.year = 'numeric';
      }
      return date.toLocaleDateString('en-US', options);
    }
  }

  // Function to build menu with current auth state
  async function buildMenu() {
    // Fetch recent projects for submenu
    try {
      recentProjectsCache = await projectsIndex.getRecentProjects(10);
    } catch (error) {
      log.error('[Menu] Error fetching recent projects:', error);
      recentProjectsCache = [];
    }

    // Build Recent Projects submenu items
    const recentProjectsSubmenu = recentProjectsCache.length > 0
      ? [
          ...recentProjectsCache.map((proj) => {
            const isCurrentProject = proj.id === currentProjectId;
            const dateStr = formatRelativeDate(proj.lastOpened);
            const label = dateStr
              ? `${proj.name || 'Untitled Project'}  (${dateStr})`
              : proj.name || 'Untitled Project';

            return {
              label,
              type: isCurrentProject ? 'checkbox' : 'normal',
              checked: isCurrentProject,
              enabled: !isCurrentProject,
              click: () => {
                if (mainWindow && !isCurrentProject) {
                  mainWindow.webContents.send('menu:switch-project', proj.id);
                }
              }
            };
          }),
          { type: 'separator' },
          {
            label: 'Clear Recent Projects',
            click: async () => {
              // Just rebuild index from disk (removes deleted projects)
              await projectsIndex.rebuildIndex();
              buildMenu();
            }
          }
        ]
      : [{ label: 'No Recent Projects', enabled: false }];

    const menuTemplate = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Project',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:new-project');
            }
          }
        },
        {
          label: 'Open Local Project (.smz)',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:open-project');
            }
          }
        },
        {
          label: 'Open Remote Project...',
          accelerator: 'CmdOrCtrl+Shift+O',
          enabled: isLoggedIn,
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:open-remote-project');
            }
          }
        },
        {
          label: 'Open Shared Project...',
          enabled: isLoggedIn,
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:open-shared-project');
            }
          }
        },
        {
          label: 'Recent Projects',
          submenu: recentProjectsSubmenu
        },
        { type: 'separator' },
        {
          label: 'Close Project...',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:close-project');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Save Project',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:save-project');
            }
          }
        },
        {
          label: 'Export as .smz...',
          accelerator: 'CmdOrCtrl+Shift+E',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:export-smz');
            }
          }
        },
        {
          label: 'Upload to Strabo Server...',
          accelerator: 'CmdOrCtrl+Shift+U',
          enabled: isLoggedIn,
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:push-to-server');
            }
          }
        },
        {
          label: 'View Version History...',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:view-version-history');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Edit Project',
          accelerator: 'CmdOrCtrl+E',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:edit-project');
            }
          }
        },
        {
          label: 'Export All Images...',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:export-all-images');
            }
          }
        },
        {
          label: 'Export Project as JSON...',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:export-project-json');
            }
          }
        },
        {
          label: 'Export Project as PDF...',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:export-project-pdf');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Preferences...',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:preferences');
            }
          }
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Undo',
          accelerator: 'CmdOrCtrl+Z',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:undo');
            }
          }
        },
        {
          label: 'Redo',
          accelerator: 'CmdOrCtrl+Shift+Z',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:redo');
            }
          }
        },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Generate Spots...',
          accelerator: 'CmdOrCtrl+Shift+G',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:generate-spots');
            }
          }
        },
        {
          label: 'Clear All Spots...',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:clear-all-spots');
            }
          }
        },
      ],
    },
    {
      label: 'Account',
      submenu: [
        {
          label: 'Login...',
          enabled: !isLoggedIn,
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:login');
            }
          }
        },
        {
          label: 'Logout',
          enabled: isLoggedIn,
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:logout');
            }
          }
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Show Rulers',
          type: 'checkbox',
          checked: true,
          click: (menuItem) => {
            if (mainWindow) {
              mainWindow.webContents.send('view:toggle-rulers', menuItem.checked);
            }
          }
        },
        {
          label: 'Show Spot Labels',
          type: 'checkbox',
          checked: true,
          click: (menuItem) => {
            if (mainWindow) {
              mainWindow.webContents.send('view:toggle-spot-labels', menuItem.checked);
            }
          }
        },
        {
          label: 'Show Overlay Outlines',
          type: 'checkbox',
          checked: true,
          click: (menuItem) => {
            if (mainWindow) {
              mainWindow.webContents.send('view:toggle-overlay-outlines', menuItem.checked);
            }
          }
        },
        {
          label: 'Show Recursive Spots',
          type: 'checkbox',
          checked: false,
          click: (menuItem) => {
            if (mainWindow) {
              mainWindow.webContents.send('view:toggle-recursive-spots', menuItem.checked);
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Theme',
          submenu: [
            {
              label: 'Dark',
              type: 'radio',
              checked: true,
              click: () => {
                if (mainWindow) {
                  mainWindow.webContents.send('theme:set', 'dark');
                }
              }
            },
            {
              label: 'Light',
              type: 'radio',
              click: () => {
                if (mainWindow) {
                  mainWindow.webContents.send('theme:set', 'light');
                }
              }
            },
            {
              label: 'System',
              type: 'radio',
              click: () => {
                if (mainWindow) {
                  mainWindow.webContents.send('theme:set', 'system');
                }
              }
            },
          ],
        },
        // Developer Tools only shown in dev builds (version contains "-dev")
        ...(app.getVersion().includes('-dev') ? [
          { type: 'separator' },
          {
            label: 'Toggle Developer Tools',
            accelerator: 'Alt+CmdOrCtrl+I',
            click: () => {
              if (mainWindow) {
                mainWindow.webContents.toggleDevTools();
              }
            }
          },
        ] : []),
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About StraboMicro',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('help:show-about');
            }
          }
        },
        {
          label: 'StraboMicro User Guide',
          click: async () => {
            await shell.openExternal('https://strabospot.org/manual/micro');
          }
        },
        { type: 'separator' },
        {
          label: 'Check for Updates...',
          click: async () => {
            const version = app.getVersion();
            const isDevBuild = version.includes('-dev.');
            if (isDevBuild) {
              // Show dialog for dev builds explaining updates are manual
              const { dialog } = require('electron');
              dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'Dev Build',
                message: 'Automatic updates are disabled for dev builds.',
                detail: `You are running version ${version}.\n\nTo get the latest dev build, download it from:\nhttps://github.com/jasonash/StraboMicro2/releases/tag/dev-latest`,
                buttons: ['OK', 'Open Downloads Page']
              }).then(({ response }) => {
                if (response === 1) {
                  shell.openExternal('https://github.com/jasonash/StraboMicro2/releases/tag/dev-latest');
                }
              });
            } else if (mainWindow) {
              mainWindow.webContents.send('update:check-manual');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'View Error Logs...',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('help:show-logs');
            }
          }
        },
        {
          label: 'Send Error Report...',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('help:send-error-report');
            }
          }
        },
      ],
    },
    // Debug menu shown in development mode OR dev builds (version contains "-dev.")
    ...((!app.isPackaged || app.getVersion().includes('-dev.')) ? [{
      label: 'Debug',
      submenu: [
        { role: 'reload' },
        {
          label: 'Force Reload',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.reloadIgnoringCache();
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Trigger Test Error (Main Process)',
          click: () => {
            log.info('[Debug] Triggering test error in main process...');
            throw new Error('Test error from main process - triggered via Debug menu');
          }
        },
        {
          label: 'Trigger Test Error (Renderer)',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('debug:trigger-test-error');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Toggle Memory Monitor',
          accelerator: 'CmdOrCtrl+Shift+M',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('debug:toggle-memory-monitor');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Show Project Structure',
          accelerator: 'CmdOrCtrl+Shift+D',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:show-project-debug');
            }
          }
        },
        {
          label: 'Show Serialized JSON (for upload)',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:show-serialized-json');
            }
          }
        },
        {
          label: 'Test Orientation Step',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:test-orientation-step');
            }
          }
        },
        {
          label: 'Test Scale Bar Step',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:test-scale-bar-step');
            }
          }
        },
        {
          label: 'Clear Project',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:clear-project');
            }
          }
        },
        {
          label: 'Quick Load Image to Canvas',
          accelerator: 'CmdOrCtrl+Shift+L',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:quick-load-image');
            }
          }
        },
        {
          label: 'Load Sample Project',
          accelerator: 'CmdOrCtrl+Shift+P',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:load-sample-project');
            }
          }
        },
        {
          label: 'Reset Everything (Clean Test)',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:reset-everything');
            }
          }
        },
        {
          label: 'Rebuild All Thumbnails',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:rebuild-all-thumbnails');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Generate 100 Test Spots',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('debug:generate-test-spots');
            }
          }
        },
        {
          label: 'Clear All Spots on Current Micrograph',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('debug:clear-all-spots');
            }
          }
        },
        { type: 'separator' },
        { role: 'toggleDevTools' },
      ],
    }] : []),
  ];

    const menu = Menu.buildFromTemplate(menuTemplate);
    Menu.setApplicationMenu(menu);
  }

  // Store reference to buildMenu for IPC handlers
  buildMenuFn = buildMenu;

  // Build initial menu
  buildMenu();

  // IPC handler to update auth state and rebuild menu
  ipcMain.on('auth:state-changed', (event, loggedIn) => {
    isLoggedIn = loggedIn;
    buildMenu();
  });

  // IPC handler to update current project and rebuild menu
  ipcMain.on('project:current-changed', (event, projectId) => {
    currentProjectId = projectId;
    buildMenu();
  });

  // Show main window and close splash when ready
  mainWindow.once('ready-to-show', () => {
    log.info('[Main] Main window ready to show');

    // Small delay to ensure the app is fully rendered
    setTimeout(() => {
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.close();
      }
      mainWindow.show();

      // Initialize auto-updater (only in production releases, not dev builds)
      // Dev builds have version like "2.0.0-beta.8-dev.123" - skip auto-update for these
      const appVersion = app.getVersion();
      const isDevBuild = appVersion.includes('-dev.');
      if (app.isPackaged && !isDevBuild) {
        autoUpdaterModule.initAutoUpdater(mainWindow);
        // Check for updates after a short delay (let the app settle first)
        setTimeout(() => {
          log.info('[AutoUpdater] Checking for updates on startup...');
          autoUpdaterModule.checkForUpdates(true); // silent = true
        }, 5000);
      } else if (isDevBuild) {
        log.info('[AutoUpdater] Skipping auto-update for dev build:', appVersion);
      }

      // If window should be maximized, do it after showing
      if (savedState.isMaximized) {
        mainWindow.maximize();
      }

      // Handle pending file from double-click or command line (with slight delay for renderer init)
      setTimeout(() => {
        // Check for pending file from macOS open-file event
        if (pendingFileToOpen) {
          log.info('[FileAssoc] Processing pending file:', pendingFileToOpen);
          mainWindow.webContents.send('file:open-smz', pendingFileToOpen);
          pendingFileToOpen = null;
        }

        // Windows: Check command line arguments on initial launch
        // (macOS uses open-file event instead)
        if (process.platform !== 'darwin') {
          const smzFile = process.argv.find(arg => arg.toLowerCase().endsWith('.smz'));
          if (smzFile && fs.existsSync(smzFile)) {
            log.info('[FileAssoc] Found .smz in command line args:', smzFile);
            mainWindow.webContents.send('file:open-smz', smzFile);
          }
        }
      }, 500);
    }, 500);
  });

  // Load the app - use app.isPackaged which is more reliable than NODE_ENV
  const isDev = !app.isPackaged;

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');

    // Open DevTools automatically in development
    mainWindow.webContents.once('did-finish-load', () => {
      log.info('Page loaded, opening DevTools...');
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Track if we're in the process of closing this window
  let isClosing = false;

  mainWindow.on('close', (event) => {
    // Save final window state before closing
    saveWindowState();

    // If we're already closing (after save completed), allow the close
    if (isClosing) {
      return;
    }

    // Prevent the window from closing immediately
    event.preventDefault();
    isClosing = true;

    // Send message to renderer to save if dirty, then close
    // The renderer will respond with 'app:close-ready' when done
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('app:before-close');

      // Set a timeout to force close if renderer doesn't respond
      // This prevents the app from hanging if something goes wrong
      setTimeout(() => {
        log.warn('[App] Close timeout - forcing window close');
        if (mainWindow) {
          mainWindow.destroy();
        }
      }, 5000);
    } else {
      // No window or webContents, just close
      if (mainWindow) {
        mainWindow.destroy();
      }
    }
  });

  // Listen for close-ready signal from renderer
  const handleCloseReady = () => {
    log.info('[App] Received close-ready signal, destroying window');
    if (mainWindow) {
      mainWindow.destroy();
    }
  };
  ipcMain.on('app:close-ready', handleCloseReady);

  mainWindow.on('closed', () => {
    // Clean up the IPC listener when window is closed
    ipcMain.removeListener('app:close-ready', handleCloseReady);
    mainWindow = null;
  });
}

// Store a reference to buildMenu so we can call it from IPC handlers
let buildMenuFn = null;

app.whenReady().then(async () => {
  const isDev = !app.isPackaged;

  // Initialize log service (persistent logging to file)
  logService.init();

  // Show splash screen immediately
  createSplashWindow();

  // Clean up scratch space on startup
  await scratchSpace.cleanupAll();

  // Rebuild projects index on startup
  log.info('[App] Rebuilding projects index on startup...');
  try {
    await projectsIndex.rebuildIndex();
    log.info('[App] Projects index rebuilt successfully');
  } catch (error) {
    log.error('[App] Error rebuilding projects index:', error);
  }

  // Install React DevTools in development mode
  if (isDev) {
    try {
      const { default: installExtension, REACT_DEVELOPER_TOOLS } = require('electron-devtools-installer');
      const name = await installExtension(REACT_DEVELOPER_TOOLS);
      log.info(`Added DevTools Extension: ${name}`);
    } catch (err) {
      log.error('Failed to install React DevTools:', err);
    }
  }

  createWindow();
});

// Set isQuitting flag when user requests quit (Cmd+Q, menu quit, etc.)
app.on('before-quit', () => {
  log.info('[App] before-quit event - setting isQuitting flag');
  isQuitting = true;
});

app.on('window-all-closed', () => {
  // On macOS, quit if the user explicitly requested it (Cmd+Q)
  // Otherwise, the app stays running (standard macOS behavior)
  if (process.platform !== 'darwin' || isQuitting) {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    // Show splash on reactivation too
    createSplashWindow();
    createWindow();
  }
});

// =============================================================================
// IPC HANDLERS
// =============================================================================

// Auto-updater handlers
ipcMain.handle('update:check', async () => {
  if (!app.isPackaged) {
    return { status: 'dev-mode', message: 'Auto-updates disabled in development mode' };
  }
  await autoUpdaterModule.checkForUpdates(false); // not silent
});

ipcMain.handle('update:download', async () => {
  await autoUpdaterModule.downloadUpdate();
});

ipcMain.handle('update:install', () => {
  autoUpdaterModule.quitAndInstall();
});

ipcMain.handle('update:get-state', () => {
  return autoUpdaterModule.getUpdateState();
});

// Session state persistence (for zustand store)
ipcMain.handle('session:get', () => {
  return loadSessionState();
});

ipcMain.handle('session:set', (event, jsonString) => {
  saveSessionState(jsonString);
});

ipcMain.handle('session:clear', () => {
  saveSessionState(null);
  log.info('[IPC] Session state cleared');
});

// Validate that a project folder exists on disk
ipcMain.handle('project:validate-exists', async (event, projectId) => {
  if (!projectId) {
    return { exists: false, reason: 'No project ID provided' };
  }

  try {
    const exists = await projectFolders.projectFolderExists(projectId);
    if (exists) {
      // Also check if project.json exists
      const paths = projectFolders.getProjectFolderPaths(projectId);
      const fs = require('fs').promises;
      try {
        await fs.access(paths.projectJson);
        return { exists: true };
      } catch {
        return { exists: false, reason: 'Project folder exists but project.json is missing' };
      }
    }
    return { exists: false, reason: 'Project folder not found' };
  } catch (error) {
    log.error('[IPC] Error validating project:', error);
    return { exists: false, reason: error.message };
  }
});

// File dialog for TIFF selection (single file)
ipcMain.handle('dialog:open-tiff', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Micrograph Image',
    filters: [
      { name: 'Image Files', extensions: ['tif', 'tiff', 'jpg', 'jpeg', 'png', 'bmp'] },
      { name: 'TIFF Images', extensions: ['tif', 'tiff'] },
      { name: 'JPEG Images', extensions: ['jpg', 'jpeg'] },
      { name: 'PNG Images', extensions: ['png'] },
      { name: 'BMP Images', extensions: ['bmp'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile']
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

// File dialog for multiple TIFF/image selection (batch import)
ipcMain.handle('dialog:open-multiple-tiff', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Micrograph Images',
    filters: [
      { name: 'Image Files', extensions: ['tif', 'tiff', 'jpg', 'jpeg', 'png', 'bmp'] },
      { name: 'TIFF Images', extensions: ['tif', 'tiff'] },
      { name: 'JPEG Images', extensions: ['jpg', 'jpeg'] },
      { name: 'PNG Images', extensions: ['png'] },
      { name: 'BMP Images', extensions: ['bmp'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile', 'multiSelections']
  });

  if (result.canceled || result.filePaths.length === 0) {
    return [];
  }

  return result.filePaths;
});

// Generic file dialog for associated files (single file)
ipcMain.handle('dialog:open-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select File',
    filters: [
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile']
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

// Multi-file dialog for bulk associated files import
ipcMain.handle('dialog:open-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Files',
    filters: [
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile', 'multiSelections']
  });

  if (result.canceled || result.filePaths.length === 0) {
    return [];
  }

  return result.filePaths;
});

// Open external link in default browser
ipcMain.handle('open-external-link', async (event, url) => {
  try {
    log.info(`[IPC] Opening external link: ${url}`);
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    log.error('[IPC] Error opening external link:', error);
    throw error;
  }
});

// Open file with system default application (like double-clicking in Finder/Explorer)
ipcMain.handle('shell:open-path', async (event, filePath) => {
  try {
    log.info(`[IPC] Opening file with default app: ${filePath}`);
    const result = await shell.openPath(filePath);
    if (result) {
      // openPath returns an error string if it fails, empty string on success
      log.error(`[IPC] Error opening file: ${result}`);
      return { success: false, error: result };
    }
    return { success: true };
  } catch (error) {
    log.error('[IPC] Error opening file:', error);
    throw error;
  }
});

// Export detailed notes to PDF
ipcMain.handle('pdf:export-detailed-notes', async (event, projectData, micrographId, spotId) => {
  try {
    log.info('[IPC] Exporting detailed notes to PDF');

    // Determine entity name for default filename
    let entityName = 'Unknown';
    let entityType = micrographId ? 'Micrograph' : 'Spot';

    if (micrographId) {
      // Find micrograph name
      for (const dataset of projectData.datasets || []) {
        for (const sample of dataset.samples || []) {
          const micrograph = sample.micrographs?.find(m => m.id === micrographId);
          if (micrograph) {
            entityName = micrograph.name || 'Unnamed';
            break;
          }
        }
      }
    }

    // Clean filename (remove invalid characters)
    const cleanName = entityName.replace(/[<>:"/\\|?*]/g, '_');
    const defaultFileName = `${entityType}_${cleanName}_Notes.pdf`;

    // Show save dialog
    const result = await dialog.showSaveDialog({
      title: 'Export Detailed Notes to PDF',
      defaultPath: defaultFileName,
      filters: [
        { name: 'PDF Files', extensions: ['pdf'] }
      ]
    });

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true };
    }

    // Generate PDF
    await pdfExport.generateDetailedNotesPDF(
      result.filePath,
      projectData,
      micrographId,
      spotId
    );

    log.info(`[IPC] PDF exported successfully to: ${result.filePath}`);
    return { success: true, filePath: result.filePath };

  } catch (error) {
    log.error('[IPC] Error exporting PDF:', error);
    throw error;
  }
});

// Download micrograph image to user's chosen location
ipcMain.handle('micrograph:download', async (event, imagePath, suggestedName) => {
  try {
    log.info(`[IPC] Download micrograph: ${imagePath}`);

    // Get the file extension from the source file
    const ext = path.extname(imagePath).toLowerCase() || '.jpg';
    const cleanName = (suggestedName || 'micrograph').replace(/[<>:"/\\|?*]/g, '_');
    const defaultFileName = `${cleanName}${ext}`;

    // Show save dialog
    const result = await dialog.showSaveDialog({
      title: 'Download Micrograph',
      defaultPath: defaultFileName,
      filters: [
        { name: 'Image Files', extensions: ['jpg', 'jpeg', 'png', 'tif', 'tiff'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true };
    }

    // Copy the file to the chosen location
    const fs = require('fs').promises;
    await fs.copyFile(imagePath, result.filePath);

    log.info(`[IPC] Micrograph downloaded to: ${result.filePath}`);
    return { success: true, filePath: result.filePath };

  } catch (error) {
    log.error('[IPC] Error downloading micrograph:', error);
    throw error;
  }
});

/**
 * Export composite micrograph image with overlays, spots, and labels
 *
 * Creates a full-resolution image with:
 * - Base micrograph
 * - All child micrographs (associated images) overlaid in correct positions
 * - Spots (points, lines, polygons) with their colors and opacity
 * - Labels with black semi-transparent background boxes and white text
 *
 * @param {string} projectId - Project ID
 * @param {string} micrographId - Micrograph ID to export
 * @param {object} projectData - Current project data from renderer
 * @param {object} options - Export options
 * @param {boolean} options.includeSpots - Include spot shapes (default: true)
 * @param {boolean} options.includeLabels - Include spot labels (default: true)
 */
ipcMain.handle('micrograph:export-composite', async (event, projectId, micrographId, projectData, options = {}) => {
  try {
    log.info(`[IPC] Exporting composite micrograph: ${micrographId}`);

    const includeSpots = options.includeSpots !== false;
    const includeLabels = options.includeLabels !== false;

    // Get project folder paths
    const folderPaths = await projectFolders.getProjectFolderPaths(projectId);

    // Find the micrograph in the project hierarchy
    let micrograph = null;
    let childMicrographs = [];

    for (const dataset of projectData.datasets || []) {
      for (const sample of dataset.samples || []) {
        for (const micro of sample.micrographs || []) {
          if (micro.id === micrographId) {
            micrograph = micro;
            childMicrographs = (sample.micrographs || []).filter(
              m => m.parentID === micrographId
            );
            break;
          }
        }
        if (micrograph) break;
      }
      if (micrograph) break;
    }

    if (!micrograph) {
      throw new Error(`Micrograph ${micrographId} not found in project`);
    }

    // Load base micrograph image
    const basePath = path.join(folderPaths.images, micrograph.imagePath);
    log.info(`[IPC] Loading base image: ${basePath}`);

    let baseImage = sharp(basePath);
    const baseMetadata = await baseImage.metadata();
    const baseWidth = baseMetadata.width;
    const baseHeight = baseMetadata.height;

    log.info(`[IPC] Base image dimensions: ${baseWidth}x${baseHeight}`);

    // Build composite layers for child micrographs
    const compositeInputs = [];

    for (const child of childMicrographs) {
      try {
        // Skip point-located micrographs
        if (child.pointInParent) {
          log.info(`[IPC] Skipping point-located child ${child.id}`);
          continue;
        }

        // Skip children that haven't been located yet (no position data)
        // This prevents loading ALL child images when only some have position data
        if (!child.offsetInParent && child.xOffset === undefined) {
          log.info(`[IPC] Skipping unlocated child ${child.id} (${child.name}) - no position data yet`);
          continue;
        }

        const childPath = path.join(folderPaths.images, child.imagePath);
        let childImage = sharp(childPath);
        const childMetadata = await childImage.metadata();

        // Use stored dimensions
        const childImageWidth = child.imageWidth || childMetadata.width;
        const childImageHeight = child.imageHeight || childMetadata.height;

        // Calculate display scale based on pixels per centimeter
        const childPxPerCm = child.scalePixelsPerCentimeter || 100;
        const parentPxPerCm = micrograph.scalePixelsPerCentimeter || 100;
        const displayScale = parentPxPerCm / childPxPerCm;

        // Calculate child dimensions in parent's coordinate space
        const childDisplayWidth = Math.round(childImageWidth * displayScale);
        const childDisplayHeight = Math.round(childImageHeight * displayScale);

        // Get child position (ensure integers for Sharp)
        let topLeftX = 0, topLeftY = 0;
        if (child.offsetInParent) {
          topLeftX = Math.round(child.offsetInParent.X);
          topLeftY = Math.round(child.offsetInParent.Y);
        } else if (child.xOffset !== undefined && child.yOffset !== undefined) {
          topLeftX = Math.round(child.xOffset);
          topLeftY = Math.round(child.yOffset);
        }

        // Resize child image to display dimensions
        childImage = childImage.resize(childDisplayWidth, childDisplayHeight, {
          fit: 'fill',
          kernel: sharp.kernel.lanczos3
        });

        // Apply opacity
        const childOpacity = child.opacity ?? 1.0;
        childImage = childImage.ensureAlpha();

        if (childOpacity < 1.0) {
          const { data, info } = await childImage.raw().toBuffer({ resolveWithObject: true });
          for (let i = 3; i < data.length; i += 4) {
            data[i] = Math.round(data[i] * childOpacity);
          }
          childImage = sharp(data, {
            raw: { width: info.width, height: info.height, channels: info.channels }
          });
        }

        // Apply rotation if needed
        let finalX = topLeftX, finalY = topLeftY, finalBuffer;
        if (child.rotation) {
          const centerX = topLeftX + childDisplayWidth / 2;
          const centerY = topLeftY + childDisplayHeight / 2;

          childImage = childImage.rotate(child.rotation, {
            background: { r: 0, g: 0, b: 0, alpha: 0 }
          });

          const radians = (child.rotation * Math.PI) / 180;
          const cos = Math.abs(Math.cos(radians));
          const sin = Math.abs(Math.sin(radians));
          const rotatedWidth = childDisplayWidth * cos + childDisplayHeight * sin;
          const rotatedHeight = childDisplayWidth * sin + childDisplayHeight * cos;

          finalX = Math.round(centerX - rotatedWidth / 2);
          finalY = Math.round(centerY - rotatedHeight / 2);
          finalBuffer = await childImage.png().toBuffer();
        } else {
          finalBuffer = await childImage.png().toBuffer();
        }

        // Bounds checking and cropping (similar to thumbnail generator)
        const childBufferMeta = await sharp(finalBuffer).metadata();
        const childW = childBufferMeta.width;
        const childH = childBufferMeta.height;

        if (finalX + childW <= 0 || finalY + childH <= 0 || finalX >= baseWidth || finalY >= baseHeight) {
          continue;
        }

        let cropX = 0, cropY = 0, cropW = childW, cropH = childH;
        let compositeX = finalX, compositeY = finalY;

        if (finalX < 0) { cropX = -finalX; cropW -= cropX; compositeX = 0; }
        if (finalY < 0) { cropY = -finalY; cropH -= cropY; compositeY = 0; }
        if (compositeX + cropW > baseWidth) { cropW = baseWidth - compositeX; }
        if (compositeY + cropH > baseHeight) { cropH = baseHeight - compositeY; }

        if (cropW <= 0 || cropH <= 0) continue;

        // Ensure all values are integers for Sharp
        cropX = Math.round(cropX);
        cropY = Math.round(cropY);
        cropW = Math.round(cropW);
        cropH = Math.round(cropH);
        compositeX = Math.round(compositeX);
        compositeY = Math.round(compositeY);

        let compositeBuffer = finalBuffer;
        if (cropX > 0 || cropY > 0 || cropW !== childW || cropH !== childH) {
          compositeBuffer = await sharp(finalBuffer)
            .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
            .toBuffer();
        }

        compositeInputs.push({ input: compositeBuffer, left: compositeX, top: compositeY });
      } catch (error) {
        log.error(`[IPC] Failed to composite child ${child.id}:`, error);
      }
    }

    // Generate SVG overlay for spots and labels
    if ((includeSpots || includeLabels) && micrograph.spots && micrograph.spots.length > 0) {
      // Calculate size multiplier based on image dimensions
      // Base reference: 1000px image = multiplier of 1.0
      // This scales spots/labels proportionally for larger/smaller images
      const longestSide = Math.max(baseWidth, baseHeight);
      const sizeMultiplier = longestSide / 1000;

      log.info(`[IPC] Image size: ${baseWidth}x${baseHeight}, longest side: ${longestSide}, size multiplier: ${sizeMultiplier.toFixed(2)}`);

      // Base sizes (for a ~1000px image)
      const basePointRadius = 6;
      const basePointStrokeWidth = 2;
      const baseLineStrokeWidth = 3;
      const baseFontSize = 16;
      const basePadding = 4;
      const baseOffset = 8;
      const baseCornerRadius = 3;

      // Scaled sizes
      const pointRadius = Math.round(basePointRadius * sizeMultiplier);
      const pointStrokeWidth = Math.round(basePointStrokeWidth * sizeMultiplier);
      const lineStrokeWidth = Math.round(baseLineStrokeWidth * sizeMultiplier);
      const fontSize = Math.round(baseFontSize * sizeMultiplier);
      const padding = Math.round(basePadding * sizeMultiplier);
      const labelOffset = Math.round(baseOffset * sizeMultiplier);
      const cornerRadius = Math.round(baseCornerRadius * sizeMultiplier);
      const charWidth = 8.5 * sizeMultiplier; // Approximate character width

      const svgParts = [];
      svgParts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${baseWidth}" height="${baseHeight}">`);
      svgParts.push('<defs><style>text { font-family: Arial, sans-serif; font-weight: bold; }</style></defs>');

      for (const spot of micrograph.spots) {
        const geometryType = spot.geometryType || spot.geometry?.type;
        const color = convertColor(spot.color || '#00ff00');
        const labelColor = convertColor(spot.labelColor || '#ffffff');
        const opacity = (spot.opacity ?? 50) / 100;
        const showLabel = spot.showLabel !== false;

        if (includeSpots) {
          // Render spot shape
          if (geometryType === 'point' || geometryType === 'Point') {
            const x = Array.isArray(spot.geometry?.coordinates)
              ? spot.geometry.coordinates[0]
              : spot.points?.[0]?.X ?? 0;
            const y = Array.isArray(spot.geometry?.coordinates)
              ? spot.geometry.coordinates[1]
              : spot.points?.[0]?.Y ?? 0;

            // White outline circle (scaled)
            svgParts.push(`<circle cx="${x}" cy="${y}" r="${pointRadius}" fill="${color}" stroke="#ffffff" stroke-width="${pointStrokeWidth}"/>`);

          } else if (geometryType === 'line' || geometryType === 'LineString') {
            const coords = Array.isArray(spot.geometry?.coordinates)
              ? spot.geometry.coordinates
              : spot.points?.map(p => [p.X ?? 0, p.Y ?? 0]) || [];

            if (coords.length >= 2) {
              const pathData = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c[0]},${c[1]}`).join(' ');
              svgParts.push(`<path d="${pathData}" fill="none" stroke="${color}" stroke-width="${lineStrokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`);
            }

          } else if (geometryType === 'polygon' || geometryType === 'Polygon') {
            const coords = Array.isArray(spot.geometry?.coordinates)
              ? (spot.geometry.coordinates[0] || [])
              : spot.points?.map(p => [p.X ?? 0, p.Y ?? 0]) || [];

            if (coords.length >= 3) {
              const pointsStr = coords.map(c => `${c[0]},${c[1]}`).join(' ');
              svgParts.push(`<polygon points="${pointsStr}" fill="${color}" fill-opacity="${opacity}" stroke="${color}" stroke-width="${lineStrokeWidth}"/>`);
            }
          }
        }

        // Render label
        if (includeLabels && showLabel && spot.name) {
          let labelX = 0, labelY = 0;

          if (geometryType === 'point' || geometryType === 'Point') {
            labelX = (Array.isArray(spot.geometry?.coordinates) ? spot.geometry.coordinates[0] : spot.points?.[0]?.X) || 0;
            labelY = (Array.isArray(spot.geometry?.coordinates) ? spot.geometry.coordinates[1] : spot.points?.[0]?.Y) || 0;
          } else {
            const coords = Array.isArray(spot.geometry?.coordinates)
              ? (spot.geometry.coordinates[0] || spot.geometry.coordinates)
              : spot.points?.map(p => [p.X ?? 0, p.Y ?? 0]) || [];
            if (coords[0]) {
              labelX = coords[0][0] || coords[0];
              labelY = coords[0][1] || coords[1];
            }
          }

          // Label dimensions (scaled)
          const labelWidth = spot.name.length * charWidth + padding * 2;
          const labelHeight = fontSize + padding * 2;

          // Black semi-transparent background box
          svgParts.push(`<rect x="${labelX + labelOffset}" y="${labelY + labelOffset}" width="${labelWidth}" height="${labelHeight}" rx="${cornerRadius}" fill="#000000" fill-opacity="0.7"/>`);
          // White label text
          svgParts.push(`<text x="${labelX + labelOffset + padding}" y="${labelY + labelOffset + fontSize + padding/2}" font-size="${fontSize}" fill="${labelColor}">${escapeXml(spot.name)}</text>`);
        }
      }

      svgParts.push('</svg>');

      const svgOverlay = Buffer.from(svgParts.join('\n'));
      compositeInputs.push({ input: svgOverlay, left: 0, top: 0 });
    }

    // Apply all composites
    let finalImage;
    if (compositeInputs.length > 0) {
      finalImage = baseImage.composite(compositeInputs);
    } else {
      finalImage = baseImage;
    }

    // Show save dialog
    const cleanName = (micrograph.name || 'micrograph').replace(/[<>:"/\\|?*]/g, '_');
    const result = await dialog.showSaveDialog({
      title: 'Export Composite Micrograph',
      defaultPath: `${cleanName}_composite.jpg`,
      filters: [
        { name: 'JPEG Image', extensions: ['jpg', 'jpeg'] },
        // { name: 'PNG Image', extensions: ['png'] }, // Commented out for now - may re-enable later
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true };
    }

    // Save based on extension
    const ext = path.extname(result.filePath).toLowerCase();
    if (ext === '.png') {
      // PNG support kept for manual use via "All Files" filter
      await finalImage.png().toFile(result.filePath);
    } else {
      // Default to JPEG
      await finalImage.jpeg({ quality: 95 }).toFile(result.filePath);
    }

    log.info(`[IPC] Composite micrograph exported to: ${result.filePath}`);
    return { success: true, filePath: result.filePath };

  } catch (error) {
    log.error('[IPC] Error exporting composite micrograph:', error);
    throw error;
  }
});

// Export micrograph as SVG with vector spots
ipcMain.handle('micrograph:export-svg', async (event, projectId, micrographId, projectData) => {
  try {
    log.info(`[IPC] Exporting micrograph as SVG: ${micrographId}`);

    // Get project folder paths
    const folderPaths = await projectFolders.getProjectFolderPaths(projectId);

    // Find the micrograph to get its name
    let micrographName = 'micrograph';
    for (const dataset of projectData.datasets || []) {
      for (const sample of dataset.samples || []) {
        for (const micro of sample.micrographs || []) {
          if (micro.id === micrographId) {
            micrographName = micro.name || 'micrograph';
            break;
          }
        }
      }
    }

    // Generate SVG
    const { svg } = await svgExport.exportMicrographAsSvg(
      projectId,
      micrographId,
      projectData,
      folderPaths
    );

    // Show save dialog
    const cleanName = micrographName.replace(/[<>:"/\\|?*]/g, '_');
    const result = await dialog.showSaveDialog({
      title: 'Export Micrograph as SVG',
      defaultPath: `${cleanName}_composite.svg`,
      filters: [
        { name: 'SVG Image', extensions: ['svg'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true };
    }

    // Write SVG file
    await fs.promises.writeFile(result.filePath, svg, 'utf8');

    log.info(`[IPC] SVG exported to: ${result.filePath}`);
    return { success: true, filePath: result.filePath };

  } catch (error) {
    log.error('[IPC] Error exporting SVG:', error);
    throw error;
  }
});

/**
 * Helper: Convert legacy color format (0xRRGGBBAA) to web format (#RRGGBB)
 */
function convertColor(color) {
  if (!color) return '#00ff00';
  if (color.startsWith('#')) return color;
  if (color.startsWith('0x')) {
    const hex = color.slice(2);
    const rgb = hex.slice(0, 6);
    return '#' + rgb;
  }
  return color;
}

/**
 * Helper: Escape XML special characters for SVG
 */
function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Image loading (supports TIFF, JPEG, PNG, BMP) - dimensions only for performance
ipcMain.handle('load-tiff-image', async (event, filePath) => {
  try {
    log.info(`Loading image metadata: ${filePath}`);

    const fileExt = path.extname(filePath).toLowerCase();
    let width;
    let height;

    // Check if it's a TIFF file (requires special decoding)
    if (fileExt === '.tif' || fileExt === '.tiff') {
      // Dynamic import of ES Module
      const { decode } = await import('tiff');

      // Read and decode TIFF file (header only for dimensions)
      const tiffData = fs.readFileSync(filePath);
      const images = decode(tiffData);

      if (!images || images.length === 0) {
        throw new Error('No images found in TIFF file');
      }

      const image = images[0]; // Use first image
      width = image.width;
      height = image.height;

      log.info(`TIFF dimensions: ${width}x${height}`);
    } else {
      // For JPEG, PNG, BMP - use canvas loadImage to get dimensions
      const { loadImage } = require('canvas');
      const img = await loadImage(filePath);
      width = img.width;
      height = img.height;

      log.info(`Image dimensions: ${width}x${height}`);
    }

    return {
      width: width,
      height: height,
      filePath: filePath,
      fileName: path.basename(filePath)
    };
  } catch (error) {
    log.error('Error loading image metadata:', error);
    throw error;
  }
});

// Load image as base64 data URL for preview
// size: 'thumbnail' (max 512px), 'medium' (max 2048px), or 'full' (original resolution)
ipcMain.handle('load-image-preview', async (event, filePath, size = 'thumbnail') => {
  try {
    log.info(`Loading image preview: ${filePath}, size: ${size}`);
    const ext = path.extname(filePath).toLowerCase();

    // For TIFF files, decode using the tiff library and convert to PNG
    if (ext === '.tif' || ext === '.tiff') {
      const { decode } = await import('tiff');
      const { createCanvas } = require('canvas');

      const tiffData = fs.readFileSync(filePath);
      const images = decode(tiffData);

      if (!images || images.length === 0) {
        throw new Error('No images found in TIFF file');
      }

      const image = images[0]; // Use first image

      // Determine bytes per pixel to identify the format
      const bytesPerPixel = image.data.length / (image.width * image.height);
      log.info(`TIFF decoded: ${image.width}x${image.height}, ${image.data.length} bytes, ${bytesPerPixel} bytes/pixel`);

      const sourceData = new Uint8Array(image.data);
      let rgbaData;

      if (bytesPerPixel === 3) {
        // RGB format - need to convert to RGBA
        log.info('Converting RGB to RGBA');
        const pixelCount = image.width * image.height;
        rgbaData = new Uint8ClampedArray(pixelCount * 4);

        for (let i = 0, j = 0; i < sourceData.length; i += 3, j += 4) {
          rgbaData[j] = sourceData[i];         // R
          rgbaData[j + 1] = sourceData[i + 1]; // G
          rgbaData[j + 2] = sourceData[i + 2]; // B
          rgbaData[j + 3] = 255;               // A (fully opaque)
        }
      } else if (bytesPerPixel === 4) {
        // Already RGBA format
        log.info('Already RGBA format');
        rgbaData = new Uint8ClampedArray(sourceData);
      } else {
        throw new Error(`Unsupported TIFF format: ${bytesPerPixel} bytes per pixel`);
      }

      // Determine final canvas dimensions based on size parameter
      let finalWidth = image.width;
      let finalHeight = image.height;

      if (size === 'thumbnail') {
        // Downsample to max 512px on longest edge
        const maxDimension = 512;
        const scale = Math.min(maxDimension / image.width, maxDimension / image.height, 1);
        finalWidth = Math.floor(image.width * scale);
        finalHeight = Math.floor(image.height * scale);
        log.info(`Downsampling from ${image.width}x${image.height} to ${finalWidth}x${finalHeight}`);
      } else if (size === 'medium') {
        // Downsample to max 2048px on longest edge (good for scale bar drawing)
        const maxDimension = 2048;
        const scale = Math.min(maxDimension / image.width, maxDimension / image.height, 1);
        finalWidth = Math.floor(image.width * scale);
        finalHeight = Math.floor(image.height * scale);
        log.info(`Downsampling from ${image.width}x${image.height} to ${finalWidth}x${finalHeight}`);
      }

      // Create canvas with original size first to render RGBA data
      const tempCanvas = createCanvas(image.width, image.height);
      const tempCtx = tempCanvas.getContext('2d');
      const imageData = tempCtx.createImageData(image.width, image.height);
      imageData.data.set(rgbaData);
      tempCtx.putImageData(imageData, 0, 0);

      // If thumbnail mode and needs downsampling, create a smaller canvas
      let finalCanvas = tempCanvas;
      if (size === 'thumbnail' && (finalWidth !== image.width || finalHeight !== image.height)) {
        finalCanvas = createCanvas(finalWidth, finalHeight);
        const finalCtx = finalCanvas.getContext('2d');
        // Use high-quality downsampling
        finalCtx.imageSmoothingEnabled = true;
        finalCtx.imageSmoothingQuality = 'high';
        finalCtx.drawImage(tempCanvas, 0, 0, finalWidth, finalHeight);
      }

      // Convert to PNG data URL
      const pngDataUrl = finalCanvas.toDataURL('image/png');
      return pngDataUrl;
    }

    // For other formats (JPEG, PNG, BMP), read directly
    const imageBuffer = fs.readFileSync(filePath);
    let mimeType = 'image/png';

    if (ext === '.jpg' || ext === '.jpeg') {
      mimeType = 'image/jpeg';
    } else if (ext === '.bmp') {
      mimeType = 'image/bmp';
    }

    const base64 = imageBuffer.toString('base64');
    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    log.error('Error loading image preview:', error);
    throw error;
  }
});

// Window title update
ipcMain.on('set-window-title', (event, title) => {
  if (mainWindow) {
    mainWindow.setTitle(title);
    log.info(`Window title set to: ${title}`);
  }
});

// Theme change handler - log theme changes (no nativeTheme sync)
ipcMain.on('theme:changed', (event, theme) => {
  // Note: We don't sync nativeTheme to keep the native window chrome unchanged
  log.info(`App theme changed to: ${theme}`);
});

// ========== Tile-Based Image Loading System ==========
// Import tile cache, generator, and queue
const tileCache = require('./tileCache');
const tileGenerator = require('./tileGenerator');
const tileQueue = require('./tileQueue');

/**
 * Load and process an image with tiling support
 * Returns image hash and metadata for tile requests
 */
ipcMain.handle('image:load-with-tiles', async (event, imagePath) => {
  try {
    log.info(`Loading image with tiles: ${imagePath}`);

    // Process the image (checks cache, generates thumbnails if needed)
    // This is memory-efficient and won't crash on large images
    log.info('Processing image (cache check and thumbnail generation)...');
    const result = await tileGenerator.processImage(imagePath);

    log.info(`Image loaded successfully: ${result.metadata.width}x${result.metadata.height}`);
    return result;
  } catch (error) {
    log.error('Error loading image with tiles:', error);
    throw error;
  }
});

/**
 * Load thumbnail for quick preview (512x512 max)
 */
ipcMain.handle('image:load-thumbnail', async (event, imageHash) => {
  try {
    const buffer = await tileCache.loadThumbnail(imageHash);

    if (!buffer) {
      throw new Error(`Thumbnail not found for hash: ${imageHash}`);
    }

    // Convert to base64 data URL
    const base64 = buffer.toString('base64');
    return `data:image/jpeg;base64,${base64}`;
  } catch (error) {
    log.error('Error loading thumbnail:', error);
    throw error;
  }
});

/**
 * Load medium resolution image (2048x2048 max)
 * Generates on-demand if not cached, falls back to thumbnail for small images
 */
ipcMain.handle('image:load-medium', async (event, imageHash) => {
  try {
    // Try to load from cache first
    let buffer = await tileCache.loadMedium(imageHash);

    // If not in cache, try to generate or fall back to thumbnail
    if (!buffer) {
      log.info(`[IPC] Medium resolution not cached for ${imageHash}`);

      // Get the original image path from metadata
      const metadata = await tileCache.loadMetadata(imageHash);
      if (!metadata || !metadata.originalPath) {
        throw new Error(`Cannot generate medium resolution: no metadata found for hash ${imageHash}`);
      }

      // Check if image is small (no medium needed - use thumbnail or original)
      if (metadata.width <= 2048 && metadata.height <= 2048) {
        log.info(`[IPC] Image is small (${metadata.width}x${metadata.height}), using thumbnail as medium`);
        buffer = await tileCache.loadThumbnail(imageHash);

        // If still no thumbnail, generate it
        if (!buffer) {
          const tileGenerator = require('./tileGenerator');
          buffer = await tileGenerator.generateThumbnail(metadata.originalPath);
          await tileCache.saveThumbnail(imageHash, buffer);
        }
      } else {
        // Generate medium resolution for larger images
        log.info(`[IPC] Generating medium resolution for large image...`);
        const tileGenerator = require('./tileGenerator');
        buffer = await tileGenerator.generateMedium(metadata.originalPath);

        // Cache it for next time
        await tileCache.saveMedium(imageHash, buffer);
        log.info(`[IPC] Generated and cached medium resolution`);
      }
    }

    // Convert to base64 data URL
    const base64 = buffer.toString('base64');
    return `data:image/jpeg;base64,${base64}`;
  } catch (error) {
    log.error('Error loading medium resolution:', error);
    throw error;
  }
});

/**
 * Load a single tile
 */
ipcMain.handle('image:load-tile', async (event, imageHash, tileX, tileY) => {
  try {
    let buffer = await tileCache.loadTile(imageHash, tileX, tileY);

    // If tile not cached, generate it on-demand
    if (!buffer) {
      log.info(`Generating tile on-demand: ${tileX}, ${tileY}`);

      // Load metadata to get original image info
      const metadata = await tileCache.loadMetadata(imageHash);
      if (!metadata) {
        throw new Error(`Metadata not found for hash: ${imageHash}`);
      }

      // Decode the original image
      const imageData = await tileGenerator.decodeAuto(metadata.originalPath);

      // Generate the tile
      buffer = await tileGenerator.generateTile(imageHash, imageData, tileX, tileY);
    }

    // Convert to base64 data URL
    const base64 = buffer.toString('base64');
    return `data:image/webp;base64,${base64}`;
  } catch (error) {
    log.error(`Error loading tile (${tileX}, ${tileY}):`, error);
    throw error;
  }
});

/**
 * Load multiple tiles in batch
 */
ipcMain.handle('image:load-tiles-batch', async (event, imageHash, tiles) => {
  try {
    const results = [];

    // Load metadata once
    const metadata = await tileCache.loadMetadata(imageHash);
    if (!metadata) {
      throw new Error(`Metadata not found for hash: ${imageHash}`);
    }

    // Decode image data once (only if needed)
    let imageData = null;

    for (const { x, y } of tiles) {
      let buffer = await tileCache.loadTile(imageHash, x, y);

      // Generate on-demand if not cached
      if (!buffer) {
        if (!imageData) {
          imageData = await tileGenerator.decodeAuto(metadata.originalPath);
        }
        buffer = await tileGenerator.generateTile(imageHash, imageData, x, y);
      }

      const base64 = buffer.toString('base64');
      results.push({
        x,
        y,
        dataUrl: `data:image/webp;base64,${base64}`,
      });
    }

    return results;
  } catch (error) {
    log.error('Error loading tiles batch:', error);
    throw error;
  }
});

/**
 * Get cache statistics
 */
ipcMain.handle('image:cache-stats', async () => {
  try {
    return await tileCache.getCacheStats();
  } catch (error) {
    log.error('Error getting cache stats:', error);
    throw error;
  }
});

/**
 * Clear cache for a specific image
 */
ipcMain.handle('image:clear-cache', async (event, imageHash) => {
  try {
    await tileCache.clearImageCache(imageHash);
    log.info(`Cleared cache for image: ${imageHash}`);
    return { success: true };
  } catch (error) {
    log.error('Error clearing image cache:', error);
    throw error;
  }
});

/**
 * Clear all caches
 */
ipcMain.handle('image:clear-all-caches', async () => {
  try {
    log.info('=== Clearing all tile caches ===');

    // Get stats before clearing
    const statsBefore = await tileCache.getCacheStats();
    log.info('Cache stats before clear:', statsBefore);

    // Clear the cache
    await tileCache.clearAllCaches();

    // Get stats after clearing
    const statsAfter = await tileCache.getCacheStats();
    log.info('Cache stats after clear:', statsAfter);

    log.info('=== All caches cleared successfully ===');
    return { success: true, before: statsBefore, after: statsAfter };
  } catch (error) {
    log.error('Error clearing all caches:', error);
    throw error;
  }
});

/**
 * Release memory in the main process
 * Call this between batch operations to prevent OOM crashes
 * Clears Sharp/libvips cache and suggests garbage collection
 *
 * NOTE: libvips/glibc memory fragmentation means RSS may stay elevated
 * even after clearing caches. This is expected behavior - the memory
 * is marked as free in the allocator but not returned to the OS.
 */
ipcMain.handle('image:release-memory', async () => {
  try {
    log.info('[Memory] Releasing Sharp cache...');

    // Completely disable Sharp's cache to force libvips to release resources
    // Keep it disabled to prevent memory accumulation
    sharp.cache(false);
    sharp.cache({ memory: 0, files: 0, items: 0 });

    // Also limit concurrency to reduce memory pressure
    sharp.concurrency(1);

    // Small delay to allow libvips to process the cache clear
    await new Promise(resolve => setTimeout(resolve, 50));

    // Suggest garbage collection (won't force it, but helps with JS heap)
    if (global.gc) {
      global.gc();
      log.info('[Memory] Manual GC triggered');
    }

    return { success: true };
  } catch (error) {
    log.error('[Memory] Error releasing memory:', error);
    // Don't throw - this is best-effort
    return { success: false, error: error.message };
  }
});

// ========== Tile Queue and Project Preparation ==========

/**
 * Prepare all images in a project (generate thumbnails + medium)
 * This is called when loading a project to ensure fast browsing
 */
ipcMain.handle('project:prepare-images', async (event, images) => {
  try {
    log.info(`[TileQueue] Preparing ${images.length} images for project...`);

    // Set up progress reporting to renderer
    const progressHandler = (progress) => {
      // Send progress to renderer
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('tile-queue:progress', progress);
      }
    };

    const preparationStartHandler = (data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('tile-queue:preparation-start', data);
      }
    };

    const preparationCompleteHandler = (data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('tile-queue:preparation-complete', data);
      }
    };

    const tileProgressHandler = (data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('tile-queue:tile-progress', data);
      }
    };

    // Listen for progress events
    tileQueue.on('progress', progressHandler);
    tileQueue.on('preparationStart', preparationStartHandler);
    tileQueue.on('preparationComplete', preparationCompleteHandler);
    tileQueue.on('tileProgress', tileProgressHandler);

    try {
      // Run preparation
      const result = await tileQueue.prepareProject(images);
      log.info(`[TileQueue] Preparation complete: ${result.prepared} generated, ${result.cached} cached, ${result.total} total`);
      return result;
    } finally {
      // Clean up listeners
      tileQueue.off('progress', progressHandler);
      tileQueue.off('preparationStart', preparationStartHandler);
      tileQueue.off('preparationComplete', preparationCompleteHandler);
      tileQueue.off('tileProgress', tileProgressHandler);
    }
  } catch (error) {
    log.error('[TileQueue] Error preparing project images:', error);
    throw error;
  }
});

/**
 * Get tile queue status
 */
ipcMain.handle('tile-queue:status', async () => {
  try {
    return tileQueue.getStatus();
  } catch (error) {
    log.error('[TileQueue] Error getting queue status:', error);
    throw error;
  }
});

/**
 * Boost priority of an image in the queue
 * Used when user selects a new micrograph
 */
ipcMain.handle('tile-queue:boost-priority', async (event, imageHash) => {
  try {
    tileQueue.boostPriority(imageHash);
    return { success: true };
  } catch (error) {
    log.error('[TileQueue] Error boosting priority:', error);
    throw error;
  }
});

/**
 * Cancel pending requests for an image
 * Used when user navigates away
 */
ipcMain.handle('tile-queue:cancel', async (event, imageHash) => {
  try {
    tileQueue.cancelForImage(imageHash);
    return { success: true };
  } catch (error) {
    log.error('[TileQueue] Error cancelling requests:', error);
    throw error;
  }
});

/**
 * Check if an image is FULLY cached (metadata + all tiles)
 * Used to quickly check cache status before deciding whether to show prep dialog
 */
ipcMain.handle('image:check-cache', async (event, imagePath) => {
  try {
    const cacheStatus = await tileCache.isCacheValid(imagePath);

    if (!cacheStatus.exists) {
      return { cached: false, hash: null, metadata: null };
    }

    // Metadata exists - now check if ALL tiles are cached
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

    return {
      cached: allTilesCached,
      hash: cacheStatus.hash,
      metadata: cacheStatus.metadata,
    };
  } catch (error) {
    log.error('[TileCache] Error checking cache:', error);
    return { cached: false, hash: null, metadata: null };
  }
});

/**
 * ============================================================================
 * PROJECT FOLDER STRUCTURE HANDLERS
 * ============================================================================
 */

/**
 * Get the path to the StraboMicro2Data root directory
 */
ipcMain.handle('project:get-data-path', async () => {
  try {
    const dataPath = projectFolders.getStraboMicro2DataPath();
    log.info('[IPC] StraboMicro2Data path:', dataPath);
    return dataPath;
  } catch (error) {
    log.error('[IPC] Error getting data path:', error);
    throw error;
  }
});

/**
 * Ensure the StraboMicro2Data directory exists
 */
ipcMain.handle('project:ensure-data-dir', async () => {
  try {
    const dataPath = await projectFolders.ensureStraboMicro2DataDir();
    log.info('[IPC] Ensured StraboMicro2Data directory exists:', dataPath);
    return dataPath;
  } catch (error) {
    log.error('[IPC] Error ensuring data directory:', error);
    throw error;
  }
});

/**
 * Create complete folder structure for a new project
 */
ipcMain.handle('project:create-folders', async (event, projectId) => {
  try {
    log.info(`[IPC] Creating project folders for: ${projectId}`);
    const folderPaths = await projectFolders.createProjectFolders(projectId);
    log.info('[IPC] Successfully created project folders:', folderPaths);
    return folderPaths;
  } catch (error) {
    log.error('[IPC] Error creating project folders:', error);
    throw error;
  }
});

/**
 * Check if a project folder exists
 */
ipcMain.handle('project:folder-exists', async (event, projectId) => {
  try {
    const exists = await projectFolders.projectFolderExists(projectId);
    log.info(`[IPC] Project folder exists for ${projectId}:`, exists);
    return exists;
  } catch (error) {
    log.error('[IPC] Error checking project folder:', error);
    throw error;
  }
});

/**
 * Get paths to all subfolders for a project
 */
ipcMain.handle('project:get-folder-paths', async (event, projectId) => {
  try {
    const paths = projectFolders.getProjectFolderPaths(projectId);
    log.info(`[IPC] Project folder paths for ${projectId}:`, paths);
    return paths;
  } catch (error) {
    log.error('[IPC] Error getting project folder paths:', error);
    throw error;
  }
});

/**
 * List all project folders in StraboMicro2Data
 */
ipcMain.handle('project:list-folders', async () => {
  try {
    const projectIds = await projectFolders.listProjectFolders();
    log.info(`[IPC] Found ${projectIds.length} project folder(s)`);
    return projectIds;
  } catch (error) {
    log.error('[IPC] Error listing project folders:', error);
    throw error;
  }
});

/**
 * Delete a project folder (with confirmation)
 */
ipcMain.handle('project:delete-folder', async (event, projectId) => {
  try {
    log.info(`[IPC] Deleting project folder: ${projectId}`);
    await projectFolders.deleteProjectFolder(projectId);
    log.info('[IPC] Successfully deleted project folder');
    return { success: true };
  } catch (error) {
    log.error('[IPC] Error deleting project folder:', error);
    throw error;
  }
});

/**
 * Copy a file to the project's associatedFiles folder
 */
ipcMain.handle('project:copy-to-associated-files', async (event, sourcePath, projectId, fileName) => {
  try {
    log.info(`[IPC] Copying file to associatedFiles: ${fileName}`);
    const result = await projectFolders.copyFileToAssociatedFiles(sourcePath, projectId, fileName);
    log.info('[IPC] Successfully copied file to associatedFiles');
    return result;
  } catch (error) {
    log.error('[IPC] Error copying file to associatedFiles:', error);
    throw error;
  }
});

/**
 * Delete a file from the project's associatedFiles folder
 */
ipcMain.handle('project:delete-from-associated-files', async (event, projectId, fileName) => {
  try {
    log.info(`[IPC] Deleting file from associatedFiles: ${fileName}`);
    const result = await projectFolders.deleteFromAssociatedFiles(projectId, fileName);
    log.info('[IPC] Successfully deleted file from associatedFiles');
    return result;
  } catch (error) {
    log.error('[IPC] Error deleting file from associatedFiles:', error);
    throw error;
  }
});

/**
 * ============================================================================
 * IMAGE CONVERSION HANDLERS
 * ============================================================================
 */

/**
 * Convert image to JPEG in scratch space (for immediate preview during workflow)
 * This should be called as soon as user selects an image
 */
ipcMain.handle('image:convert-to-scratch', async (event, sourcePath) => {
  try {
    log.info(`[IPC] Converting to scratch JPEG: ${sourcePath}`);

    const result = await imageConverter.convertToScratchJPEG(sourcePath, (progress) => {
      // Send progress updates to renderer
      if (mainWindow) {
        mainWindow.webContents.send('image:conversion-progress', progress);
      }
    });

    log.info('[IPC] Successfully converted to scratch JPEG');
    return result;
  } catch (error) {
    log.error('[IPC] Error converting to scratch JPEG:', error);
    throw error;
  }
});

/**
 * Move image from scratch to project folder
 */
ipcMain.handle('image:move-from-scratch', async (event, identifier, projectId, micrographId) => {
  try {
    log.info(`[IPC] Moving scratch image to project folder: ${identifier}`);
    const dataPath = projectFolders.getStraboMicro2DataPath();
    const destination = `${dataPath}/${projectId}/images/${micrographId}`;

    await scratchSpace.moveToFinal(identifier, destination);

    log.info('[IPC] Successfully moved scratch image to project folder');
    return { success: true, destination };
  } catch (error) {
    log.error('[IPC] Error moving scratch image:', error);
    throw error;
  }
});

/**
 * Delete scratch image (when user cancels)
 */
ipcMain.handle('image:delete-scratch', async (event, identifier) => {
  try {
    log.info(`[IPC] Deleting scratch image: ${identifier}`);
    await scratchSpace.deleteScratchFile(identifier);
    log.info('[IPC] Successfully deleted scratch image');
    return { success: true };
  } catch (error) {
    log.error('[IPC] Error deleting scratch image:', error);
    throw error;
  }
});

/**
 * Convert and save a micrograph image to the project images folder
 */
ipcMain.handle('image:convert-and-save-micrograph', async (event, sourcePath, projectId, micrographId) => {
  try {
    log.info(`[IPC] Converting and saving micrograph image: ${sourcePath}`);
    const dataPath = projectFolders.getStraboMicro2DataPath();
    const result = await imageConverter.convertAndSaveMicrographImage(
      sourcePath,
      projectId,
      micrographId,
      dataPath
    );
    log.info('[IPC] Successfully converted and saved micrograph image');
    return result;
  } catch (error) {
    log.error('[IPC] Error converting and saving micrograph image:', error);
    throw error;
  }
});

/**
 * Generate image variants (uiImages, compositeImages, thumbnails, etc.)
 */
ipcMain.handle('image:generate-variants', async (event, sourcePath, projectId, micrographId) => {
  try {
    log.info(`[IPC] Generating image variants for micrograph: ${micrographId}`);
    const dataPath = projectFolders.getStraboMicro2DataPath();
    const result = await imageConverter.generateImageVariants(
      sourcePath,
      projectId,
      micrographId,
      dataPath
    );
    log.info('[IPC] Successfully generated image variants');
    return result;
  } catch (error) {
    log.error('[IPC] Error generating image variants:', error);
    throw error;
  }
});

/**
 * Get image dimensions
 */
ipcMain.handle('image:get-dimensions', async (event, imagePath) => {
  try {
    const dimensions = await imageConverter.getImageDimensions(imagePath);
    log.info(`[IPC] Image dimensions for ${imagePath}:`, dimensions);
    return dimensions;
  } catch (error) {
    log.error('[IPC] Error getting image dimensions:', error);
    throw error;
  }
});

/**
 * Check if file is a valid image
 */
ipcMain.handle('image:is-valid', async (event, filePath) => {
  try {
    const isValid = await imageConverter.isValidImage(filePath);
    log.info(`[IPC] Image validity check for ${filePath}: ${isValid}`);
    return isValid;
  } catch (error) {
    log.error('[IPC] Error checking image validity:', error);
    return false;
  }
});

/**
 * Flip (mirror horizontally) an image file in place
 * Uses Sharp's flop() for horizontal mirroring
 * Also clears the tile cache for this image so it gets re-tiled
 */
ipcMain.handle('image:flip-horizontal', async (event, imagePath) => {
  try {
    log.info(`[IPC] Flipping image horizontally: ${imagePath}`);

    // Read the image
    const imageBuffer = await sharp(imagePath).flop().toBuffer();

    // Get metadata to determine output format
    const metadata = await sharp(imagePath).metadata();

    // Write back to the same file
    // Use PNG for lossless quality preservation
    if (metadata.format === 'png' || imagePath.toLowerCase().endsWith('.png')) {
      await sharp(imageBuffer).png().toFile(imagePath + '.tmp');
    } else if (metadata.format === 'tiff' || imagePath.toLowerCase().endsWith('.tif') || imagePath.toLowerCase().endsWith('.tiff')) {
      await sharp(imageBuffer).tiff().toFile(imagePath + '.tmp');
    } else {
      // Default to JPEG for other formats
      await sharp(imageBuffer).jpeg({ quality: 95 }).toFile(imagePath + '.tmp');
    }

    // Replace original with flipped version
    const fs = require('fs').promises;
    await fs.unlink(imagePath);
    await fs.rename(imagePath + '.tmp', imagePath);

    // Clear tile cache for this image so it gets re-tiled
    const imageHash = await tileCache.generateImageHash(imagePath);
    await tileCache.clearImageCache(imageHash);

    log.info(`[IPC] Successfully flipped image: ${imagePath}`);
    return { success: true, hash: imageHash };
  } catch (error) {
    log.error('[IPC] Error flipping image:', error);
    throw error;
  }
});

/**
 * ============================================================================
 * COMPOSITE THUMBNAIL GENERATION HANDLERS
 * ============================================================================
 */

/**
 * Generate composite thumbnail for a micrograph with its immediate children overlaid
 * Creates a 250px JPEG in the compositeThumbnails/ folder
 *
 * @param {string} projectId - Project ID
 * @param {string} micrographId - Micrograph ID to generate thumbnail for
 * @param {object} projectData - Current project data from renderer (avoids stale disk reads)
 */
ipcMain.handle('composite:generate-thumbnail', async (event, projectId, micrographId, projectData) => {
  try {
    log.info(`[IPC] Generating composite thumbnail for micrograph: ${micrographId}`);

    // Get project folder paths
    const folderPaths = await projectFolders.getProjectFolderPaths(projectId);

    // Use provided project data instead of loading from disk (may be stale)
    const project = projectData;

    // Find the micrograph in the project hierarchy
    let micrograph = null;
    let childMicrographs = [];

    for (const dataset of project.datasets || []) {
      for (const sample of dataset.samples || []) {
        for (const micro of sample.micrographs || []) {
          if (micro.id === micrographId) {
            micrograph = micro;

            // Find immediate children (associated micrographs)
            childMicrographs = (sample.micrographs || []).filter(
              m => m.parentID === micrographId
            );

            log.info(`[IPC] Found parent micrograph ${micrographId} with ${childMicrographs.length} children`);
            log.info(`[IPC] Children IDs:`, childMicrographs.map(c => ({ id: c.id, name: c.name, imagePath: c.imagePath })));

            break;
          }
        }
        if (micrograph) break;
      }
      if (micrograph) break;
    }

    if (!micrograph) {
      log.error(`[IPC] Micrograph ${micrographId} not found in project. Available micrographs:`,
        project.datasets?.flatMap(d => d.samples?.flatMap(s => s.micrographs?.map(m => m.id)) || []) || []);
      throw new Error(`Micrograph ${micrographId} not found in project`);
    }

    // Load base micrograph image
    const basePath = path.join(folderPaths.images, micrograph.imagePath);
    log.info(`[IPC] Loading base image: ${basePath}`);

    let baseImage = sharp(basePath);
    const baseMetadata = await baseImage.metadata();

    log.info(`[IPC] Parent micrograph: ${micrograph.id}`);
    log.info(`[IPC]   imageWidth (stored): ${micrograph.imageWidth}, imageHeight (stored): ${micrograph.imageHeight}`);
    log.info(`[IPC]   Actual file dimensions: ${baseMetadata.width}x${baseMetadata.height}`);
    log.info(`[IPC]   Parent px/cm: ${micrograph.scalePixelsPerCentimeter}`);

    // Calculate thumbnail dimensions maintaining aspect ratio
    const maxDimension = 250;
    const aspectRatio = baseMetadata.width / baseMetadata.height;
    let thumbWidth, thumbHeight;

    if (baseMetadata.width > baseMetadata.height) {
      thumbWidth = maxDimension;
      thumbHeight = Math.round(maxDimension / aspectRatio);
    } else {
      thumbHeight = maxDimension;
      thumbWidth = Math.round(maxDimension * aspectRatio);
    }

    // Resize base image to thumbnail size
    baseImage = baseImage.resize(thumbWidth, thumbHeight, {
      fit: 'fill',
      kernel: sharp.kernel.lanczos3
    });

    // If there are no children, just save the base thumbnail
    if (childMicrographs.length === 0) {
      log.info(`[IPC] No child micrographs, saving base thumbnail only`);

      const outputPath = path.join(folderPaths.compositeThumbnails, micrographId);
      await baseImage.jpeg({ quality: 85 }).toFile(outputPath);

      return {
        success: true,
        thumbnailPath: outputPath,
        width: thumbWidth,
        height: thumbHeight
      };
    }

    // Composite children onto base
    log.info(`[IPC] Compositing ${childMicrographs.length} child micrographs`);

    // Convert base image to buffer for compositing
    const baseBuffer = await baseImage.toBuffer();

    // Calculate scale factor from original to thumbnail
    const thumbnailScale = thumbWidth / baseMetadata.width;

    // Build composite layers
    const compositeInputs = [];

    for (const child of childMicrographs) {
      try {
        // Skip point-located micrographs - they should be rendered as point markers, not overlays
        if (child.pointInParent) {
          log.info(`[IPC] Skipping point-located child ${child.id} (${child.name}) - not rendered as overlay`);
          continue;
        }

        // Skip children that haven't been located yet (no position data)
        // This is critical for batch-imported micrographs which don't have position until user sets it
        // Without this check, ALL children would be loaded from disk causing massive memory spike
        if (!child.offsetInParent && child.xOffset === undefined) {
          log.info(`[IPC] Skipping unlocated child ${child.id} (${child.name}) - no position data yet`);
          continue;
        }

        log.info(`[IPC] Processing child ${child.id} (${child.name})`);

        const childPath = path.join(folderPaths.images, child.imagePath);

        // Load child image
        let childImage = sharp(childPath);
        const childMetadata = await childImage.metadata();

        // IMPORTANT: Use stored imageWidth/imageHeight (original dimensions), NOT actual file dimensions
        // This matches how AssociatedImageRenderer works in the main viewer
        const childImageWidth = child.imageWidth || child.width || childMetadata.width;
        const childImageHeight = child.imageHeight || child.height || childMetadata.height;

        // Calculate child's display scale based on pixels per centimeter
        const childPxPerCm = child.scalePixelsPerCentimeter || 100;
        const parentPxPerCm = micrograph.scalePixelsPerCentimeter || 100;
        const displayScale = parentPxPerCm / childPxPerCm;

        log.info(`[IPC]   Child px/cm: ${childPxPerCm}, Parent px/cm: ${parentPxPerCm}, Display scale: ${displayScale}`);
        log.info(`[IPC]   Child stored dimensions: ${childImageWidth}x${childImageHeight}, actual file: ${childMetadata.width}x${childMetadata.height}`);

        // Calculate child dimensions in parent's coordinate space using STORED dimensions
        const childDisplayWidth = childImageWidth * displayScale;
        const childDisplayHeight = childImageHeight * displayScale;

        // Get child position (top-left)
        let topLeftX = 0;
        let topLeftY = 0;

        if (child.offsetInParent) {
          topLeftX = child.offsetInParent.X;
          topLeftY = child.offsetInParent.Y;
          log.info(`[IPC]   Using offsetInParent: (${topLeftX}, ${topLeftY})`);
        } else if (child.pointInParent) {
          topLeftX = child.pointInParent.x - childDisplayWidth / 2;
          topLeftY = child.pointInParent.y - childDisplayHeight / 2;
          log.info(`[IPC]   Using pointInParent: (${child.pointInParent.x}, ${child.pointInParent.y}) -> topLeft: (${topLeftX}, ${topLeftY})`);
        } else if (child.xOffset !== undefined && child.yOffset !== undefined) {
          topLeftX = child.xOffset;
          topLeftY = child.yOffset;
          log.info(`[IPC]   Using legacy offset: (${topLeftX}, ${topLeftY})`);
        }

        // Scale position to thumbnail coordinates
        const thumbX = Math.round(topLeftX * thumbnailScale);
        const thumbY = Math.round(topLeftY * thumbnailScale);

        // Scale child dimensions to thumbnail coordinates
        const thumbChildWidth = Math.round(childDisplayWidth * thumbnailScale);
        const thumbChildHeight = Math.round(childDisplayHeight * thumbnailScale);

        log.info(`[IPC]   Original position: (${topLeftX}, ${topLeftY}), Thumbnail position: (${thumbX}, ${thumbY})`);
        log.info(`[IPC]   Original size: ${childMetadata.width}x${childMetadata.height}, Display size: ${childDisplayWidth}x${childDisplayHeight}, Thumb size: ${thumbChildWidth}x${thumbChildHeight}`);

        // Resize child image
        childImage = childImage.resize(thumbChildWidth, thumbChildHeight, {
          fit: 'fill',
          kernel: sharp.kernel.lanczos3
        });

        // Get child opacity (default to 1 if not set)
        const childOpacity = child.opacity ?? 1.0;
        log.info(`[IPC]   Child opacity: ${childOpacity}`);

        // Ensure we have alpha channel for opacity support
        childImage = childImage.ensureAlpha();

        // Apply opacity by multiplying the alpha channel
        // We need to get the buffer, modify alpha values, then create new sharp instance
        if (childOpacity < 1.0) {
          const { data, info } = await childImage.raw().toBuffer({ resolveWithObject: true });

          // Modify alpha channel (every 4th byte starting at index 3)
          for (let i = 3; i < data.length; i += 4) {
            data[i] = Math.round(data[i] * childOpacity);
          }

          // Recreate sharp instance with modified data
          childImage = sharp(data, {
            raw: {
              width: info.width,
              height: info.height,
              channels: info.channels
            }
          });
        }

        // Apply rotation if needed
        let finalX, finalY, finalBuffer;
        if (child.rotation) {
          // Calculate center position for rotation
          const centerX = thumbX + thumbChildWidth / 2;
          const centerY = thumbY + thumbChildHeight / 2;

          // Rotate with transparent background
          childImage = childImage.rotate(child.rotation, {
            background: { r: 0, g: 0, b: 0, alpha: 0 }
          });

          // Calculate rotated bounding box dimensions mathematically
          // Sharp's metadata() on a pipeline returns input metadata, not post-transform
          const radians = (child.rotation * Math.PI) / 180;
          const cos = Math.abs(Math.cos(radians));
          const sin = Math.abs(Math.sin(radians));
          const rotatedWidth = thumbChildWidth * cos + thumbChildHeight * sin;
          const rotatedHeight = thumbChildWidth * sin + thumbChildHeight * cos;

          // Adjust position to account for rotation
          finalX = Math.round(centerX - rotatedWidth / 2);
          finalY = Math.round(centerY - rotatedHeight / 2);
          finalBuffer = await childImage.png().toBuffer();

          log.info(`[IPC]   Rotation: ${child.rotation}°, Rotated size: ${Math.round(rotatedWidth)}x${Math.round(rotatedHeight)}`);
        } else {
          finalX = thumbX;
          finalY = thumbY;
          finalBuffer = await childImage.png().toBuffer();
        }

        // Validate that the composite position is within bounds
        // Sharp requires: left >= 0, top >= 0, and image fits within base
        const childBufferMeta = await sharp(finalBuffer).metadata();
        const childW = childBufferMeta.width;
        const childH = childBufferMeta.height;

        // Skip children that would be entirely outside the base image
        if (finalX + childW <= 0 || finalY + childH <= 0 || finalX >= thumbWidth || finalY >= thumbHeight) {
          log.info(`[IPC]   Skipping child ${child.id} - entirely outside base image bounds`);
          continue;
        }

        // Crop child image if it extends outside base bounds
        let cropX = 0, cropY = 0, cropW = childW, cropH = childH;
        let compositeX = finalX, compositeY = finalY;

        // Handle negative X (child extends past left edge)
        if (finalX < 0) {
          cropX = -finalX;
          cropW -= cropX;
          compositeX = 0;
        }

        // Handle negative Y (child extends past top edge)
        if (finalY < 0) {
          cropY = -finalY;
          cropH -= cropY;
          compositeY = 0;
        }

        // Handle overflow on right
        if (compositeX + cropW > thumbWidth) {
          cropW = thumbWidth - compositeX;
        }

        // Handle overflow on bottom
        if (compositeY + cropH > thumbHeight) {
          cropH = thumbHeight - compositeY;
        }

        // Validate crop dimensions are positive
        if (cropW <= 0 || cropH <= 0) {
          log.info(`[IPC]   Skipping child ${child.id} - crop dimensions invalid after bounds check`);
          continue;
        }

        // If we need to crop, extract the visible region
        let compositeBuffer = finalBuffer;
        if (cropX > 0 || cropY > 0 || cropW !== childW || cropH !== childH) {
          log.info(`[IPC]   Cropping child to visible region: extract(${cropX}, ${cropY}, ${cropW}, ${cropH})`);
          compositeBuffer = await sharp(finalBuffer)
            .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
            .toBuffer();
        }

        compositeInputs.push({
          input: compositeBuffer,
          left: compositeX,
          top: compositeY
        });
      } catch (error) {
        log.error(`[IPC] Failed to composite child ${child.id}:`, error);
        // Continue with other children
      }
    }

    // Apply composites to base image
    const compositeImage = sharp(baseBuffer).composite(compositeInputs);

    // Save to compositeThumbnails folder (JPEG with no extension)
    const outputPath = path.join(folderPaths.compositeThumbnails, micrographId);
    await compositeImage.jpeg({ quality: 85 }).toFile(outputPath);

    log.info(`[IPC] Successfully generated composite thumbnail: ${outputPath}`);

    // Release Sharp memory after thumbnail generation
    // This prevents memory accumulation when generating multiple thumbnails
    sharp.cache(false);
    sharp.cache({ memory: 256, files: 20, items: 100 });

    return {
      success: true,
      thumbnailPath: outputPath,
      width: thumbWidth,
      height: thumbHeight
    };

  } catch (error) {
    log.error('[IPC] Error generating composite thumbnail:', error);
    // Still try to release memory on error
    sharp.cache(false);
    sharp.cache({ memory: 256, files: 20, items: 100 });
    throw error;
  }
});

/**
 * Get path to composite thumbnail (returns empty string if doesn't exist)
 */
ipcMain.handle('composite:get-thumbnail-path', async (event, projectId, micrographId) => {
  try {
    const folderPaths = await projectFolders.getProjectFolderPaths(projectId);
    const thumbnailPath = path.join(folderPaths.compositeThumbnails, micrographId);

    // Check if file exists
    const fs = require('fs').promises;
    try {
      await fs.access(thumbnailPath);
      return thumbnailPath;
    } catch {
      return '';
    }
  } catch (error) {
    log.error('[IPC] Error getting composite thumbnail path:', error);
    return '';
  }
});

/**
 * Load composite thumbnail as base64 data URL
 */
ipcMain.handle('composite:load-thumbnail', async (event, projectId, micrographId) => {
  try {
    const folderPaths = await projectFolders.getProjectFolderPaths(projectId);
    const thumbnailPath = path.join(folderPaths.compositeThumbnails, micrographId);

    // Check if file exists
    const fs = require('fs').promises;
    try {
      await fs.access(thumbnailPath);

      // Read file as buffer and convert to base64
      const buffer = await fs.readFile(thumbnailPath);
      const base64 = buffer.toString('base64');
      const dataUrl = `data:image/jpeg;base64,${base64}`;

      return dataUrl;
    } catch {
      return null;
    }
  } catch (error) {
    log.error('[IPC] Error loading composite thumbnail:', error);
    return null;
  }
});

/**
 * Rebuild all composite thumbnails for a project
 * Iterates through all micrographs and regenerates their composite thumbnails
 */
ipcMain.handle('composite:rebuild-all-thumbnails', async (event, projectId, projectData) => {
  try {
    log.info(`[IPC] Rebuilding all composite thumbnails for project: ${projectId}`);

    const project = projectData;
    const micrographIds = [];

    // Collect all micrograph IDs from project
    for (const dataset of project.datasets || []) {
      for (const sample of dataset.samples || []) {
        for (const micrograph of sample.micrographs || []) {
          micrographIds.push(micrograph.id);
        }
      }
    }

    log.info(`[IPC] Found ${micrographIds.length} micrographs to rebuild`);

    const results = {
      total: micrographIds.length,
      succeeded: 0,
      failed: 0,
      errors: []
    };

    // Generate thumbnail for each micrograph
    for (const micrographId of micrographIds) {
      try {
        // Reuse the existing generate-thumbnail handler logic
        // Find the micrograph in the project hierarchy
        let micrograph = null;
        let childMicrographs = [];

        for (const dataset of project.datasets || []) {
          for (const sample of dataset.samples || []) {
            for (const micro of sample.micrographs || []) {
              if (micro.id === micrographId) {
                micrograph = micro;
                childMicrographs = (sample.micrographs || []).filter(
                  m => m.parentID === micrographId
                );
                break;
              }
            }
            if (micrograph) break;
          }
          if (micrograph) break;
        }

        if (!micrograph || !micrograph.imagePath) {
          log.warn(`[IPC] Skipping micrograph ${micrographId} - no image path`);
          continue;
        }

        // Get project folder paths
        const folderPaths = await projectFolders.getProjectFolderPaths(projectId);

        // Load base micrograph image
        const basePath = path.join(folderPaths.images, micrograph.imagePath);

        // Check if image file exists
        const fs = require('fs').promises;
        try {
          await fs.access(basePath);
        } catch {
          log.warn(`[IPC] Skipping micrograph ${micrographId} - image file not found: ${basePath}`);
          continue;
        }

        let baseImage = sharp(basePath);
        const baseMetadata = await baseImage.metadata();

        // Calculate thumbnail dimensions maintaining aspect ratio
        const maxDimension = 250;
        const aspectRatio = baseMetadata.width / baseMetadata.height;
        let thumbWidth, thumbHeight;

        if (baseMetadata.width > baseMetadata.height) {
          thumbWidth = maxDimension;
          thumbHeight = Math.round(maxDimension / aspectRatio);
        } else {
          thumbHeight = maxDimension;
          thumbWidth = Math.round(maxDimension * aspectRatio);
        }

        // Resize base image to thumbnail size
        baseImage = baseImage.resize(thumbWidth, thumbHeight, {
          fit: 'fill',
          kernel: sharp.kernel.lanczos3
        });

        // If there are no children, just save the base thumbnail
        if (childMicrographs.length === 0) {
          const outputPath = path.join(folderPaths.compositeThumbnails, micrographId);
          await baseImage.jpeg({ quality: 85 }).toFile(outputPath);
          results.succeeded++;
          continue;
        }

        // Composite children onto base
        const baseBuffer = await baseImage.toBuffer();
        const thumbnailScale = thumbWidth / baseMetadata.width;
        const compositeInputs = [];

        for (const child of childMicrographs) {
          try {
            if (!child.imagePath) continue;

            // Skip point-located micrographs - they should be rendered as point markers, not overlays
            if (child.pointInParent) {
              log.info(`[IPC] Rebuild: Skipping point-located child ${child.id} - not rendered as overlay`);
              continue;
            }

            // Skip children that haven't been located yet (no position data)
            // This prevents loading ALL child images when only some have position data
            if (!child.offsetInParent && child.xOffset === undefined) {
              log.info(`[IPC] Rebuild: Skipping unlocated child ${child.id} - no position data yet`);
              continue;
            }

            const childPath = path.join(folderPaths.images, child.imagePath);

            // Check if child image exists
            try {
              await fs.access(childPath);
            } catch {
              log.warn(`[IPC] Child image not found: ${childPath}`);
              continue;
            }

            let childImage = sharp(childPath);
            const childMetadata = await childImage.metadata();

            // IMPORTANT: Use stored imageWidth/imageHeight (original dimensions), NOT actual file dimensions
            const childImageWidth = child.imageWidth || child.width || childMetadata.width;
            const childImageHeight = child.imageHeight || child.height || childMetadata.height;

            const childPxPerCm = child.scalePixelsPerCentimeter || 100;
            const parentPxPerCm = micrograph.scalePixelsPerCentimeter || 100;
            const displayScale = parentPxPerCm / childPxPerCm;

            const childDisplayWidth = childImageWidth * displayScale;
            const childDisplayHeight = childImageHeight * displayScale;

            let topLeftX = 0;
            let topLeftY = 0;

            if (child.offsetInParent) {
              topLeftX = child.offsetInParent.X;
              topLeftY = child.offsetInParent.Y;
            } else if (child.pointInParent) {
              topLeftX = child.pointInParent.x - childDisplayWidth / 2;
              topLeftY = child.pointInParent.y - childDisplayHeight / 2;
            } else if (child.xOffset !== undefined && child.yOffset !== undefined) {
              topLeftX = child.xOffset;
              topLeftY = child.yOffset;
            }

            const thumbX = Math.round(topLeftX * thumbnailScale);
            const thumbY = Math.round(topLeftY * thumbnailScale);
            const thumbChildWidth = Math.round(childDisplayWidth * thumbnailScale);
            const thumbChildHeight = Math.round(childDisplayHeight * thumbnailScale);

            childImage = childImage.resize(thumbChildWidth, thumbChildHeight, {
              fit: 'fill',
              kernel: sharp.kernel.lanczos3
            });

            if (child.rotation) {
              const centerX = thumbX + thumbChildWidth / 2;
              const centerY = thumbY + thumbChildHeight / 2;

              // Convert to PNG with alpha channel before rotating
              // This ensures the rotated corners are transparent, not black
              childImage = childImage.ensureAlpha().rotate(child.rotation, {
                background: { r: 0, g: 0, b: 0, alpha: 0 }
              });

              // Calculate rotated bounding box dimensions mathematically
              // Sharp's metadata() on a pipeline returns input metadata, not post-transform
              const radians = (child.rotation * Math.PI) / 180;
              const cos = Math.abs(Math.cos(radians));
              const sin = Math.abs(Math.sin(radians));
              const rotatedWidth = thumbChildWidth * cos + thumbChildHeight * sin;
              const rotatedHeight = thumbChildWidth * sin + thumbChildHeight * cos;

              const adjustedX = Math.round(centerX - rotatedWidth / 2);
              const adjustedY = Math.round(centerY - rotatedHeight / 2);

              compositeInputs.push({
                input: await childImage.png().toBuffer(),
                left: adjustedX,
                top: adjustedY
              });
            } else {
              compositeInputs.push({
                input: await childImage.toBuffer(),
                left: thumbX,
                top: thumbY
              });
            }
          } catch (error) {
            log.error(`[IPC] Failed to composite child ${child.id}:`, error);
          }
        }

        const compositeImage = sharp(baseBuffer).composite(compositeInputs);
        const outputPath = path.join(folderPaths.compositeThumbnails, micrographId);
        await compositeImage.jpeg({ quality: 85 }).toFile(outputPath);

        results.succeeded++;
      } catch (error) {
        log.error(`[IPC] Failed to rebuild thumbnail for ${micrographId}:`, error);
        results.failed++;
        results.errors.push({ micrographId, error: error.message });
      }
    }

    log.info(`[IPC] Rebuild complete: ${results.succeeded} succeeded, ${results.failed} failed`);

    return {
      success: true,
      results
    };
  } catch (error) {
    log.error('[IPC] Error rebuilding all thumbnails:', error);
    throw error;
  }
});

/**
 * ============================================================================
 * PROJECT SERIALIZATION HANDLERS
 * ============================================================================
 */

/**
 * Save project.json to disk (legacy format)
 */
ipcMain.handle('project:save-json', async (event, project, projectId) => {
  try {
    log.info(`[IPC] Saving project.json for: ${projectId}`);
    const savedPath = await projectSerializer.saveProjectJson(project, projectId);
    log.info('[IPC] Successfully saved project.json');
    return { success: true, path: savedPath };
  } catch (error) {
    log.error('[IPC] Error saving project.json:', error);
    throw error;
  }
});

/**
 * Load project.json from disk
 */
ipcMain.handle('project:load-json', async (event, projectId) => {
  try {
    log.info(`[IPC] Loading project.json for: ${projectId}`);
    const project = await projectSerializer.loadProjectJson(projectId);
    log.info('[IPC] Successfully loaded project.json');
    return project;
  } catch (error) {
    log.error('[IPC] Error loading project.json:', error);
    throw error;
  }
});

/**
 * Get memory usage information for both main and renderer processes
 * Used by the memory monitor status bar indicator
 */
ipcMain.handle('debug:get-memory-info', async () => {
  const mainMemory = process.memoryUsage();
  return {
    main: {
      heapUsed: mainMemory.heapUsed,
      heapTotal: mainMemory.heapTotal,
      external: mainMemory.external,
      rss: mainMemory.rss, // Resident Set Size - total memory allocated
    },
    timestamp: Date.now(),
  };
});

/**
 * Reset everything for clean testing
 * - Clears StraboMicro2Data folder
 * - Clears tile cache
 * - Creates test project with dataset and sample (no images)
 */
ipcMain.handle('debug:reset-everything', async () => {
  try {
    log.info('[IPC] === RESET EVERYTHING - Starting clean test ===');

    // Step 1: Clear StraboMicro2Data folder
    const dataPath = projectFolders.getStraboMicro2DataPath();
    log.info(`[IPC] Clearing StraboMicro2Data folder: ${dataPath}`);

    try {
      await fs.promises.rm(dataPath, { recursive: true, force: true });
      log.info('[IPC] Successfully deleted StraboMicro2Data folder');

      // Wait a moment to ensure deletion is complete
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      if (error.code !== 'ENOENT') {
        log.warn('[IPC] Error deleting StraboMicro2Data folder:', error);
      }
    }

    // Step 2: Clear tile cache
    log.info('[IPC] Clearing all tile caches');
    const tileCache = require('./tileCache');
    await tileCache.clearAllCaches();
    log.info('[IPC] Successfully cleared tile caches');

    // Step 3: Recreate base StraboMicro2Data directory
    await projectFolders.ensureStraboMicro2DataDir();
    log.info('[IPC] Recreated StraboMicro2Data base directory');

    // Step 4: Create test project structure
    const testProjectId = 'test-project-' + Date.now();
    log.info(`[IPC] Creating test project: ${testProjectId}`);

    const testProject = {
      id: testProjectId,
      name: 'Test Project',
      startDate: '2025-01-01',
      endDate: '2025-12-31',
      purposeOfStudy: 'Testing and development',
      otherTeamMembers: 'Claude Code',
      areaOfInterest: 'Test Area',
      gpsDatum: 'WGS84',
      magneticDeclination: '0',
      notes: 'Auto-generated test project for development',
      datasets: [
        {
          id: 'test-dataset-1',
          name: 'Test Dataset',
          date: new Date().toISOString(),
          samples: [
            {
              id: 'test-sample-1',
              label: 'Test Sample 001',
              sampleID: 'TS-001',
              longitude: -122.4194,
              latitude: 37.7749,
              mainSamplingPurpose: 'Testing',
              sampleDescription: 'Test sample for development',
              materialType: 'Rock',
              inplacenessOfSample: 'In-place',
              orientedSample: 'No',
              sampleSize: 'Medium',
              degreeOfWeathering: 'Fresh',
              sampleNotes: 'Auto-generated test sample',
              sampleType: 'Hand sample',
              color: 'Gray',
              lithology: 'Granite',
              micrographs: [],
              isExpanded: false,
              isSpotExpanded: false,
            }
          ]
        }
      ]
    };

    // Step 5: Create project folders
    await projectFolders.createProjectFolders(testProjectId);
    log.info('[IPC] Created test project folder structure');

    // Step 6: Save project.json
    await projectSerializer.saveProjectJson(testProject, testProjectId);
    log.info('[IPC] Saved test project.json');

    log.info('[IPC] === RESET EVERYTHING - Complete ===');

    return {
      success: true,
      project: testProject,
      message: 'Successfully reset everything and created test project'
    };
  } catch (error) {
    log.error('[IPC] Error during reset:', error);
    throw error;
  }
});

/**
 * ============================================================================
 * AUTHENTICATION HANDLERS (JWT-based)
 * ============================================================================
 *
 * These handlers manage secure authentication with the StraboSpot server.
 * JWT tokens are stored securely using Electron's safeStorage API.
 */

const tokenService = require('./tokenService');

// Helper to get REST server URL from renderer's localStorage
// We'll pass it from the renderer since preferences are stored there
function getRestServerFromPreferences(restServer) {
  return restServer || 'https://strabospot.org';
}

/**
 * Login to StraboSpot server
 * @param {string} email - User's email address
 * @param {string} password - User's password
 * @param {string} restServer - REST server URL from preferences
 * @returns {object} { success, user, error }
 */
ipcMain.handle('auth:login', async (event, email, password, restServer) => {
  try {
    log.info('[Auth] Attempting login for:', email);

    const baseUrl = getRestServerFromPreferences(restServer);
    log.info('[Auth] Using REST server:', baseUrl);
    log.info('[Auth] Full login URL:', `${baseUrl}/jwtauth/login`);

    const response = await fetch(`${baseUrl}/jwtauth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      log.warn('[Auth] Login failed:', data.message || 'Unknown error');
      return {
        success: false,
        error: data.message || 'Invalid email or password',
      };
    }

    // Login successful - save tokens securely
    await tokenService.saveTokens(
      data.access_token,
      data.refresh_token,
      data.expires_in,
      data.user
    );

    log.info('[Auth] Login successful for:', data.user.email);

    return {
      success: true,
      user: data.user,
    };
  } catch (error) {
    log.error('[Auth] Login error:', error);
    return {
      success: false,
      error: error.message || 'Network error - please check your connection',
    };
  }
});

/**
 * Logout from StraboSpot server
 * @param {string} restServer - REST server URL from preferences
 * @returns {object} { success }
 */
ipcMain.handle('auth:logout', async (event, restServer) => {
  try {
    const tokens = await tokenService.getTokens();

    if (tokens && tokens.accessToken) {
      const baseUrl = getRestServerFromPreferences(restServer);

      try {
        // Notify server to revoke refresh token
        const response = await fetch(`${baseUrl}/jwtauth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${tokens.accessToken}`,
          },
          body: tokens.refreshToken
            ? JSON.stringify({ refresh_token: tokens.refreshToken })
            : undefined,
        });

        if (response.ok) {
          const data = await response.json();
          log.info('[Auth] Server logout response:', data.message);
        } else {
          log.warn('[Auth] Server logout failed, clearing local tokens anyway');
        }
      } catch (networkError) {
        log.warn('[Auth] Could not reach server for logout, clearing local tokens');
      }
    }

    // Always clear local tokens regardless of server response
    await tokenService.clearTokens();

    log.info('[Auth] Logged out');
    return { success: true };
  } catch (error) {
    log.error('[Auth] Logout error:', error);
    // Still clear local tokens on error
    await tokenService.clearTokens();
    return { success: true };
  }
});

/**
 * Refresh the access token using the refresh token
 * @param {string} restServer - REST server URL from preferences
 * @returns {object} { success, error }
 */
ipcMain.handle('auth:refresh', async (event, restServer) => {
  try {
    const tokens = await tokenService.getTokens();

    if (!tokens || !tokens.refreshToken) {
      log.warn('[Auth] No refresh token available');
      return { success: false, error: 'No refresh token' };
    }

    const baseUrl = getRestServerFromPreferences(restServer);
    const response = await fetch(`${baseUrl}/jwtauth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: tokens.refreshToken }),
    });

    if (!response.ok) {
      log.error('[Auth] Token refresh failed - session expired');
      // Clear tokens since refresh failed
      await tokenService.clearTokens();
      return {
        success: false,
        error: 'Session expired. Please log in again.',
      };
    }

    const data = await response.json();

    // Update the access token
    await tokenService.updateAccessToken(data.access_token, data.expires_in);

    log.info('[Auth] Token refreshed successfully');
    return { success: true };
  } catch (error) {
    log.error('[Auth] Token refresh error:', error);
    return {
      success: false,
      error: error.message || 'Failed to refresh session',
    };
  }
});

/**
 * Check if user is currently logged in with valid tokens
 * @returns {object} { isLoggedIn, user }
 */
ipcMain.handle('auth:check', async () => {
  try {
    const tokens = await tokenService.getTokens();

    if (!tokens) {
      return { isLoggedIn: false, user: null };
    }

    // Check if token is expired
    const isExpired = tokenService.isTokenExpired(tokens);

    if (isExpired) {
      // Token expired but we have refresh token - let renderer know to refresh
      return {
        isLoggedIn: false,
        user: tokens.user,
        needsRefresh: true,
      };
    }

    return {
      isLoggedIn: true,
      user: tokens.user,
    };
  } catch (error) {
    log.error('[Auth] Auth check error:', error);
    return { isLoggedIn: false, user: null };
  }
});

/**
 * Get the current access token for API calls
 * Renderer should call this before making authenticated requests
 * @returns {object} { token, user } or { token: null } if not logged in
 */
ipcMain.handle('auth:get-token', async () => {
  try {
    const tokens = await tokenService.getTokens();

    if (!tokens) {
      return { token: null };
    }

    // Check if token is expired
    if (tokenService.isTokenExpired(tokens)) {
      return { token: null, expired: true };
    }

    return {
      token: tokens.accessToken,
      user: tokens.user,
    };
  } catch (error) {
    log.error('[Auth] Get token error:', error);
    return { token: null };
  }
});

/**
 * Check if secure storage is available
 * @returns {object} { available, backend }
 */
ipcMain.handle('auth:check-storage', async () => {
  return {
    available: tokenService.isEncryptionAvailable(),
    backend: tokenService.getStorageBackend(),
  };
});

// =============================================================================
// BATCH EXPORT ALL IMAGES TO ZIP
// =============================================================================

/**
 * Helper: Generate composite image buffer for a micrograph
 * Reuses logic from micrograph:export-composite but returns buffer instead of saving
 */
async function generateCompositeBuffer(projectId, micrograph, projectData, folderPaths) {
  const includeSpots = true;
  const includeLabels = true;

  // Find child micrographs for this micrograph
  let childMicrographs = [];
  for (const dataset of projectData.datasets || []) {
    for (const sample of dataset.samples || []) {
      const children = (sample.micrographs || []).filter(
        m => m.parentID === micrograph.id
      );
      childMicrographs.push(...children);
    }
  }

  // Load base micrograph image
  const basePath = path.join(folderPaths.images, micrograph.imagePath);
  let baseImage = sharp(basePath);
  const baseMetadata = await baseImage.metadata();
  const baseWidth = baseMetadata.width;
  const baseHeight = baseMetadata.height;

  // Build composite layers for child micrographs
  const compositeInputs = [];

  for (const child of childMicrographs) {
    try {
      // Skip point-located micrographs
      if (child.pointInParent) {
        continue;
      }

      // Skip children that haven't been located yet (no position data)
      // This prevents loading ALL child images when only some have position data
      if (!child.offsetInParent && child.xOffset === undefined) {
        continue;
      }

      const childPath = path.join(folderPaths.images, child.imagePath);
      let childImage = sharp(childPath);
      const childMetadata = await childImage.metadata();

      // Use stored dimensions
      const childImageWidth = child.imageWidth || childMetadata.width;
      const childImageHeight = child.imageHeight || childMetadata.height;

      // Calculate display scale based on pixels per centimeter
      const childPxPerCm = child.scalePixelsPerCentimeter || 100;
      const parentPxPerCm = micrograph.scalePixelsPerCentimeter || 100;
      const displayScale = parentPxPerCm / childPxPerCm;

      // Calculate child dimensions in parent's coordinate space
      const childDisplayWidth = Math.round(childImageWidth * displayScale);
      const childDisplayHeight = Math.round(childImageHeight * displayScale);

      // Get child position (ensure integers for Sharp)
      let topLeftX = 0, topLeftY = 0;
      if (child.offsetInParent) {
        topLeftX = Math.round(child.offsetInParent.X);
        topLeftY = Math.round(child.offsetInParent.Y);
      } else if (child.xOffset !== undefined && child.yOffset !== undefined) {
        topLeftX = Math.round(child.xOffset);
        topLeftY = Math.round(child.yOffset);
      }

      // Resize child image to display dimensions
      childImage = childImage.resize(childDisplayWidth, childDisplayHeight, {
        fit: 'fill',
        kernel: sharp.kernel.lanczos3
      });

      // Apply opacity
      const childOpacity = child.opacity ?? 1.0;
      childImage = childImage.ensureAlpha();

      if (childOpacity < 1.0) {
        const { data, info } = await childImage.raw().toBuffer({ resolveWithObject: true });
        for (let i = 3; i < data.length; i += 4) {
          data[i] = Math.round(data[i] * childOpacity);
        }
        childImage = sharp(data, {
          raw: { width: info.width, height: info.height, channels: info.channels }
        });
      }

      // Apply rotation if needed
      let finalX = topLeftX, finalY = topLeftY, finalBuffer;
      if (child.rotation) {
        const centerX = topLeftX + childDisplayWidth / 2;
        const centerY = topLeftY + childDisplayHeight / 2;

        childImage = childImage.rotate(child.rotation, {
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        });

        const radians = (child.rotation * Math.PI) / 180;
        const cos = Math.abs(Math.cos(radians));
        const sin = Math.abs(Math.sin(radians));
        const rotatedWidth = childDisplayWidth * cos + childDisplayHeight * sin;
        const rotatedHeight = childDisplayWidth * sin + childDisplayHeight * cos;

        finalX = Math.round(centerX - rotatedWidth / 2);
        finalY = Math.round(centerY - rotatedHeight / 2);
        finalBuffer = await childImage.png().toBuffer();
      } else {
        finalBuffer = await childImage.png().toBuffer();
      }

      // Bounds checking and cropping
      const childBufferMeta = await sharp(finalBuffer).metadata();
      const childW = childBufferMeta.width;
      const childH = childBufferMeta.height;

      if (finalX + childW <= 0 || finalY + childH <= 0 || finalX >= baseWidth || finalY >= baseHeight) {
        continue;
      }

      let cropX = 0, cropY = 0, cropW = childW, cropH = childH;
      let compositeX = finalX, compositeY = finalY;

      if (finalX < 0) { cropX = -finalX; cropW -= cropX; compositeX = 0; }
      if (finalY < 0) { cropY = -finalY; cropH -= cropY; compositeY = 0; }
      if (compositeX + cropW > baseWidth) { cropW = baseWidth - compositeX; }
      if (compositeY + cropH > baseHeight) { cropH = baseHeight - compositeY; }

      if (cropW <= 0 || cropH <= 0) continue;

      // Ensure all values are integers for Sharp
      cropX = Math.round(cropX);
      cropY = Math.round(cropY);
      cropW = Math.round(cropW);
      cropH = Math.round(cropH);
      compositeX = Math.round(compositeX);
      compositeY = Math.round(compositeY);

      let compositeBuffer = finalBuffer;
      if (cropX > 0 || cropY > 0 || cropW !== childW || cropH !== childH) {
        compositeBuffer = await sharp(finalBuffer)
          .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
          .toBuffer();
      }

      compositeInputs.push({ input: compositeBuffer, left: compositeX, top: compositeY });
    } catch (error) {
      log.error(`[BatchExport] Failed to composite child ${child.id}:`, error);
    }
  }

  // Generate SVG overlay for spots and labels
  if ((includeSpots || includeLabels) && micrograph.spots && micrograph.spots.length > 0) {
    const longestSide = Math.max(baseWidth, baseHeight);
    const sizeMultiplier = longestSide / 1000;

    const basePointRadius = 6;
    const basePointStrokeWidth = 2;
    const baseLineStrokeWidth = 3;
    const baseFontSize = 16;
    const basePadding = 4;
    const baseOffset = 8;
    const baseCornerRadius = 3;

    const pointRadius = Math.round(basePointRadius * sizeMultiplier);
    const pointStrokeWidth = Math.round(basePointStrokeWidth * sizeMultiplier);
    const lineStrokeWidth = Math.round(baseLineStrokeWidth * sizeMultiplier);
    const fontSize = Math.round(baseFontSize * sizeMultiplier);
    const padding = Math.round(basePadding * sizeMultiplier);
    const labelOffset = Math.round(baseOffset * sizeMultiplier);
    const cornerRadius = Math.round(baseCornerRadius * sizeMultiplier);
    const charWidth = 8.5 * sizeMultiplier;

    const svgParts = [];
    svgParts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${baseWidth}" height="${baseHeight}">`);
    svgParts.push('<defs><style>text { font-family: Arial, sans-serif; font-weight: bold; }</style></defs>');

    for (const spot of micrograph.spots) {
      const geometryType = spot.geometryType || spot.geometry?.type;
      const color = convertColor(spot.color || '#00ff00');
      const labelColor = convertColor(spot.labelColor || '#ffffff');
      const opacity = (spot.opacity ?? 50) / 100;
      const showLabel = spot.showLabel !== false;

      if (includeSpots) {
        if (geometryType === 'point' || geometryType === 'Point') {
          const x = Array.isArray(spot.geometry?.coordinates)
            ? spot.geometry.coordinates[0]
            : spot.points?.[0]?.X ?? 0;
          const y = Array.isArray(spot.geometry?.coordinates)
            ? spot.geometry.coordinates[1]
            : spot.points?.[0]?.Y ?? 0;
          svgParts.push(`<circle cx="${x}" cy="${y}" r="${pointRadius}" fill="${color}" stroke="#ffffff" stroke-width="${pointStrokeWidth}"/>`);
        } else if (geometryType === 'line' || geometryType === 'LineString') {
          const coords = Array.isArray(spot.geometry?.coordinates)
            ? spot.geometry.coordinates
            : spot.points?.map(p => [p.X ?? 0, p.Y ?? 0]) || [];
          if (coords.length >= 2) {
            const pathData = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c[0]},${c[1]}`).join(' ');
            svgParts.push(`<path d="${pathData}" fill="none" stroke="${color}" stroke-width="${lineStrokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`);
          }
        } else if (geometryType === 'polygon' || geometryType === 'Polygon') {
          const coords = Array.isArray(spot.geometry?.coordinates)
            ? (spot.geometry.coordinates[0] || [])
            : spot.points?.map(p => [p.X ?? 0, p.Y ?? 0]) || [];
          if (coords.length >= 3) {
            const pointsStr = coords.map(c => `${c[0]},${c[1]}`).join(' ');
            svgParts.push(`<polygon points="${pointsStr}" fill="${color}" fill-opacity="${opacity}" stroke="${color}" stroke-width="${lineStrokeWidth}"/>`);
          }
        }
      }

      if (includeLabels && showLabel && spot.name) {
        let labelX = 0, labelY = 0;
        if (geometryType === 'point' || geometryType === 'Point') {
          labelX = (Array.isArray(spot.geometry?.coordinates) ? spot.geometry.coordinates[0] : spot.points?.[0]?.X) || 0;
          labelY = (Array.isArray(spot.geometry?.coordinates) ? spot.geometry.coordinates[1] : spot.points?.[0]?.Y) || 0;
        } else {
          const coords = Array.isArray(spot.geometry?.coordinates)
            ? (spot.geometry.coordinates[0] || spot.geometry.coordinates)
            : spot.points?.map(p => [p.X ?? 0, p.Y ?? 0]) || [];
          if (coords[0]) {
            labelX = coords[0][0] || coords[0];
            labelY = coords[0][1] || coords[1];
          }
        }
        const labelWidth = spot.name.length * charWidth + padding * 2;
        const labelHeight = fontSize + padding * 2;
        svgParts.push(`<rect x="${labelX + labelOffset}" y="${labelY + labelOffset}" width="${labelWidth}" height="${labelHeight}" rx="${cornerRadius}" fill="#000000" fill-opacity="0.7"/>`);
        svgParts.push(`<text x="${labelX + labelOffset + padding}" y="${labelY + labelOffset + fontSize + padding/2}" font-size="${fontSize}" fill="${labelColor}">${escapeXml(spot.name)}</text>`);
      }
    }

    svgParts.push('</svg>');
    const svgOverlay = Buffer.from(svgParts.join('\n'));
    compositeInputs.push({ input: svgOverlay, left: 0, top: 0 });
  }

  // Apply all composites
  let finalImage;
  if (compositeInputs.length > 0) {
    finalImage = baseImage.composite(compositeInputs);
  } else {
    finalImage = baseImage;
  }

  // Return JPEG buffer
  return await finalImage.jpeg({ quality: 95 }).toBuffer();
}

/**
 * Collect all micrographs from project (flattened list)
 */
function collectAllMicrographs(projectData) {
  const micrographs = [];
  for (const dataset of projectData.datasets || []) {
    for (const sample of dataset.samples || []) {
      for (const micrograph of sample.micrographs || []) {
        micrographs.push({
          micrograph,
          datasetName: dataset.name || 'Unknown Dataset',
          sampleName: sample.name || 'Unknown Sample',
        });
      }
    }
  }
  return micrographs;
}

/**
 * Export all micrographs to a ZIP file
 * Sends progress updates to renderer via IPC
 */
ipcMain.handle('project:export-all-images', async (event, projectId, projectData, format = 'jpeg') => {
  try {
    log.info(`[BatchExport] Starting batch export for project: ${projectId} (format: ${format})`);

    // Collect all micrographs
    const allMicrographs = collectAllMicrographs(projectData);
    const total = allMicrographs.length;

    if (total === 0) {
      return { success: false, error: 'No micrographs found in project' };
    }

    log.info(`[BatchExport] Found ${total} micrographs to export`);

    // Determine file extension based on format
    const fileExtension = format === 'svg' ? 'svg' : 'jpg';

    // Show save dialog for ZIP file
    const projectName = (projectData.name || 'project').replace(/[<>:"/\\|?*]/g, '_');
    const result = await dialog.showSaveDialog({
      title: 'Export All Images',
      defaultPath: `${projectName}_images.zip`,
      filters: [
        { name: 'ZIP Archive', extensions: ['zip'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true };
    }

    // Get project folder paths
    const folderPaths = await projectFolders.getProjectFolderPaths(projectId);

    // Create ZIP file
    const output = fs.createWriteStream(result.filePath);
    const archive = archiver('zip', { zlib: { level: 6 } });

    // Handle errors
    archive.on('error', (err) => {
      throw err;
    });

    // Pipe archive to output file
    archive.pipe(output);

    // Process each micrograph
    let completed = 0;
    const errors = [];

    // Import SVG export module if needed
    const svgExport = format === 'svg' ? require('./svgExport') : null;

    for (const { micrograph, datasetName, sampleName } of allMicrographs) {
      try {
        // Send progress update to renderer
        const progress = {
          current: completed + 1,
          total,
          currentName: micrograph.name || 'Unnamed',
          status: 'processing'
        };
        event.sender.send('export-all-images:progress', progress);

        log.info(`[BatchExport] Processing ${completed + 1}/${total}: ${micrograph.name}`);

        // Create filename (sanitize for ZIP)
        const cleanName = (micrograph.name || 'micrograph').replace(/[<>:"/\\|?*]/g, '_');
        const filename = `${cleanName}.${fileExtension}`;

        if (format === 'svg') {
          // Generate SVG
          const { svg } = await svgExport.exportMicrographAsSvg(projectId, micrograph.id, projectData, folderPaths);
          archive.append(svg, { name: filename });
        } else {
          // Generate JPEG composite buffer
          const buffer = await generateCompositeBuffer(projectId, micrograph, projectData, folderPaths);
          archive.append(buffer, { name: filename });
        }

        completed++;
      } catch (error) {
        log.error(`[BatchExport] Error processing ${micrograph.name}:`, error);
        errors.push({
          micrographId: micrograph.id,
          name: micrograph.name,
          error: error.message
        });
        completed++;
      }
    }

    // Finalize archive
    await archive.finalize();

    // Wait for output stream to finish
    await new Promise((resolve, reject) => {
      output.on('close', resolve);
      output.on('error', reject);
    });

    // Send completion
    event.sender.send('export-all-images:progress', {
      current: total,
      total,
      currentName: '',
      status: 'complete'
    });

    log.info(`[BatchExport] Export complete: ${result.filePath} (${completed} images)`);

    return {
      success: true,
      filePath: result.filePath,
      exported: completed,
      errors: errors.length > 0 ? errors : undefined
    };

  } catch (error) {
    log.error('[BatchExport] Export failed:', error);
    event.sender.send('export-all-images:progress', {
      current: 0,
      total: 0,
      currentName: '',
      status: 'error',
      error: error.message
    });
    throw error;
  }
});

/**
 * Convert SimpleCoord to legacy format (uppercase X/Y)
 */
function convertCoordToLegacy(coord) {
  if (!coord) return null;
  return {
    X: coord.X ?? coord.x ?? null,
    Y: coord.Y ?? coord.y ?? null
  };
}

/**
 * Convert GeoJSON geometry to legacy points array format
 * Legacy format: geometryType + points array of {X, Y} objects
 */
function convertGeometryToLegacy(geometry) {
  if (!geometry) return { geometryType: null, points: null };

  const geometryType = geometry.type || null;
  let points = null;

  if (geometry.coordinates) {
    switch (geometry.type) {
      case 'Point':
        // [x, y] -> [{X, Y}]
        points = [{ X: geometry.coordinates[0], Y: geometry.coordinates[1] }];
        break;
      case 'LineString':
        // [[x,y], [x,y], ...] -> [{X,Y}, {X,Y}, ...]
        points = geometry.coordinates.map(coord => ({ X: coord[0], Y: coord[1] }));
        break;
      case 'Polygon':
        // [[[x,y], [x,y], ...]] -> [{X,Y}, {X,Y}, ...] (first ring only)
        if (geometry.coordinates[0]) {
          points = geometry.coordinates[0].map(coord => ({ X: coord[0], Y: coord[1] }));
        }
        break;
    }
  }

  return { geometryType, points };
}

/**
 * Sanitize spot for legacy JSON export
 */
function sanitizeSpotForExport(spot) {
  if (!spot) return null;

  // Convert geometry to legacy format if present
  const { geometryType, points } = spot.geometry
    ? convertGeometryToLegacy(spot.geometry)
    : { geometryType: spot.geometryType || null, points: spot.points || null };

  // Convert points array to legacy format (uppercase X/Y)
  const legacyPoints = points ? points.map(p => convertCoordToLegacy(p)) : null;

  // Build legacy spot object - exclude runtime-only fields
  const legacySpot = {
    id: spot.id || null,
    name: spot.name || null,
    labelColor: spot.labelColor || null,
    showLabel: spot.showLabel ?? null,
    color: spot.color || null,
    date: spot.date || null,
    time: spot.time || null,
    notes: spot.notes || null,
    modifiedTimestamp: spot.modifiedTimestamp ?? null,
    geometryType: geometryType,
    points: legacyPoints,
    // Feature info types
    mineralogy: spot.mineralogy || null,
    grainInfo: spot.grainInfo || null,
    fabricInfo: spot.fabricInfo || null,
    clasticDeformationBandInfo: spot.clasticDeformationBandInfo || null,
    grainBoundaryInfo: spot.grainBoundaryInfo || null,
    intraGrainInfo: spot.intraGrainInfo || null,
    veinInfo: spot.veinInfo || null,
    pseudotachylyteInfo: spot.pseudotachylyteInfo || null,
    foldInfo: spot.foldInfo || null,
    faultsShearZonesInfo: spot.faultsShearZonesInfo || null,
    extinctionMicrostructureInfo: spot.extinctionMicrostructureInfo || null,
    lithologyInfo: spot.lithologyInfo || null,
    fractureInfo: spot.fractureInfo || null,
    // Supporting data
    associatedFiles: spot.associatedFiles || null,
    links: spot.links || null,
    tags: spot.tags || null
  };

  // Remove null/undefined values to keep JSON clean (optional, but matches legacy behavior)
  return Object.fromEntries(Object.entries(legacySpot).filter(([_, v]) => v !== undefined));
}

/**
 * Sanitize micrograph for legacy JSON export
 */
function sanitizeMicrographForExport(micrograph) {
  if (!micrograph) return null;

  // Build legacy micrograph object - exclude runtime-only fields
  const legacyMicrograph = {
    id: micrograph.id || null,
    parentID: micrograph.parentID || null,
    name: micrograph.name || null,
    imageType: micrograph.imageType || null,
    width: micrograph.width ?? micrograph.imageWidth ?? null,
    height: micrograph.height ?? micrograph.imageHeight ?? null,
    opacity: micrograph.opacity ?? null,
    scale: micrograph.scale || null,
    polish: micrograph.polish ?? null,
    polishDescription: micrograph.polishDescription || null,
    description: micrograph.description || null,
    notes: micrograph.notes || null,
    scalePixelsPerCentimeter: micrograph.scalePixelsPerCentimeter ?? null,
    offsetInParent: convertCoordToLegacy(micrograph.offsetInParent),
    pointInParent: convertCoordToLegacy(micrograph.pointInParent),
    rotation: micrograph.rotation ?? null,
    // Feature info types
    mineralogy: micrograph.mineralogy || null,
    grainInfo: micrograph.grainInfo || null,
    fabricInfo: micrograph.fabricInfo || null,
    orientationInfo: micrograph.orientationInfo || null,
    clasticDeformationBandInfo: micrograph.clasticDeformationBandInfo || null,
    grainBoundaryInfo: micrograph.grainBoundaryInfo || null,
    intraGrainInfo: micrograph.intraGrainInfo || null,
    veinInfo: micrograph.veinInfo || null,
    pseudotachylyteInfo: micrograph.pseudotachylyteInfo || null,
    foldInfo: micrograph.foldInfo || null,
    faultsShearZonesInfo: micrograph.faultsShearZonesInfo || null,
    extinctionMicrostructureInfo: micrograph.extinctionMicrostructureInfo || null,
    lithologyInfo: micrograph.lithologyInfo || null,
    fractureInfo: micrograph.fractureInfo || null,
    // Supporting data
    instrument: micrograph.instrument || null,
    associatedFiles: micrograph.associatedFiles || null,
    links: micrograph.links || null,
    // UI/visibility state
    isMicroVisible: micrograph.isMicroVisible ?? null,
    isExpanded: micrograph.isExpanded ?? null,
    isSpotExpanded: micrograph.isSpotExpanded ?? null,
    isFlipped: micrograph.isFlipped ?? micrograph.flipped ?? null,
    tags: micrograph.tags || null,
    // Spots (recursively sanitize)
    spots: micrograph.spots ? micrograph.spots.map(s => sanitizeSpotForExport(s)) : null
  };

  return Object.fromEntries(Object.entries(legacyMicrograph).filter(([_, v]) => v !== undefined));
}

/**
 * Sanitize sample for legacy JSON export
 * Maps modern 'name' field to legacy 'label' field
 */
function sanitizeSampleForExport(sample) {
  if (!sample) return null;

  const legacySample = {
    id: sample.id || null,
    existsOnServer: sample.existsOnServer ?? null,
    // Map 'name' to 'label' for legacy compatibility
    label: sample.label || sample.name || null,
    sampleID: sample.sampleID || null,
    longitude: sample.longitude ?? null,
    latitude: sample.latitude ?? null,
    mainSamplingPurpose: sample.mainSamplingPurpose || null,
    sampleDescription: sample.sampleDescription || null,
    materialType: sample.materialType || null,
    inplacenessOfSample: sample.inplacenessOfSample || null,
    orientedSample: sample.orientedSample || null,
    sampleSize: sample.sampleSize || null,
    degreeOfWeathering: sample.degreeOfWeathering || null,
    sampleNotes: sample.sampleNotes || null,
    sampleType: sample.sampleType || null,
    color: sample.color || null,
    lithology: sample.lithology || null,
    sampleUnit: sample.sampleUnit || null,
    otherMaterialType: sample.otherMaterialType || null,
    sampleOrientationNotes: sample.sampleOrientationNotes || null,
    otherSamplingPurpose: sample.otherSamplingPurpose || null,
    // UI state
    isExpanded: sample.isExpanded ?? null,
    isSpotExpanded: sample.isSpotExpanded ?? null,
    // Micrographs (recursively sanitize)
    micrographs: sample.micrographs ? sample.micrographs.map(m => sanitizeMicrographForExport(m)) : null
  };

  return Object.fromEntries(Object.entries(legacySample).filter(([_, v]) => v !== undefined));
}

/**
 * Sanitize dataset for legacy JSON export
 */
function sanitizeDatasetForExport(dataset) {
  if (!dataset) return null;

  const legacyDataset = {
    id: dataset.id || null,
    name: dataset.name || null,
    date: dataset.date || null,
    modifiedTimestamp: dataset.modifiedTimestamp || null,
    samples: dataset.samples ? dataset.samples.map(s => sanitizeSampleForExport(s)) : null
  };

  return Object.fromEntries(Object.entries(legacyDataset).filter(([_, v]) => v !== undefined));
}

/**
 * Sanitize group for legacy JSON export
 */
function sanitizeGroupForExport(group) {
  if (!group) return null;

  const legacyGroup = {
    id: group.id || null,
    name: group.name || null,
    micrographs: group.micrographs || null,
    isExpanded: group.isExpanded ?? null
  };

  return Object.fromEntries(Object.entries(legacyGroup).filter(([_, v]) => v !== undefined));
}

/**
 * Sanitize tag for legacy JSON export
 */
function sanitizeTagForExport(tag) {
  if (!tag) return null;

  const legacyTag = {
    id: tag.id || null,
    name: tag.name || null,
    tagType: tag.tagType || null,
    tagSubtype: tag.tagSubtype || null,
    otherConcept: tag.otherConcept || null,
    otherDocumentation: tag.otherDocumentation || null,
    otherTagType: tag.otherTagType || null,
    lineColor: tag.lineColor || null,
    fillColor: tag.fillColor || null,
    transparency: tag.transparency ?? null,
    tagSize: tag.tagSize ?? null,
    notes: tag.notes || null
  };

  return Object.fromEntries(Object.entries(legacyTag).filter(([_, v]) => v !== undefined));
}

/**
 * Sanitize entire project for legacy JSON export
 * Removes runtime-only fields and maps modern fields to legacy equivalents
 */
function sanitizeProjectForExport(project) {
  if (!project) return null;

  const legacyProject = {
    id: project.id || null,
    name: project.name || null,
    startDate: project.startDate || null,
    endDate: project.endDate || null,
    purposeOfStudy: project.purposeOfStudy || null,
    otherTeamMembers: project.otherTeamMembers || null,
    areaOfInterest: project.areaOfInterest || null,
    instrumentsUsed: project.instrumentsUsed || null,
    gpsDatum: project.gpsDatum || null,
    magneticDeclination: project.magneticDeclination || null,
    notes: project.notes || null,
    date: project.date || null,
    modifiedTimestamp: project.modifiedTimestamp || null,
    projectLocation: project.projectLocation || null,
    // Arrays (recursively sanitize)
    datasets: project.datasets ? project.datasets.map(d => sanitizeDatasetForExport(d)) : null,
    groups: project.groups ? project.groups.map(g => sanitizeGroupForExport(g)) : null,
    tags: project.tags ? project.tags.map(t => sanitizeTagForExport(t)) : null
  };

  return Object.fromEntries(Object.entries(legacyProject).filter(([_, v]) => v !== undefined));
}

/**
 * Export project data as JSON file
 */
ipcMain.handle('project:export-json', async (event, projectData) => {
  try {
    log.info('[ExportJSON] Starting JSON export');

    // Show save dialog
    const projectName = (projectData.name || 'project').replace(/[<>:"/\\|?*]/g, '_');
    const result = await dialog.showSaveDialog({
      title: 'Export Project as JSON',
      defaultPath: `${projectName}.json`,
      filters: [
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true };
    }

    // Use the project serializer for proper formatting and numeric rounding
    // This ensures consistency with SMZ export and server upload
    const legacyProjectData = projectSerializer.serializeToLegacyFormat(projectData);

    // Write JSON file with pretty formatting
    const jsonContent = JSON.stringify(legacyProjectData, null, 2);
    fs.writeFileSync(result.filePath, jsonContent, 'utf8');

    log.info(`[ExportJSON] Export complete: ${result.filePath}`);

    return {
      success: true,
      filePath: result.filePath
    };

  } catch (error) {
    log.error('[ExportJSON] Export failed:', error);
    throw error;
  }
});

/**
 * Get serialized project JSON (for debug preview before upload)
 */
ipcMain.handle('project:get-serialized-json', async (event, projectData) => {
  try {
    const legacyProjectData = projectSerializer.serializeToLegacyFormat(projectData);
    return JSON.stringify(legacyProjectData, null, 2);
  } catch (error) {
    log.error('[GetSerializedJSON] Failed:', error);
    throw error;
  }
});

/**
 * Export project as PDF file
 * Generates a comprehensive PDF report with all project data and composite images
 */
ipcMain.handle('project:export-pdf', async (event, projectId, projectData) => {
  try {
    log.info('[ExportPDF] Starting PDF export');

    // Show save dialog
    const projectName = (projectData.name || 'project').replace(/[<>:"/\\|?*]/g, '_');
    const result = await dialog.showSaveDialog({
      title: 'Export Project as PDF',
      defaultPath: `${projectName}_report.pdf`,
      filters: [
        { name: 'PDF Files', extensions: ['pdf'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true };
    }

    // Get project folder paths
    const folderPaths = await projectFolders.getProjectFolderPaths(projectId);

    // Progress callback to send updates to renderer
    const progressCallback = (progress) => {
      event.sender.send('export-pdf:progress', progress);
    };

    // Generate PDF with composite image generator
    await pdfProjectExport.generateProjectPDF(
      result.filePath,
      projectData,
      projectId,
      folderPaths,
      generateCompositeBuffer, // Pass the existing composite generator
      progressCallback
    );

    log.info(`[ExportPDF] Export complete: ${result.filePath}`);

    return {
      success: true,
      filePath: result.filePath
    };

  } catch (error) {
    log.error('[ExportPDF] Export failed:', error);
    event.sender.send('export-pdf:progress', {
      phase: 'Error',
      current: 0,
      total: 0,
      itemName: '',
      percentage: 0,
      error: error.message
    });
    throw error;
  }
});

// =============================================================================
// EXPORT PROJECT AS .SMZ ARCHIVE
// =============================================================================

/**
 * Export project as .smz file
 * Generates all required image variants and packages them with project data
 */
ipcMain.handle('project:export-smz', async (event, projectId, projectData) => {
  try {
    log.info('[ExportSMZ] Starting .smz export');

    // Show save dialog with overwrite confirmation
    const projectName = (projectData.name || 'project').replace(/[<>:"/\\|?*]/g, '_');
    // Add timestamp: YYYY-MM-DD_HH-MM-SS
    const now = new Date();
    const timestamp = now.toISOString()
      .replace(/T/, '_')
      .replace(/:/g, '-')
      .replace(/\..+/, '');
    const result = await dialog.showSaveDialog({
      title: 'Export Project as .smz',
      defaultPath: `${projectName}_${timestamp}.smz`,
      filters: [
        { name: 'StraboMicro Project', extensions: ['smz'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['createDirectory', 'showOverwriteConfirmation']
    });

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true };
    }

    // Check if file exists and prompt for overwrite (belt and suspenders)
    if (fs.existsSync(result.filePath)) {
      const { response } = await dialog.showMessageBox({
        type: 'question',
        buttons: ['Overwrite', 'Cancel'],
        defaultId: 1,
        title: 'File Exists',
        message: `"${path.basename(result.filePath)}" already exists. Do you want to replace it?`,
        detail: 'Replacing it will overwrite its current contents.',
      });

      if (response === 1) {
        return { success: false, canceled: true };
      }
    }

    // Get project folder paths
    const folderPaths = await projectFolders.getProjectFolderPaths(projectId);

    // Progress callback to send updates to renderer
    const progressCallback = (progress) => {
      event.sender.send('export-smz:progress', progress);
    };

    // PDF generator wrapper that uses the existing React-PDF generator
    const pdfGenerator = async (outputPath, projData, projId, paths, progressCb) => {
      await pdfProjectExport.generateProjectPDF(
        outputPath,
        projData,
        projId,
        paths,
        generateCompositeBuffer, // Use the existing composite generator (with spots) for PDF
        progressCb
      );
    };

    // Export .smz
    const exportResult = await smzExport.exportSmz(
      result.filePath,
      projectId,
      projectData,
      folderPaths,
      progressCallback,
      pdfGenerator,
      projectSerializer
    );

    if (exportResult.success) {
      log.info(`[ExportSMZ] Export complete: ${result.filePath}`);
    } else {
      log.error(`[ExportSMZ] Export failed: ${exportResult.error}`);
    }

    return exportResult;

  } catch (error) {
    log.error('[ExportSMZ] Export failed:', error);
    event.sender.send('export-smz:progress', {
      phase: 'Error',
      current: 0,
      total: 0,
      itemName: '',
      percentage: 0,
      error: error.message
    });
    throw error;
  }
});

// =============================================================================
// PUSH PROJECT TO SERVER
// =============================================================================

/**
 * Check server connectivity
 */
ipcMain.handle('server:check-connectivity', async () => {
  return serverUpload.checkConnectivity();
});

/**
 * Check if project exists on server
 */
ipcMain.handle('server:check-project-exists', async (event, projectId) => {
  try {
    // Get valid token with auto-refresh
    const tokenResult = await tokenService.getValidAccessToken();
    if (!tokenResult.success) {
      return { exists: false, error: tokenResult.error, sessionExpired: tokenResult.sessionExpired };
    }
    return serverUpload.checkProjectExists(projectId, tokenResult.accessToken);
  } catch (error) {
    log.error('[ServerUpload] Check project exists failed:', error);
    return { exists: false, error: error.message };
  }
});

/**
 * Push project to server
 * Main handler that orchestrates the entire upload process
 */
ipcMain.handle('server:push-project', async (event, projectId, projectData, options) => {
  try {
    log.info('[ServerUpload] Starting push-to-server for project:', projectId);

    const { overwrite = false } = options || {};

    // Get valid token with auto-refresh
    const tokenResult = await tokenService.getValidAccessToken();
    if (!tokenResult.success) {
      return { success: false, error: tokenResult.error, sessionExpired: tokenResult.sessionExpired };
    }

    // Get project folder paths
    const folderPaths = await projectFolders.getProjectFolderPaths(projectId);

    // Progress callback to send updates to renderer
    const progressCallback = (progress) => {
      event.sender.send('server:push-progress', progress);
    };

    // PDF generator wrapper (same as export-smz)
    const pdfGenerator = async (outputPath, projData, projId, paths, progressCb) => {
      await pdfProjectExport.generateProjectPDF(
        outputPath,
        projData,
        projId,
        paths,
        generateCompositeBuffer,
        progressCb
      );
    };

    // Execute the push
    const result = await serverUpload.pushProject({
      projectId,
      projectData,
      folderPaths,
      accessToken: tokenResult.accessToken,
      overwrite,
      progressCallback,
      pdfGenerator,
      projectSerializer,
    });

    if (result.success) {
      log.info('[ServerUpload] Push completed successfully');
    } else if (result.needsOverwriteConfirm) {
      log.info('[ServerUpload] Project exists, awaiting overwrite confirmation');
    } else {
      log.error('[ServerUpload] Push failed:', result.error);
    }

    return result;

  } catch (error) {
    log.error('[ServerUpload] Push failed with exception:', error);
    event.sender.send('server:push-progress', {
      phase: serverUpload.UploadPhase.ERROR,
      percentage: 0,
      message: error.message,
    });
    return { success: false, error: error.message };
  }
});

// =============================================================================
// VERSION HISTORY
// =============================================================================

/**
 * Create a new version snapshot
 */
ipcMain.handle('version:create', async (event, projectId, projectState, name, description) => {
  log.info('[VersionHistory] Creating version for project:', projectId, name ? `(named: ${name})` : '(auto-save)');
  return versionHistory.createVersion(projectId, projectState, name, description);
});

/**
 * List all versions for a project
 */
ipcMain.handle('version:list', async (event, projectId) => {
  return versionHistory.listVersions(projectId);
});

/**
 * Get a specific version's data (including full project snapshot)
 */
ipcMain.handle('version:get', async (event, projectId, versionNumber) => {
  return versionHistory.getVersion(projectId, versionNumber);
});

/**
 * Get version metadata only (without loading full project)
 */
ipcMain.handle('version:get-info', async (event, projectId, versionNumber) => {
  return versionHistory.getVersionInfo(projectId, versionNumber);
});

/**
 * Restore a specific version
 */
ipcMain.handle('version:restore', async (event, projectId, versionNumber) => {
  log.info('[VersionHistory] Restoring version', versionNumber, 'for project:', projectId);
  return versionHistory.restoreVersion(projectId, versionNumber);
});

/**
 * Delete a specific version
 */
ipcMain.handle('version:delete', async (event, projectId, versionNumber) => {
  log.info('[VersionHistory] Deleting version', versionNumber, 'for project:', projectId);
  return versionHistory.deleteVersion(projectId, versionNumber);
});

/**
 * Clear all version history for a project
 * Called when opening new project, downloading from server, or creating new project
 */
ipcMain.handle('version:clear', async (event, projectId) => {
  log.info('[VersionHistory] Clearing history for project:', projectId);
  return versionHistory.clearHistory(projectId);
});

/**
 * Compute diff between two versions
 */
ipcMain.handle('version:diff', async (event, projectId, versionA, versionB) => {
  return versionHistory.computeDiff(projectId, versionA, versionB);
});

/**
 * Create a named version (checkpoint)
 */
ipcMain.handle('version:create-named', async (event, projectId, projectState, name, description) => {
  log.info('[VersionHistory] Creating named version for project:', projectId, 'name:', name);
  return versionHistory.createVersion(projectId, projectState, name, description);
});

/**
 * Get storage statistics for a project's version history
 */
ipcMain.handle('version:stats', async (event, projectId) => {
  return versionHistory.getStats(projectId);
});

/**
 * Manually trigger pruning (normally runs automatically after create)
 */
ipcMain.handle('version:prune', async (event, projectId) => {
  log.info('[VersionHistory] Manual prune requested for project:', projectId);
  return versionHistory.pruneVersions(projectId);
});

// =============================================================================
// PROJECTS INDEX HANDLERS (Recent Projects)
// =============================================================================

/**
 * Rebuild the projects index from disk
 * Called on app startup
 */
ipcMain.handle('projects:rebuild-index', async () => {
  log.info('[ProjectsIndex] Rebuilding index...');
  return projectsIndex.rebuildIndex();
});

/**
 * Get recent projects (up to limit)
 */
ipcMain.handle('projects:get-recent', async (event, limit) => {
  return projectsIndex.getRecentProjects(limit);
});

/**
 * Get all projects in the index
 */
ipcMain.handle('projects:get-all', async () => {
  return projectsIndex.getAllProjects();
});

/**
 * Update the lastOpened timestamp for a project
 * Called when opening or saving a project
 */
ipcMain.handle('projects:update-opened', async (event, projectId, projectName) => {
  return projectsIndex.updateProjectOpened(projectId, projectName);
});

/**
 * Remove a project from the index
 * Called when deleting a project
 */
ipcMain.handle('projects:remove', async (event, projectId) => {
  return projectsIndex.removeProject(projectId);
});

/**
 * Close (delete) a project completely
 * - Removes project folder from disk
 * - Removes from projects index
 * - Clears version history
 * - Refreshes menu
 */
ipcMain.handle('projects:close', async (event, projectId) => {
  log.info('[Projects] Closing (deleting) project:', projectId);

  try {
    // 1. Clear version history
    await versionHistory.clearHistory(projectId);
    log.info('[Projects] Cleared version history');

    // 2. Delete project folder from disk
    await projectFolders.deleteProjectFolder(projectId);
    log.info('[Projects] Deleted project folder');

    // 3. Remove from projects index
    await projectsIndex.removeProject(projectId);
    log.info('[Projects] Removed from index');

    // 4. Refresh menu to update Recent Projects
    if (buildMenuFn) {
      await buildMenuFn();
    }

    return { success: true };
  } catch (error) {
    log.error('[Projects] Error closing project:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Load a project from disk by its ID
 * Returns the full project data
 */
ipcMain.handle('projects:load', async (event, projectId) => {
  log.info('[ProjectsIndex] Loading project:', projectId);
  try {
    const project = await projectSerializer.loadProjectJson(projectId);
    // Update lastOpened in index
    await projectsIndex.updateProjectOpened(projectId, project.name);
    // Refresh menu to show updated recent projects
    if (buildMenuFn) {
      await buildMenuFn();
    }
    return { success: true, project };
  } catch (error) {
    log.error('[ProjectsIndex] Error loading project:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Refresh the Recent Projects menu
 * Called from renderer after saving/creating a project
 */
ipcMain.handle('projects:refresh-menu', async () => {
  log.info('[ProjectsIndex] Refreshing menu...');
  if (buildMenuFn) {
    await buildMenuFn();
  }
});

/**
 * ============================================================================
 * SMZ IMPORT HANDLERS
 * ============================================================================
 */

/**
 * Show file dialog to select an .smz file
 * Returns the selected file path or null if cancelled
 */
ipcMain.handle('smz:select-file', async () => {
  log.info('[SmzImport] Opening file selection dialog...');
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open StraboMicro Project',
    filters: [
      { name: 'StraboMicro Project', extensions: ['smz'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile']
  });

  if (result.canceled || result.filePaths.length === 0) {
    log.info('[SmzImport] File selection cancelled');
    return { cancelled: true };
  }

  const filePath = result.filePaths[0];
  log.info('[SmzImport] Selected file:', filePath);
  return { cancelled: false, filePath };
});

/**
 * Inspect an .smz file to get project info without importing
 * Used to check if project exists locally and show confirmation dialog
 */
ipcMain.handle('smz:inspect', async (event, smzPath) => {
  log.info('[SmzImport] Inspecting .smz file:', smzPath);
  return smzImport.inspectSmz(smzPath);
});

/**
 * Import an .smz file (DESTRUCTIVE - replaces existing project)
 * Progress updates are sent via 'smz:import-progress' event
 */
ipcMain.handle('smz:import', async (event, smzPath) => {
  log.info('[SmzImport] Starting import of:', smzPath);

  const result = await smzImport.importSmz(smzPath, (progress) => {
    // Send progress updates to renderer
    if (mainWindow) {
      mainWindow.webContents.send('smz:import-progress', progress);
    }
  });

  // If successful, update projects index and refresh menu
  if (result.success && result.projectId) {
    const projectName = result.projectData?.name || 'Untitled Project';
    await projectsIndex.updateProjectOpened(result.projectId, projectName);

    if (buildMenuFn) {
      await buildMenuFn();
    }
  }

  return result;
});

/**
 * ============================================================================
 * SERVER DOWNLOAD HANDLERS (Open Remote Project)
 * ============================================================================
 */

/**
 * List user's remote projects from the server
 * Requires authentication (JWT token)
 */
ipcMain.handle('server:list-projects', async () => {
  log.info('[ServerDownload] Listing remote projects...');

  // Get valid token with auto-refresh
  const tokenResult = await tokenService.getValidAccessToken();
  if (!tokenResult.success) {
    log.warn('[ServerDownload] Not authenticated or session expired');
    return { success: false, error: tokenResult.error, sessionExpired: tokenResult.sessionExpired };
  }

  return serverDownload.listProjects(tokenResult.accessToken);
});

/**
 * Download a project from the server
 * Returns the path to the downloaded .zip file for inspection/import
 */
ipcMain.handle('server:download-project', async (event, projectId) => {
  log.info('[ServerDownload] Downloading project:', projectId);

  // Get valid token with auto-refresh
  const tokenResult = await tokenService.getValidAccessToken();
  if (!tokenResult.success) {
    log.warn('[ServerDownload] Not authenticated or session expired');
    return { success: false, error: tokenResult.error, sessionExpired: tokenResult.sessionExpired };
  }

  const result = await serverDownload.downloadProject(
    projectId,
    tokenResult.accessToken,
    (progress) => {
      // Send progress updates to renderer
      if (mainWindow) {
        mainWindow.webContents.send('server:download-progress', progress);
      }
    }
  );

  return result;
});

/**
 * Clean up a downloaded temp file
 */
ipcMain.handle('server:cleanup-download', async (event, zipPath) => {
  log.info('[ServerDownload] Cleaning up:', zipPath);
  await serverDownload.cleanupDownload(zipPath);
  return { success: true };
});

/**
 * Download a shared project by share code
 * The share code is a 6-character alphanumeric string that resolves to a download key
 */
ipcMain.handle('server:download-shared-project', async (event, shareCode) => {
  log.info('[ServerDownload] Downloading shared project with code:', shareCode);

  // Get valid token with auto-refresh
  const tokenResult = await tokenService.getValidAccessToken();
  if (!tokenResult.success) {
    log.warn('[ServerDownload] Not authenticated or session expired');
    return { success: false, error: tokenResult.error, sessionExpired: tokenResult.sessionExpired };
  }

  const result = await serverDownload.downloadSharedProject(
    shareCode,
    tokenResult.accessToken,
    (progress) => {
      // Send progress updates to renderer
      if (mainWindow) {
        mainWindow.webContents.send('server:download-progress', progress);
      }
    }
  );

  return result;
});

// =============================================================================
// LOG SERVICE IPC HANDLERS
// =============================================================================

/**
 * Read the current log file contents
 */
ipcMain.handle('logs:read', async () => {
  return logService.readLog();
});

/**
 * Get the path to the log file
 */
ipcMain.handle('logs:get-path', async () => {
  return logService.getLogPath();
});

/**
 * Write a log entry from the renderer process
 * Used to capture console.error() messages
 */
ipcMain.handle('logs:write', async (event, level, message, source) => {
  logService.fromRenderer(level, message, source);
  return { success: true };
});

/**
 * Send error report to StraboSpot server
 * Sends: notes (user description), appversion, log_file
 */
ipcMain.handle('logs:send-report', async (event, notes) => {
  const FormData = require('form-data');
  const https = require('https');
  const fs = require('fs');

  try {
    log.info('[ErrorReport] Sending error report to server...');

    // Get valid token with auto-refresh
    const tokenResult = await tokenService.getValidAccessToken();
    if (!tokenResult.success) {
      log.warn('[ErrorReport] Not authenticated or session expired');
      return { success: false, error: tokenResult.error, sessionExpired: tokenResult.sessionExpired };
    }

    // Get app version
    const appVersion = app.getVersion();

    // Get log file path and read contents
    const logPath = logService.getLogPath();
    if (!fs.existsSync(logPath)) {
      log.warn('[ErrorReport] Log file not found:', logPath);
      return { success: false, error: 'Log file not found' };
    }

    // Create form data
    const form = new FormData();
    form.append('notes', notes);
    form.append('appversion', `v${appVersion}`);
    form.append('log_file', fs.createReadStream(logPath), {
      filename: 'app.log',
      contentType: 'text/plain',
    });

    // Parse the upload URL
    const uploadUrl = new URL('https://strabospot.org/jwtmicrodb/logs');

    return new Promise((resolve) => {
      const options = {
        hostname: uploadUrl.hostname,
        port: 443,
        path: uploadUrl.pathname,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenResult.accessToken}`,
          ...form.getHeaders(),
        },
      };

      const req = https.request(options, (res) => {
        let responseData = '';

        res.on('data', (chunk) => {
          responseData += chunk;
        });

        res.on('end', () => {
          log.info('[ErrorReport] Server response (status ' + res.statusCode + '):', responseData);

          if (res.statusCode === 401) {
            resolve({ success: false, error: 'Session expired. Please log in again.', sessionExpired: true });
            return;
          }

          if (res.statusCode < 200 || res.statusCode >= 300) {
            let errorMessage = `Server error: ${res.statusCode}`;
            try {
              const errorJson = JSON.parse(responseData);
              if (errorJson.Error) {
                errorMessage = errorJson.Error;
              }
            } catch {
              // Use default error message
            }
            resolve({ success: false, error: errorMessage });
            return;
          }

          try {
            const result = JSON.parse(responseData);
            if (result.Status === 'Success') {
              log.info('[ErrorReport] Error report sent successfully');
              resolve({ success: true });
            } else if (result.Error) {
              resolve({ success: false, error: result.Error });
            } else {
              resolve({ success: true });
            }
          } catch (parseError) {
            log.error('[ErrorReport] Failed to parse response:', parseError);
            resolve({ success: false, error: 'Invalid server response' });
          }
        });
      });

      req.on('error', (error) => {
        log.error('[ErrorReport] Request error:', error);
        resolve({ success: false, error: error.message });
      });

      // Pipe the form data to the request
      form.pipe(req);
    });
  } catch (error) {
    log.error('[ErrorReport] Failed to send error report:', error);
    return { success: false, error: error.message };
  }
});
