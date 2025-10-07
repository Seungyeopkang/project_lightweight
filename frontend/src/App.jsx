import { useEffect } from 'react';
import { healthCheck } from './api';
import ModelUploader from './components/ModelUploader'; // ModelUploader 추가
import GraphViewer from './components/GraphViewer';
import InfoPanel from './components/InfoPanel';
import './App.css';

function App() {
  useEffect(() => {
    const checkServerHealth = async () => {
      try {
        const response = await healthCheck();
        console.log('✅ Server Connection OK:', response.data);
      } catch (error) {
        console.error('❌ Server Connection FAILED:', error);
      }
    };
    
    checkServerHealth();
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <h1>AI Model Optimization Tool</h1>
      </header>
      <div className="main-content">
        <div className="left-panel">
          <ModelUploader />
          <InfoPanel />
        </div>
        <div className="right-panel">
          <GraphViewer />
        </div>
      </div>
    </div>
  );
}

export default App;