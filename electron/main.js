import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { startPythonBackend, stopPythonBackend, callPythonAPI } from './python-bridge.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Create main window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    backgroundColor: '#1a1a1a',
    show: false
  });

  // Load app
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../frontend/dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle
app.whenReady().then(async () => {
  // Start Python backend
  await startPythonBackend(isDev);

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopPythonBackend();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('quit', () => {
  stopPythonBackend();
});

// IPC Handlers
ipcMain.handle('upload-model', async (event, filePath) => {
  try {
    const result = await callPythonAPI('upload-model', { filePath });
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('quantize-model', async (event, args) => {
  try {
    const result = await callPythonAPI('quantize-model', args);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('prune-model', async (event, args) => {
  try {
    const result = await callPythonAPI('prune', args);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('remove-node', async (event, args) => {
  try {
    const result = await callPythonAPI('remove-node', args);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('run-benchmark', async (event, args) => {
  try {
    const result = await callPythonAPI('run-benchmark', args);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('undo', async (event, args) => {
  try {
    const result = await callPythonAPI('undo', args);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('model-info', async (event, filePath) => {
  try {
    const result = await callPythonAPI('model-info', { filePath });
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('health-check', async () => {
  try {
    const result = await callPythonAPI('health');
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-dummy-graph', async () => {
  try {
    const result = await callPythonAPI('dummy-graph');
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('save-remote-model', async (event, sessionId) => {
  try {
    const { canceled, filePath } = await dialog.showSaveDialog({
      filters: [{ name: 'ONNX Models', extensions: ['onnx'] }]
    });
    if (canceled || !filePath) return { canceled: true };

    const response = await axios({
      method: 'get',
      url: `http://127.0.0.1:8000/api/download-model?session_id=${sessionId}`,
      responseType: 'arraybuffer'
    });

    require('fs').writeFileSync(filePath, Buffer.from(response.data));
    return { success: true, filePath };
  } catch (error) {
    console.error('Save remote model error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-graph', async (event, sessionId) => {
  try {
    const result = await callPythonAPI('get-graph', { sessionId });
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// File dialog
ipcMain.handle('select-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'ONNX Models', extensions: ['onnx'] }
    ]
  });

  if (result.canceled) {
    return { success: false, canceled: true };
  }

  return { success: true, filePath: result.filePaths[0] };
});

ipcMain.handle('save-file', async (event, defaultName) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName,
    filters: [
      { name: 'ONNX Models', extensions: ['onnx'] }
    ]
  });

  if (result.canceled) {
    return { success: false, canceled: true };
  }

  return { success: true, filePath: result.filePath };
});

// Read file
ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const data = fs.readFileSync(filePath);
    return { success: true, data: data.toString('base64') };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Write file
ipcMain.handle('write-file', async (event, filePath, data) => {
  try {
    const buffer = Buffer.from(data, 'base64');
    fs.writeFileSync(filePath, buffer);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
