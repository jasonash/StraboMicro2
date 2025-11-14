const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    backgroundColor: '#1e1e1e',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

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
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

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
    title: 'Select TIFF Image',
    filters: [
      { name: 'TIFF Images', extensions: ['tif', 'tiff'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile']
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

// TIFF image loading with RGB→RGBA conversion
ipcMain.handle('load-tiff-image', async (event, filePath) => {
  try {
    console.log(`Loading TIFF: ${filePath}`);

    // Dynamic import of ES Module
    const { decode } = await import('tiff');

    // Read and decode TIFF file
    const tiffData = fs.readFileSync(filePath);
    const images = decode(tiffData);

    if (!images || images.length === 0) {
      throw new Error('No images found in TIFF file');
    }

    const image = images[0]; // Use first image

    // Detect format: RGB (3 bytes/pixel) vs RGBA (4 bytes/pixel)
    const bytesPerPixel = image.data.length / (image.width * image.height);
    console.log(`TIFF decoded: ${image.width}x${image.height}, ${image.data.length} bytes, ${bytesPerPixel} bytes/pixel`);

    const sourceData = new Uint8Array(image.data);
    let rgbaData;

    if (bytesPerPixel === 3) {
      // RGB format - convert to RGBA
      console.log('Converting RGB to RGBA');
      const pixelCount = image.width * image.height;
      rgbaData = new Uint8Array(pixelCount * 4);

      // RGB→RGBA conversion loop
      for (let i = 0, j = 0; i < sourceData.length; i += 3, j += 4) {
        rgbaData[j] = sourceData[i];         // R
        rgbaData[j + 1] = sourceData[i + 1]; // G
        rgbaData[j + 2] = sourceData[i + 2]; // B
        rgbaData[j + 3] = 255;               // A (fully opaque)
      }
    } else if (bytesPerPixel === 4) {
      // Already RGBA format
      console.log('Already RGBA format');
      rgbaData = sourceData;
    } else {
      throw new Error(`Unsupported TIFF format: ${bytesPerPixel} bytes per pixel (expected 3 or 4)`);
    }

    // Convert to base64 for efficient IPC transfer
    const pixelDataBase64 = Buffer.from(rgbaData).toString('base64');

    console.log(`TIFF loaded successfully: ${image.width}x${image.height}, ${rgbaData.length} bytes RGBA`);

    return {
      width: image.width,
      height: image.height,
      data: pixelDataBase64,
      filePath: filePath,
      fileName: path.basename(filePath)
    };
  } catch (error) {
    console.error('Error loading TIFF:', error);
    throw error;
  }
});
