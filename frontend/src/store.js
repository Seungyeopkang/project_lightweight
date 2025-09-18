import { create } from 'zustand';

// 앱의 전역 상태를 생성합니다.
const useStore = create((set) => ({
  // 모델 구조(JSON)를 저장할 상태
  modelJson: null,
  // 모델 성능 결과를 저장할 상태
  performanceResults: null,

  // 상태를 업데이트하는 함수들
  setModelJson: (json) => set({ modelJson: json }),
  setPerformanceResults: (results) => set({ performanceResults: results }),
}));

export default useStore;