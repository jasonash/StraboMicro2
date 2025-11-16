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
  onClearProject: (callback) => ipcRenderer.on('menu:clear-project', callback),

  // File dialogs
  openTiffDialog: () => ipcRenderer.invoke('dialog:open-tiff'),

  // TIFF loading
  loadTiffImage: (filePath) => ipcRenderer.invoke('load-tiff-image', filePath),

  // Window title
  setWindowTitle: (title) => ipcRenderer.send('set-window-title', title),

  // Theme management
  onThemeChange: (callback) => ipcRenderer.on('theme:set', (event, theme) => callback(theme)),
  notifyThemeChanged: (theme) => ipcRenderer.send('theme:changed', theme),
});
