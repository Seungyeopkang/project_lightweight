import { PythonShell } from 'python-shell';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { spawn } from 'child_process';
import log from 'electron-log';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure electron-log
log.transports.file.fileName = 'python-backend.log';
log.transports.file.level = 'info';
log.transports.console.level = 'info';

let pythonProcess = null;
const BACKEND_PORT = 8000;
// Use 127.0.0.1 instead of localhost to avoid DNS resolution issues in Electron
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;

/**
 * Start Python FastAPI backend as subprocess
 */
export async function startPythonBackend(isDev) {
  return new Promise((resolve, reject) => {
    const backendPath = isDev
      ? path.join(__dirname, '../ai')
      : path.join(process.resourcesPath, 'ai');

    log.info('Starting Python backend from:', backendPath);
    console.log('Starting Python backend from:', backendPath);

    // Try to use system Python or bundled Python
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const mainPath = path.join(backendPath, 'main.py');

    pythonProcess = spawn(pythonCmd, [
      '-m', 'uvicorn',
      'main:app',
      '--host', '0.0.0.0',
      '--port', BACKEND_PORT.toString(),
      '--log-level', 'info'
    ], {
      cwd: backendPath,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1'
      }
    });

    pythonProcess.stdout.on('data', (data) => {
      const message = data.toString().trim();
      log.info(`[Python] ${message}`);
      console.log(`[Python] ${message}`);

      if (message.includes('Uvicorn running')) {
        log.info('✅ Python backend started successfully');
        console.log('✅ Python backend started successfully');
        resolve();
      }
    });

    pythonProcess.stderr.on('data', (data) => {
      const message = data.toString().trim();
      log.error(`[Python Error] ${message}`);
      console.error(`[Python Error] ${message}`);
    });

    pythonProcess.on('error', (error) => {
      log.error('Failed to start Python backend:', error);
      console.error('Failed to start Python backend:', error);
      reject(error);
    });

    pythonProcess.on('close', (code) => {
      log.info(`Python backend exited with code ${code}`);
      console.log(`Python backend exited with code ${code}`);
      pythonProcess = null;
    });

    // Timeout fallback
    setTimeout(() => {
      if (pythonProcess && !pythonProcess.killed) {
        log.warn('Python backend startup timeout - assuming success');
        resolve(); // Assume started even if no "running" message
      }
    }, 5000);
  });
}

/**
 * Stop Python backend
 */
export function stopPythonBackend() {
  if (pythonProcess) {
    log.info('Stopping Python backend...');
    console.log('Stopping Python backend...');
    pythonProcess.kill();
    pythonProcess = null;
  }
}

/**
 * Call Python API endpoint
 */
export async function callPythonAPI(endpoint, data = {}) {
  const endpointMap = {
    'health': '/api/health',
    'dummy-graph': '/api/dummy-graph',
    'upload-model': '/api/upload-model',
    'quantize': '/api/quantize',
    'prune': '/api/prune-model',
    'remove-node': '/api/remove-node',
    'run-benchmark': '/api/benchmark',
    'model-info': '/api/model-info',
    'get-graph': '/api/graph'
  };

  const url = `${BACKEND_URL}${endpointMap[endpoint] || endpoint}`;

  try {
    if (endpoint === 'upload-model') {
      // File upload using FormData
      const FormData = (await import('form-data')).default;
      const fs = (await import('fs')).default;

      log.info(`Uploading model from: ${data.filePath}`);
      const formData = new FormData();
      formData.append('model_file', fs.createReadStream(data.filePath));

      const response = await axios.post(url, formData, {
        headers: formData.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      });

      log.info('Model uploaded successfully');
      return response.data;

    } else if (endpoint === 'quantize' || endpoint === 'prune' || endpoint === 'remove-node' || endpoint === 'run-benchmark') {
      // Quantize, Prune, Remove Node, or Benchmark
      const FormData = (await import('form-data')).default;
      const fs = (await import('fs')).default;

      const operation = endpoint === 'quantize' ? 'Quantizing' : 'Pruning';
      log.info(`${operation} model from: ${data.filePath}`);

      const formData = new FormData();
      formData.append('model_file', fs.createReadStream(data.filePath));

      // Add pruning ratio if present
      const params = new URLSearchParams();
      if (endpoint === 'prune' && data.ratio !== undefined) {
        params.append('ratio', data.ratio);
      }

      if (endpoint === 'remove-node' && data.nodeName !== undefined) {
        formData.append('node_name', data.nodeName);
      }

      if (endpoint === 'run-benchmark' && data.dataset !== undefined) {
        formData.append('dataset', data.dataset);
        formData.append('limit', data.limit || 1000);
      }

      const urlWithParams = params.toString() ? `${url}?${params}` : url;

      const response = await axios.post(urlWithParams, formData, {
        headers: formData.getHeaders(),
        // responseType: 'arraybuffer', // REMOVE this for benchmark, it needs JSON
        // We only need arraybuffer for prune/quantize/remove which return files
        responseType: (endpoint === 'run-benchmark') ? 'json' : 'arraybuffer',
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      });

      if (endpoint === 'run-benchmark') {
        return response.data;
      }

      log.info(`Model ${endpoint}ed successfully`);
      const stats = response.headers['x-pruning-stats'] || '{}';

      return {
        data: Buffer.from(response.data).toString('base64'),
        filename: response.headers['content-disposition']?.match(/filename="(.+)"/)?.[1] || `${endpoint}ed_model.onnx`,
        stats: stats
      };

    } else if (endpoint === 'model-info') {
      // Get model info
      const FormData = (await import('form-data')).default;
      const fs = (await import('fs')).default;

      log.info(`Getting model info from: ${data.filePath}`);
      const formData = new FormData();
      formData.append('model_file', fs.createReadStream(data.filePath));

      const response = await axios.post(url, formData, {
        headers: formData.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      });

      log.info('Model info retrieved successfully');
      return response.data;

    } else if (endpoint === 'get-graph') {
      // Get graph with query params
      const params = new URLSearchParams();
      if (data.sessionId) params.append('session_id', data.sessionId);

      const urlWithParams = `${url}?${params.toString()}`;
      log.info(`Fetching graph from: ${urlWithParams}`);

      const response = await axios.get(urlWithParams);
      return response.data;

    } else {
      // Regular GET request
      const response = await axios.get(url);
      return response.data;
    }
  } catch (error) {
    log.error(`Python API error (${endpoint}):`, error.message);
    console.error(`Python API error (${endpoint}):`, error.message);
    throw error;
  }
}

// Export log path for debugging
export function getLogPath() {
  return log.transports.file.getFile().path;
}
