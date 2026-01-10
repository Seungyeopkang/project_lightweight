// Electron-compatible API wrapper
// This file detects if running in Electron and uses IPC, otherwise uses axios

const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron;

// For web mode (backward compatibility)
let axiosClient = null;
if (!isElectron) {
  import('axios').then(axios => {
    axiosClient = axios.default.create({
      // baseURL removed to use relative path (Vite proxy)
    });
  });
}

export const healthCheck = async () => {
  if (isElectron) {
    return window.electronAPI.healthCheck();
  }
  const axios = (await import('axios')).default;
  const client = axios.create({});
  return client.get('/api/health');
};

export const getDummyGraph = async () => {
  if (isElectron) {
    return window.electronAPI.getDummyGraph();
  }
  const axios = (await import('axios')).default;
  const client = axios.create({});
  return client.get('/api/dummy-graph');
};

export const uploadModel = async (file) => {
  // Check if running in Electron environment
  if (isElectron) {
    console.log("Electron upload detected. File path:", file);
    // In Electron, file is a path string from file dialog
    const result = await window.electronAPI.uploadModel(file);
    if (result.success) {
      return { data: result.data };
    } else {
      console.error("Electron upload failed:", result.error);
      throw new Error(result.error);
    }
  }
  
  // Web mode (browser)
  console.log("Web upload detected. File object:", file);
  const axios = (await import('axios')).default;
  const client = axios.create({});
  const formData = new FormData();
  formData.append("model_file", file);
  return client.post('/api/upload-model', formData);
};

export const quantizeModel = async (file) => {
  if (isElectron) {
    const result = await window.electronAPI.quantizeModel(file);
    if (result.success) {
      // Save file
      const saveResult = await window.electronAPI.saveFile(result.data.filename);
      if (saveResult.success && !saveResult.canceled) {
        await window.electronAPI.writeFile(saveResult.filePath, result.data.data);
        return { success: true, filePath: saveResult.filePath };
      }
      return { success: false, canceled: true };
    } else {
      throw new Error(result.error);
    }
  }
  
  // Web mode
  const axios = (await import('axios')).default;
  const client = axios.create({});
  const formData = new FormData();
  formData.append("model_file", file);
  return client.post('/api/quantize', formData, {
    responseType: 'blob'
  });
};

// Electron-specific file dialog
export const selectOnnxFile = async () => {
  if (isElectron) {
    const result = await window.electronAPI.selectFile();
    if (result.success && !result.canceled) {
      return result.filePath;
    }
    return null;
  }
  return null; // Not available in web mode
};