import axios from 'axios';

// 백엔드 서버 주소를 기본 URL로 하는 axios 인스턴스를 생성합니다.
// FastAPI의 기본 주소는 http://localhost:8000 입니다.
const apiClient = axios.create({
  baseURL: 'http://localhost:8000',
  headers: {
    'Content-Type': 'application/json',
  }
});

// 앞으로 백엔드에 요청을 보내는 모든 함수는 여기서 만들어 관리합니다.
// 예시: 모델 데이터를 가져오는 함수
export const getModelData = () => {
  // apiClient.get('/')는 'http://localhost:8000/'으로 GET 요청을 보냅니다.
  return apiClient.get('/'); 
};

export const healthCheck = () => {
  return apiClient.get('/api/health');
};

export const getDummyGraph = () => {
  return apiClient.get('/api/dummy-graph');
};