import axios from 'axios';

const apiClient = axios.create({
  baseURL: 'http://localhost:8000',
  headers: {
    'Content-Type': 'application/json',
  },
});

export const healthCheck = () => {
  return apiClient.get('/api/health');
};

export const getDummyGraph = () => {
  return apiClient.get('/api/dummy-graph');
};

// --- 이 함수가 추가되었는지 확인하세요 ---
export const uploadModel = (file) => {
  const formData = new FormData();
  formData.append("model_file", file);

  return apiClient.post('/api/upload-model', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
};