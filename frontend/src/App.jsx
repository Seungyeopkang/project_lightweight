import React, { useEffect, useState } from 'react';
import useStore from './store';
import { healthCheck } from './api';
import ModelUploader from './components/ModelUploader';
import GraphViewer from './components/GraphViewer';
import OptimizationPanel from './components/OptimizationPanel';
import PruningPanel from './components/PruningPanel';
import QuantizationPanel from './components/QuantizationPanel';
import BenchmarkPanel from './components/BenchmarkPanel';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './App.css';
import DualCollapsiblePanel from './components/custom/DualCollapsiblePanel';

function App() {
  const { modelJson, selectedNode, setSelectedNode, updateGraphData, setCurrentModel, history, undo } = useStore();

  // Sync selectedNode when modelJson updates (e.g. after pruning) to show fresh stats
  useEffect(() => {
    if (modelJson && selectedNode) {
      const freshNode = modelJson.nodes.find(n => n.id === selectedNode.id);
      if (freshNode && freshNode !== selectedNode) {
        setSelectedNode(freshNode);
      }
    }
  }, [modelJson]);

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

  // Sidebar Content (Left)
  const sidebarContent = (
    <div style={{ color: '#e0e0e0', fontSize: '12px' }}>
      {/* Model Information Header */}
      {modelJson && (
        <div style={{ padding: '0 8px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
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
            <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
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
      <div style={{ padding: '16px 8px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#fff' }}>History</div>
          {history?.length > 0 && (
            <button
              onClick={undo}
              style={{
                padding: '4px 8px',
                fontSize: '11px',
                backgroundColor: 'rgba(255,255,255,0.1)',
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
          {history?.length === 0 ? (
            <div style={{ color: '#666', fontStyle: 'italic' }}>No changes yet</div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {history?.map((item, idx) => (
                <li key={idx} style={{ marginBottom: '6px', color: '#aaa', fontSize: '11px', display: 'flex', gap: '6px' }}>
                  <span style={{ color: '#6366f1' }}>●</span>
                  <span>{item.description}</span>
                </li>
              )).reverse()}
            </ul>
          )}
        </div>
      </div>

      {/* Selected Node Details (Netron Style) */}
      {selectedNode ? (
        <div style={{ padding: '16px 8px' }}>
          {/* Rich Node Detail Card */}
          {(() => {
            const stats = selectedNode.data?.statistics || {};
            const attrs = selectedNode.data?.attributes || {};
            const isConv = selectedNode.type.includes('Conv');

            // Helper to safely get shape string
            const getShapeDisplay = (shapes, idx) => {
              if (!shapes || !shapes[idx] || shapes[idx] === '?') return { text: 'N/A', dims: null };
              const shape = shapes[idx];
              const text = shape.join(' × ');

              // Try to infer NCHW if 4D
              let dims = null;
              if (shape.length === 4) {
                dims = (
                  <div style={{ display: 'flex', gap: '8px', marginTop: '2px', fontSize: '11px', color: '#888' }}>
                    <span><strong style={{ color: '#aaa' }}>N</strong>:{shape[0]}</span>
                    <span><strong style={{ color: '#4CAF50' }}>C</strong>:{shape[1]}</span>
                    <span><strong style={{ color: '#aaa' }}>H</strong>:{shape[2]}</span>
                    <span><strong style={{ color: '#aaa' }}>W</strong>:{shape[3]}</span>
                  </div>
                );
              }
              return { text, dims };
            };

            const inputInfo = getShapeDisplay(stats.input_shapes, 0);
            const outputInfo = getShapeDisplay(stats.output_shapes, 0);

            return (
              <div style={{ marginBottom: '16px' }}>

                {/* Header Name & Type */}
                <div style={{ marginBottom: '16px', borderLeft: '3px solid #6366f1', paddingLeft: '12px' }}>
                  <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#fff' }}>
                    {selectedNode.label} <span style={{ fontSize: '12px', color: '#888', fontWeight: 'normal' }}>[{selectedNode.type}]</span>
                  </div>
                </div>

                {/* Shape & Channels Section */}
                {stats.input_shapes && (
                  <div style={{ marginBottom: '20px', background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#ccc', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>📏</span> Dimensions
                    </div>

                    <div style={{ fontSize: '13px', fontFamily: 'monospace', color: '#fff', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div>
                        <div style={{ color: '#888', fontSize: '11px', marginBottom: '2px' }}>INPUT</div>
                        <div style={{ letterSpacing: '0.5px' }}>{inputInfo.text}</div>
                        {inputInfo.dims}
                      </div>
                      <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '8px' }}>
                        <div style={{ color: '#888', fontSize: '11px', marginBottom: '2px' }}>OUTPUT</div>
                        <div style={{ letterSpacing: '0.5px' }}>{outputInfo.text}</div>
                        {outputInfo.dims}
                      </div>
                    </div>
                  </div>
                )}

                {/* Params & Weights Section (For Layers with Weights) */}
                {stats.params !== undefined && (
                  <div style={{ marginBottom: '16px', background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#ccc', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>⚖️</span> Params & Weights
                    </div>
                    <div style={{ fontSize: '12px', fontFamily: 'monospace', color: '#aaa', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div>
                        <span style={{ color: '#888', display: 'inline-block', width: '60px' }}>Params:</span>
                        <span style={{ color: '#fff' }}>{stats.params.toLocaleString()}</span>
                      </div>
                      <div>
                        <span style={{ color: '#888', display: 'inline-block', width: '60px' }}>Weights:</span>
                        <span style={{ color: '#fff' }}>[{stats.weight_shape?.join(', ')}]</span>
                      </div>
                      <div>
                        <span style={{ color: '#888', display: 'inline-block', width: '60px' }}>Sparsity:</span>
                        <span style={{ color: stats.sparsity > 50 ? '#4CAF50' : '#f59e0b', fontWeight: 'bold' }}>
                          {stats.sparsity}%
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Fallback Raw Data (Collapsible or just hidden if attributes exist) */}
          {(!selectedNode.data?.attributes || Object.keys(selectedNode.data.attributes).length === 0) && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#888', textTransform: 'uppercase', marginBottom: '8px' }}>
                Raw Data
              </div>
              <div style={{
                background: 'rgba(0,0,0,0.3)',
                padding: '10px',
                borderRadius: '6px',
                border: '1px solid rgba(255,255,255,0.1)',
                maxHeight: '200px',
                overflow: 'auto'
              }}>
                <pre style={{ fontSize: '11px', color: '#a0aec0', margin: 0, fontFamily: 'Consolas, Monaco, monospace' }}>
                  {JSON.stringify(selectedNode.data || selectedNode, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ padding: '20px', color: '#666', textAlign: 'center', marginTop: '20px' }}>
          {modelJson ? 'Select a node to view properties.' : ''}
        </div>
      )
      }
    </div >
  );

  // Right Panel Content (Controls)
  const rightContent = (
    <div style={{ height: '100%', overflowY: 'auto', padding: '20px' }}>
      {/* Header Actions */}
      {modelJson && (
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', justifyContent: 'center' }}>
          <button
            onClick={handleReset}
            style={{
              padding: '8px 16px',
              backgroundColor: '#f59e0b',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '600'
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
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '600'
            }}
          >
            ✖ Unload
          </button>
        </div>
      )}

      {!modelJson ? (
        <ModelUploader />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <PruningPanel />
          <BenchmarkPanel />
          <QuantizationPanel />
        </div>
      )}
    </div>
  );

  return (
    <div className="App">
      <DualCollapsiblePanel
        userName="Seungyeop Kang"
        userRole="Admin"
        sidebarContent={sidebarContent}
        rightContent={rightContent}
      >
        <div style={{ width: '100%', height: '100%', position: 'relative' }}>
          {modelJson ? (
            <GraphViewer />
          ) : (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'rgba(255,255,255,0.5)',
              fontSize: '16px',
              flexDirection: 'column',
              gap: '16px'
            }}>
              <div>Welcome to ONNX Optimizer</div>
              <div style={{ fontSize: '14px', opacity: 0.7 }}>Upload a model on the right to get started</div>
            </div>
          )}
        </div>
      </DualCollapsiblePanel>

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
        theme="dark"
      />
    </div>
  );
}

export default App;