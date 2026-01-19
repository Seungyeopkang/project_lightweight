const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Model operations
  // Model operations
  uploadModel: (filePath) => ipcRenderer.invoke('upload-model', filePath),
  quantizeModel: (args) => ipcRenderer.invoke('quantize-model', args),
  pruneModel: (args) => ipcRenderer.invoke('prune-model', args),
  removeNode: (args) => ipcRenderer.invoke('remove-node', args),
  runBenchmark: (args) => ipcRenderer.invoke('run-benchmark', args),
  saveRemoteModel: (args) => ipcRenderer.invoke('save-remote-model', args),
  undo: (args) => ipcRenderer.invoke('undo', args),
  getModelInfo: (filePath) => ipcRenderer.invoke('model-info', filePath),

  // API calls
  healthCheck: () => ipcRenderer.invoke('health-check'),
  getDummyGraph: () => ipcRenderer.invoke('get-dummy-graph'),
  getGraph: (sessionId) => ipcRenderer.invoke('get-graph', sessionId),

  // File dialogs
  selectFile: () => ipcRenderer.invoke('select-file'),
  saveFile: (defaultName) => ipcRenderer.invoke('save-file', defaultName),
  saveRemoteModel: (sessionId) => ipcRenderer.invoke('save-remote-model', sessionId),

  // File I/O
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath, data) => ipcRenderer.invoke('write-file', filePath, data),

  // Platform info
  platform: process.platform,
  isElectron: true
});
