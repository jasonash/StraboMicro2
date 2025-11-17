const { app, BrowserWindow, Menu, ipcMain, dialog, screen, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const log = require('electron-log');

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

  // Create menu
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
          label: 'Open Project',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:open-project');
            }
          }
        },
        {
          label: 'Edit Project',
          accelerator: 'CmdOrCtrl+E',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:edit-project');
            }
          }
        },
        { label: 'Save', accelerator: 'CmdOrCtrl+S' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Account',
      submenu: [
        { label: 'Login' },
        { label: 'Logout' },
        { type: 'separator' },
        { label: 'Settings' },
      ],
    },
    {
      label: 'View',
      submenu: [
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
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Documentation' },
        { label: 'About StraboMicro' },
      ],
    },
    {
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
          label: 'Show Project Structure',
          accelerator: 'CmdOrCtrl+Shift+D',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:show-project-debug');
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
        { type: 'separator' },
        { role: 'toggleDevTools' },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

  // Load the app
  const isDev = process.env.NODE_ENV !== 'production';

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

  mainWindow.on('close', () => {
    // Save final window state before closing
    saveWindowState();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  const isDev = process.env.NODE_ENV !== 'production';

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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// =============================================================================
// IPC HANDLERS
// =============================================================================

// File dialog for TIFF selection
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
