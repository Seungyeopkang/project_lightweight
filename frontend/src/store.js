import { create } from 'zustand';
import { getDummyGraph } from './api'; // 1. api.js에서 getDummyGraph 함수를 가져옵니다.

// 앱의 전역 상태를 생성합니다.
const useStore = create((set) => ({
  // --- 상태 (State) ---
  // 모델 구조(JSON)를 저장할 상태
  modelJson: null,
  // 모델 성능 결과를 저장할 상태
  performanceResults: null,

  // --- 상태 변경 함수 (Actions) ---
  // 상태를 업데이트하는 기본 함수들
  setModelJson: (json) => set({ modelJson: json }),
  setPerformanceResults: (results) => set({ performanceResults: results }),

  // 2. API를 호출하고 상태를 업데이트하는 새로운 액션을 추가합니다.
  fetchGraphData: async () => {
    try {
      const response = await getDummyGraph();
      // API 호출에 성공하면, 받아온 데이터(response.data)로 modelJson 상태를 업데이트합니다.
      set({ modelJson: response.data });
      console.log('📊 Graph data loaded into store successfully!');
    } catch (error) {
      console.error('Failed to fetch graph data:', error);
    }
  },
}));

export default useStore;