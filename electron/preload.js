import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Model operations
  uploadModel: (filePath) => ipcRenderer.invoke('upload-model', filePath),
  quantizeModel: (filePath) => ipcRenderer.invoke('quantize-model', filePath),
  pruneModel: (filePath, ratio) => ipcRenderer.invoke('prune-model', filePath, ratio),
  getModelInfo: (filePath) => ipcRenderer.invoke('model-info', filePath),
  
  // API calls
  healthCheck: () => ipcRenderer.invoke('health-check'),
  getDummyGraph: () => ipcRenderer.invoke('get-dummy-graph'),
  
  // API wrappers
  // The uploadModel method is already defined under 'Model operations'.
  // If this is intended to be a separate API wrapper, consider renaming to avoid conflict.
  // For now, assuming it's a re-categorization or a duplicate entry that will overwrite the first.
  // Keeping the first definition and adding the new methods.
  
  // File dialogs
  selectFile: () => ipcRenderer.invoke('select-file'),
  saveFile: (defaultName) => ipcRenderer.invoke('save-file', defaultName),
  
  // File I/O
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath, data) => ipcRenderer.invoke('write-file', filePath, data),
  
  // Platform info
  platform: process.platform,
  isElectron: true
});
