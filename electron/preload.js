const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('api', {
  version: process.versions.electron,

  // Dialog triggers (from menu)
  onNewProject: (callback) => ipcRenderer.on('menu:new-project', callback),
  onOpenProject: (callback) => ipcRenderer.on('menu:open-project', callback),
  onShowProjectDebug: (callback) => ipcRenderer.on('menu:show-project-debug', callback),

  // File dialogs
  openTiffDialog: () => ipcRenderer.invoke('dialog:open-tiff'),

  // TIFF loading
  loadTiffImage: (filePath) => ipcRenderer.invoke('load-tiff-image', filePath),
});
