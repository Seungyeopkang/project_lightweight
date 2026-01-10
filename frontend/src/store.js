// Improved store with model path tracking
import { create } from 'zustand';

const useStore = create((set) => ({
  // Model data
  modelJson: null,
  graphData: null,
  selectedNode: null,
  currentModel: null,  // Track current model file path
  sessionId: null,  // NEW: for web mode session management
  
  // Metrics tracking
  originalMetrics: null,
  optimizedMetrics: null,
  
  // Actions
  updateGraphData: (data) => set({ 
    modelJson: data, 
    graphData: data 
  }),
  
  setSelectedNode: (node) => set({ selectedNode: node }),
  
  setCurrentModel: (modelPath) => set({ currentModel: modelPath }),

  setSessionId: (id) => set({ sessionId: id }),  // NEW
  
  setOriginalMetrics: (metrics) => set({ originalMetrics: metrics }),
  
  setOptimizedMetrics: (metrics) => set({ optimizedMetrics: metrics }),
  
  clearMetrics: () => set({ 
    originalMetrics: null, 
    optimizedMetrics: null 
  }),
  
  // Fetch graph data (legacy compatibility)
  fetchGraphData: async () => {
    try {
      const isElectron = window.electronAPI?.isElectron;
      if (isElectron) {
        const result = await window.electronAPI.getDummyGraph();
        if (result.success) {
          set({ modelJson: result.data, graphData: result.data });
        }
      } else {
        const response = await fetch('/api/dummy-graph');
        const data = await response.json();
        set({ modelJson: data, graphData: data });
      }
    } catch (error) {
      console.error('Failed to fetch graph data:', error);
    }
  }
}));

export default useStore;