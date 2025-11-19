const { app, BrowserWindow, Menu, ipcMain, dialog, screen, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const log = require('electron-log');
const projectFolders = require('./projectFolders');
const imageConverter = require('./imageConverter');

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

// ========== Tile-Based Image Loading System ==========
// Import tile cache and generator
const tileCache = require('./tileCache');
const tileGenerator = require('./tileGenerator');

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
 */
ipcMain.handle('image:load-medium', async (event, imageHash) => {
  try {
    const buffer = await tileCache.loadMedium(imageHash);

    if (!buffer) {
      throw new Error(`Medium resolution not found for hash: ${imageHash}`);
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
    return `data:image/png;base64,${base64}`;
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
        dataUrl: `data:image/png;base64,${base64}`,
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
 * ============================================================================
 * IMAGE CONVERSION HANDLERS
 * ============================================================================
 */

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
