const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('api', {
  version: process.versions.electron,

  // Dialog triggers (from menu)
  onNewProject: (callback) => ipcRenderer.on('menu:new-project', callback),
  onOpenProject: (callback) => ipcRenderer.on('menu:open-project', callback),
  onEditProject: (callback) => ipcRenderer.on('menu:edit-project', callback),
  onShowProjectDebug: (callback) => ipcRenderer.on('menu:show-project-debug', callback),
  onTestOrientationStep: (callback) => ipcRenderer.on('menu:test-orientation-step', callback),
  onTestScaleBarStep: (callback) => ipcRenderer.on('menu:test-scale-bar-step', callback),
  onClearProject: (callback) => ipcRenderer.on('menu:clear-project', callback),
  onQuickLoadImage: (callback) => ipcRenderer.on('menu:quick-load-image', callback),

  // File dialogs
  openTiffDialog: () => ipcRenderer.invoke('dialog:open-tiff'),

  // TIFF loading
  loadTiffImage: (filePath) => ipcRenderer.invoke('load-tiff-image', filePath),

  // Image preview loading (returns base64 data URL)
  // size: 'thumbnail' (max 512px, fast) or 'full' (original resolution)
  loadImagePreview: (filePath, size) => ipcRenderer.invoke('load-image-preview', filePath, size),

  // Window title
  setWindowTitle: (title) => ipcRenderer.send('set-window-title', title),

  // Theme management
  onThemeChange: (callback) => ipcRenderer.on('theme:set', (event, theme) => callback(theme)),
  notifyThemeChanged: (theme) => ipcRenderer.send('theme:changed', theme),

  // Tile-based image loading
  loadImageWithTiles: (imagePath) => ipcRenderer.invoke('image:load-with-tiles', imagePath),
  loadThumbnail: (imageHash) => ipcRenderer.invoke('image:load-thumbnail', imageHash),
  loadMedium: (imageHash) => ipcRenderer.invoke('image:load-medium', imageHash),
  loadTile: (imageHash, tileX, tileY) => ipcRenderer.invoke('image:load-tile', imageHash, tileX, tileY),
  loadTilesBatch: (imageHash, tiles) => ipcRenderer.invoke('image:load-tiles-batch', imageHash, tiles),
  getCacheStats: () => ipcRenderer.invoke('image:cache-stats'),
  clearImageCache: (imageHash) => ipcRenderer.invoke('image:clear-cache', imageHash),
  clearAllCaches: () => ipcRenderer.invoke('image:clear-all-caches'),
});
