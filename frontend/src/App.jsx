import React, { useEffect, useState } from 'react';
import useStore from './store';
import { healthCheck } from './api';
import ModelUploader from './components/ModelUploader';
import GraphViewer from './components/GraphViewer';
import OptimizationPanel from './components/OptimizationPanel';
import './App.css';

function App() {
  const { modelJson, fetchGraphData, selectedNode } = useStore();
  const [ healthStatus, setHealthStatus ] = useState('Checking...');

  useEffect(() => {
    healthCheck().catch(err => console.error(err));
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <h1>AI Model Optimization Tool</h1>
      </header>
      
      <div className="main-layout">
        {/* Left Sidebar - Layer Info */}
        {/* Left Sidebar - Netron Style Properties */ }
        <div style={{ 
            width: '300px', 
            backgroundColor: '#242424', // Netron Sidebar Darker
            borderRight: '1px solid #1a1a1a', 
            color: '#e0e0e0',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
            fontSize: '12px',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto'
          }}>
          
          {selectedNode ? (
            <div>
               {/* Header / Type */}
               <div style={{ padding: '12px', borderBottom: '1px solid #333' }}>
                 <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#fff' }}>{selectedNode.type}</div>
                 <div style={{ color: '#888', marginTop: '4px' }}>Node Properties</div>
               </div>

               {/* Name Property */}
               <div style={{ padding: '10px 12px', borderBottom: '1px solid #333' }}>
                 <div style={{ color: '#888', marginBottom: '4px', fontSize: '11px', fontWeight: 'bold' }}>NAME</div>
                 <div style={{ color: '#c5c5c5', wordBreak: 'break-all', fontFamily: 'monospace' }}>{selectedNode.label}</div>
               </div>

               {/* Attributes List */}
               {selectedNode.attributes && Object.keys(selectedNode.attributes).length > 0 && (
                 <div style={{ padding: '10px 12px' }}>
                   <div style={{ color: '#888', marginBottom: '8px', fontSize: '11px', fontWeight: 'bold' }}>ATTRIBUTES</div>
                   
                   {Object.entries(selectedNode.attributes).map(([key, val]) => (
                     <div key={key} style={{ 
                       display: 'grid', 
                       gridTemplateColumns: '1fr 2fr', 
                       gap: '10px', 
                       marginBottom: '6px',
                       alignItems: 'start' 
                     }}>
                       <div style={{ color: '#aaa', fontWeight: '500' }}>{key}</div>
                       <div style={{ 
                         color: '#4ec9b0', // VSCode-like Green for values
                         fontFamily: 'Consolas, monospace',
                         wordBreak: 'break-all'
                       }}>
                         {Array.isArray(val) ? (
                            <span>[{val.join(', ')}]</span>
                         ) : val}
                       </div>
                     </div>
                   ))}
                 </div>
               )}
            </div>
          ) : (
            <div style={{ padding: '20px', color: '#666', textAlign: 'center', marginTop: '40px' }}>
              Select a node to view properties.
            </div>
          )}
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