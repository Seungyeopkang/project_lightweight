import React, { useEffect } from 'react';
import useStore from './store';
import { healthCheck } from './api';
import ModelUploader from './components/ModelUploader';
import GraphViewer from './components/GraphViewer';
import InfoPanel from './components/InfoPanel';
import OptimizationPanel from './components/OptimizationPanel';
import './App.css';

function App() {
  const { modelJson } = useStore();

  useEffect(() => {
    healthCheck().catch(err => console.error(err));
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <h1>AI Model Optimization Tool</h1>
      </header>
      
      <div className="main-layout">
        <div className="side-panel left">
          <InfoPanel />
        </div>

        {/* --- 이 부분을 조건부로 완전히 다른 div를 렌더링하도록 변경 --- */}
        {modelJson ? (
          <div className="center-panel-graph">
            <GraphViewer />
          </div>
        ) : (
          <div className="center-panel-uploader">
            <ModelUploader />
          </div>
        )}

        <div className="side-panel right">
          <OptimizationPanel />
        </div>
      </div>
    </div>
  );
}

export default App;