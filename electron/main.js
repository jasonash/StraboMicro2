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
const sharp = require('sharp');
const projectFolders = require('./projectFolders');
const imageConverter = require('./imageConverter');
const projectSerializer = require('./projectSerializer');
const scratchSpace = require('./scratchSpace');
const pdfExport = require('./pdfExport');

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

  // Clean up scratch space on startup
  await scratchSpace.cleanupAll();

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

// Generic file dialog for associated files
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

        // Apply rotation if needed
        if (child.rotation) {
          // Calculate center position for rotation
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

          // Adjust position to account for rotation
          const adjustedX = Math.round(centerX - rotatedWidth / 2);
          const adjustedY = Math.round(centerY - rotatedHeight / 2);

          log.info(`[IPC]   Rotation: ${child.rotation}°, Rotated size: ${Math.round(rotatedWidth)}x${Math.round(rotatedHeight)}`);

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
        // Continue with other children
      }
    }

    // Apply composites to base image
    const compositeImage = sharp(baseBuffer).composite(compositeInputs);

    // Save to compositeThumbnails folder (JPEG with no extension)
    const outputPath = path.join(folderPaths.compositeThumbnails, micrographId);
    await compositeImage.jpeg({ quality: 85 }).toFile(outputPath);

    log.info(`[IPC] Successfully generated composite thumbnail: ${outputPath}`);

    return {
      success: true,
      thumbnailPath: outputPath,
      width: thumbWidth,
      height: thumbHeight
    };

  } catch (error) {
    log.error('[IPC] Error generating composite thumbnail:', error);
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
