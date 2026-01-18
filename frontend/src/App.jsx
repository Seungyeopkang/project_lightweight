import React, { useEffect, useState } from 'react';
import useStore from './store';
import { healthCheck } from './api';
import ModelUploader from './components/ModelUploader';
import GraphViewer from './components/GraphViewer';
import OptimizationPanel from './components/OptimizationPanel';
import PruningPanel from './components/PruningPanel';
import QuantizationPanel from './components/QuantizationPanel';
import MetricsPanel from './components/MetricsPanel';
import ComparisonPanel from './components/ComparisonPanel';
import BenchmarkPanel from './components/BenchmarkPanel';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './App.css';

function App() {
  const { modelJson, fetchGraphData, selectedNode, updateGraphData, setCurrentModel } = useStore();
  const [healthStatus, setHealthStatus] = useState('Checking...');

  // Panel collapse states
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);

  useEffect(() => {
    healthCheck().catch(err => console.error(err));
  }, []);

  // Reset function - clear current model and return to upload state
  const handleReset = () => {
    if (confirm('Reset will clear the current model and all optimizations. Continue?')) {
      updateGraphData(null);
      setCurrentModel(null);
    }
  };

  // Unload function - same as reset but with different message
  const handleUnload = () => {
    if (confirm('Unload the current model?')) {
      updateGraphData(null);
      setCurrentModel(null);
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>ONNX Model Optimizer</h1>

        {/* Model Controls - only show when model is loaded */}
        {modelJson && (
          <div style={{ display: 'flex', gap: '10px', marginLeft: 'auto' }}>
            <button
              onClick={handleReset}
              style={{
                padding: '8px 16px',
                backgroundColor: '#f59e0b',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500'
              }}
            >
              🔄 Reset
            </button>
            <button
              onClick={handleUnload}
              style={{
                padding: '8px 16px',
                backgroundColor: '#ef4444',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500'
              }}
            >
              ✖ Unload Model
            </button>
          </div>
        )}
      </header>

      <div className="main-layout">
        {/* Left Sidebar - Layer Info */}
        <div style={{
          width: leftPanelCollapsed ? '40px' : '300px',
          backgroundColor: '#1e1e1e',
          borderRight: '1px solid #2d2d2d',
          color: '#e0e0e0',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          fontSize: '12px',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          position: 'relative',
          transition: 'width 0.3s ease'
        }}>

          {/* Toggle Button */}
          <button
            onClick={() => setLeftPanelCollapsed(!leftPanelCollapsed)}
            style={{
              position: 'absolute',
              right: '-12px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '24px',
              height: '60px',
              backgroundColor: '#2d2d2d',
              border: '1px solid #3d3d3d',
              borderRadius: '0 4px 4px 0',
              color: '#888',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px',
              zIndex: 10
            }}
          >
            {leftPanelCollapsed ? '▶' : '◀'}
          </button>

          {!leftPanelCollapsed && (
            <div>
              {/* Model Information Header */}
              {modelJson && (
                <div style={{ padding: '16px', borderBottom: '1px solid #2d2d2d' }}>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#fff', marginBottom: '10px' }}>
                    Model Information
                  </div>
                  <div style={{ fontSize: '12px', color: '#b0b0b0', lineHeight: '1.8' }}>
                    <div><strong>Nodes:</strong> {modelJson.nodes?.length || 0}</div>
                    <div><strong>Edges:</strong> {modelJson.edges?.length || 0}</div>
                    <div><strong>Framework:</strong> ONNX</div>
                  </div>

                  {/* Layer Distribution */}
                  {modelJson.nodes && modelJson.nodes.length > 0 && (
                    <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #2d2d2d' }}>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: '#6366f1', marginBottom: '6px' }}>
                        Layer Distribution
                      </div>
                      <div style={{ fontSize: '11px', color: '#999', lineHeight: '1.6' }}>
                        {(() => {
                          const counts = {};
                          modelJson.nodes.forEach(node => {
                            const type = node.data?.type || 'Unknown';
                            counts[type] = (counts[type] || 0) + 1;
                          });
                          return Object.entries(counts)
                            .sort((a, b) => b[1] - a[1])
                            .slice(0, 6)
                            .map(([type, count]) => (
                              <div key={type}>{type}: {count}</div>
                            ));
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Optimization History */}
              <div style={{ padding: '16px', borderBottom: '1px solid #2d2d2d' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#fff' }}>History</div>
                  {useStore.getState().history?.length > 0 && (
                    <button
                      onClick={useStore.getState().undo}
                      style={{
                        padding: '4px 8px',
                        fontSize: '11px',
                        backgroundColor: '#4b5563',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      ↩ Undo
                    </button>
                  )}
                </div>

                <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
                  {useStore(state => state.history).length === 0 ? (
                    <div style={{ color: '#666', fontStyle: 'italic' }}>No changes yet</div>
                  ) : (
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {useStore(state => state.history).map((item, idx) => (
                        <li key={idx} style={{ marginBottom: '6px', color: '#aaa', fontSize: '11px', display: 'flex', gap: '6px' }}>
                          <span style={{ color: '#6366f1' }}>●</span>
                          <span>{item.description}</span>
                        </li>
                      )).reverse()}
                    </ul>
                  )}
                </div>
              </div>

              {/* Selected Node Details */}
              {selectedNode ? (
                <div>
                  <div style={{ padding: '12px', borderBottom: '1px solid #2d2d2d' }}>
                    <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#fff' }}>{selectedNode.type}</div>
                    <div style={{ color: '#888', marginTop: '4px' }}>Node Properties</div>
                  </div>

                  <div style={{ padding: '10px 12px', borderBottom: '1px solid #2d2d2d' }}>
                    <div style={{ color: '#888', marginBottom: '4px', fontSize: '11px', fontWeight: 'bold' }}>NAME</div>
                    <div style={{ color: '#c5c5c5', wordBreak: 'break-all', fontFamily: 'monospace' }}>{selectedNode.label}</div>
                  </div>

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
                            color: '#6366f1',
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
                  {modelJson ? 'Select a node to view properties.' : ''}
                </div>
              )}
            </div>
          )}
        </div>


        {/* Center - Graph Viewer (always visible) */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: '#F0F0F0'
        }}>
          {modelJson ? (
            <GraphViewer />
          ) : (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: '#999',
              fontSize: '14px'
            }}>
              Upload a model to view graph visualization
            </div>
          )}
        </div>


        {/* Right Sidebar - Optimization Controls */}
        <div style={{
          width: rightPanelCollapsed ? '40px' : '340px',
          backgroundColor: '#fafafa',
          borderLeft: '1px solid #e0e0e0',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          transition: 'width 0.3s ease',
          overflowY: 'auto',
          overflowX: 'hidden'
        }}>
          <button
            onClick={() => setRightPanelCollapsed(!rightPanelCollapsed)}
            style={{
              position: 'absolute',
              right: rightPanelCollapsed ? '10px' : '310px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '30px',
              height: '60px',
              background: '#ffffff',
              border: '1px solid #e0e0e0',
              borderRadius: '8px 0 0 8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#666',
              fontSize: '18px',
              zIndex: 10,
              transition: 'all 0.2s ease',
            }}
          >
            {rightPanelCollapsed ? '◀' : '▶'}
          </button>

          {!rightPanelCollapsed && (
            <div style={{
              padding: '0',
              display: 'flex',
              flexDirection: 'column',
              gap: '0'
            }}>
              {!modelJson ? (
                <ModelUploader />
              ) : (
                <>
                  <PruningPanel />
                  <BenchmarkPanel />
                  <QuantizationPanel />
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <ToastContainer
        position="bottom-right"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="light"
      />
    </div>
  );
}

// Inline styles for left panel
const infoItemStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '8px 12px',
  background: '#f8f9fa',
  borderRadius: '6px',
  border: '1px solid #e9ecef',
};

const infoLabelStyle = {
  fontSize: '11px',
  color: '#666',
  fontWeight: '500',
};

const infoValueStyle = {
  fontSize: '13px',
  color: '#242424',
  fontWeight: '600',
};

const nodeDetailStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '6px 0',
  fontSize: '11px',
  gap: '8px',
};

const nodeDetailLabelStyle = {
  color: '#666',
  fontWeight: '500',
  minWidth: '50px',
};

const nodeDetailValueStyle = {
  color: '#242424',
  fontWeight: '500',
  textAlign: 'right',
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

export default App;