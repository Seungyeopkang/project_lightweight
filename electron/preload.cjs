const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Model operations
  uploadModel: (filePath) => ipcRenderer.invoke('upload-model', filePath),
  quantizeModel: (filePath) => ipcRenderer.invoke('quantize-model', filePath),
  pruneModel: (filePath, ratio) => ipcRenderer.invoke('prune-model', filePath, ratio),
  removeNode: (filePath, nodeName) => ipcRenderer.invoke('remove-node', filePath, nodeName),
  runBenchmark: (filePath, dataset) => ipcRenderer.invoke('run-benchmark', filePath, dataset),
  getModelInfo: (filePath) => ipcRenderer.invoke('model-info', filePath),

  // API calls
  healthCheck: () => ipcRenderer.invoke('health-check'),
  getDummyGraph: () => ipcRenderer.invoke('get-dummy-graph'),
  getGraph: (sessionId) => ipcRenderer.invoke('get-graph', sessionId),

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
