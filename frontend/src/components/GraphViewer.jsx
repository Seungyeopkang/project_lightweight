import React, { useEffect, useRef, useState } from 'react';
import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import useStore from '../store';

cytoscape.use(dagre);

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("GraphViewer Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, color: 'red', border: '1px solid red' }}>
          <h3>Graph Viewer Error</h3>
          <pre>{this.state.error && this.state.error.toString()}</pre>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function GraphViewerWrapper() {
  return (
    <ErrorBoundary>
      <GraphViewer />
    </ErrorBoundary>
  );
}

function GraphViewer() {
  const cyRef = useRef(null);
  const containerRef = useRef(null);
  const [viewMode, setViewMode] = useState('overview'); // 'overview' or 'detail'
  const [selectedStageId, setSelectedStageId] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const modelJson = useStore((state) => state.modelJson);
  const setSelectedNode = useStore((state) => state.setSelectedNode);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [modalContent, setModalContent] = useState(null);

  useEffect(() => {
    console.log('[GraphViewer] Initializing, mode:', viewMode, 'stage:', selectedStageId);

    if (!containerRef.current || !modelJson) {
      return;
    }

    if (cyRef.current) {
      cyRef.current.destroy();
    }

    const { nodes, edges, stages, hierarchical } = modelJson;

    try {
      if (hierarchical && stages && viewMode === 'overview') {
        createOverviewGraph(stages);
      } else if (viewMode === 'detail' && selectedStageId) {
        createStageDetailGraph(nodes, edges, stages, selectedStageId);
      } else {
        createDetailGraph(nodes, edges);
      }
    } catch (error) {
      console.error('[GraphViewer] Error:', error);
    }

    return () => {
      if (cyRef.current) cyRef.current.destroy();
    };
  }, [modelJson, viewMode, selectedStageId, setSelectedNode]);

  const createOverviewGraph = (stages) => {
    const stageNodes = stages.map(stage => ({
      data: {
        id: stage.id,
        label: stage.label,
        childCount: stage.children.length
      }
    }));

    const stageEdges = [];
    for (let i = 0; i < stages.length - 1; i++) {
      stageEdges.push({
        data: {
          id: `edge_${i}`,
          source: stages[i].id,
          target: stages[i + 1].id
        }
      });
    }

    console.log('[GraphViewer] Overview:', stageNodes.length, 'blocks');

    cyRef.current = cytoscape({
      container: containerRef.current,
      elements: [...stageNodes, ...stageEdges],

      style: [
        {
          selector: 'node',
          style: {
            'background-color': '#4a7ba7',
            'label': 'data(label)',
            'color': '#fff',
            'text-valign': 'center',
            'text-halign': 'center',
            'font-size': '18px',
            'font-weight': '700',
            'font-family': '-apple-system, sans-serif',
            'width': 320,  // Much larger!
            'height': 140,  // Much larger!
            'shape': 'roundrectangle',
            'text-wrap': 'wrap',
            'text-max-width': 300,
            'border-width': 4,
            'border-color': '#2d5a7b'
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 4,
            'line-color': '#666',
            'target-arrow-color': '#666',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'arrow-scale': 1.5
          }
        },
        {
          selector: 'node:selected',
          style: {
            'border-width': 5,
            'border-color': '#ff0000',
            'background-color': '#5a8bc7'
          }
        }
      ],

      layout: {
        name: 'dagre',
        rankDir: 'TB',
        nodeSep: 30,   // Reduced spacing!
        rankSep: 70,   // Reduced spacing!
        padding: 50
      },

      minZoom: 0.1,
      maxZoom: 5,
      wheelSensitivity: 0.2
    });

    cyRef.current.on('zoom', () => {
      setZoomLevel(cyRef.current.zoom());
    });

    cyRef.current.on('tap', 'node', (evt) => {
      const node = evt.target;
      const stageId = node.data('id');
      console.log('[GraphViewer] Block clicked:', stageId);
      setSelectedStageId(stageId);
      setViewMode('detail');
    });

    setTimeout(() => {
      if (cyRef.current) {
        cyRef.current.fit(60);
        setZoomLevel(cyRef.current.zoom());
      }
    }, 200);
  };

  const createStageDetailGraph = (nodes, edges, stages, stageId) => {
    // Find the selected stage
    const stage = stages.find(s => s.id === stageId);
    if (!stage) {
      console.error('[GraphViewer] Stage not found:', stageId);
      return;
    }

    // Filter nodes to only those in this stage
    const stageNodeIds = new Set(stage.children);
    const stageNodes = nodes.filter(node => {
      const nodeId = node.data?.id || node.id;
      return stageNodeIds.has(nodeId);
    });

    // Filter edges to only those within this stage
    const stageEdges = edges.filter(edge => {
      const src = edge.data?.source || edge.source;
      const tgt = edge.data?.target || edge.target;
      return stageNodeIds.has(src) && stageNodeIds.has(tgt);
    });

    console.log('[GraphViewer] Stage Detail:', stage.label);
    console.log('  Nodes:', stageNodes.length, '/', nodes.length);
    console.log('  Edges:', stageEdges.length);

    const cyNodes = stageNodes.map(node => ({
      data: {
        id: node.data?.id || node.id,
        label: node.data?.label || node.data?.type || 'Node',
        type: node.data?.type || 'Unknown'
      }
    }));

    const cyEdges = stageEdges.map((edge, idx) => ({
      data: {
        id: edge.data?.id || edge.id || `e${idx}`,
        source: edge.data?.source || edge.source,
        target: edge.data?.target || edge.target
      }
    }));

    cyRef.current = cytoscape({
      container: containerRef.current,
      elements: [...cyNodes, ...cyEdges],

      style: [
        {
          selector: 'node',
          style: {
            'background-color': (ele) => {
              const type = ele.data('type') || '';
              if (type.includes('Conv')) return '#4a7ba7';
              if (type.includes('Relu')) return '#9d4e40';
              if (type.includes('Pool')) return '#4a7a4a';
              if (type.includes('Norm')) return '#4a7a65';
              if (type.includes('Gemm') || type.includes('MatMul')) return '#7a4a9d';
              return '#777';
            },
            'label': 'data(label)',
            'color': '#fff',
            'text-valign': 'center',
            'text-halign': 'center',
            'font-size': '16px',
            'font-weight': '600',
            'font-family': '-apple-system, sans-serif',
            'width': 160,
            'height': 80,
            'shape': 'roundrectangle',
            'text-wrap': 'wrap',
            'text-max-width': 150,
            'border-width': 3,
            'border-color': '#000'
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 2,
            'line-color': '#999',
            'target-arrow-color': '#999',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'arrow-scale': 1
          }
        },
        {
          selector: 'node:selected',
          style: {
            'border-width': 4,
            'border-color': '#ff0000'
          }
        }
      ],

      layout: {
        name: 'dagre',
        rankDir: 'TB',
        nodeSep: 40,
        rankSep: 60,
        padding: 50
      },

      minZoom: 0.1,
      maxZoom: 10,
      wheelSensitivity: 0.2
    });

    cyRef.current.on('zoom', () => {
      setZoomLevel(cyRef.current.zoom());
    });

    cyRef.current.on('tap', 'node', (evt) => {
      const node = evt.target;
      setSelectedNode({
        id: node.data('id'),
        type: node.data('type'),
        label: node.data('label')
      });
    });

    setTimeout(() => {
      if (cyRef.current) {
        cyRef.current.fit(80);  // More padding for better view
        setZoomLevel(cyRef.current.zoom());
      }
    }, 200);
  };

  const createDetailGraph = (nodes, edges) => {
    // Full detail view (all nodes) - fallback
    const cyNodes = nodes.map(node => ({
      data: {
        id: node.data?.id || node.id,
        label: node.data?.label || node.data?.type || 'Node',
        type: node.data?.type || 'Unknown'
      }
    }));

    const cyEdges = edges.map((edge, idx) => ({
      data: {
        id: edge.data?.id || edge.id || `e${idx}`,
        source: edge.data?.source || edge.source,
        target: edge.data?.target || edge.target
      }
    }));

    cyRef.current = cytoscape({
      container: containerRef.current,
      elements: [...cyNodes, ...cyEdges],

      style: [
        {
          selector: 'node',
          style: {
            'background-color': (ele) => {
              const type = ele.data('type') || '';
              if (type.includes('Conv')) return '#4a7ba7';
              if (type.includes('Relu')) return '#9d4e40';
              if (type.includes('Pool')) return '#4a7a4a';
              if (type.includes('Norm')) return '#4a7a65';
              if (type.includes('Gemm') || type.includes('MatMul')) return '#7a4a9d';
              return '#777';
            },
            'font-size': '24px',
            'font-weight': 'bold',
            'font-family': 'Segoe UI, sans-serif',
            'width': 280,
            'height': 120,
            'shape': 'roundrectangle',
            'text-wrap': 'ellipsis',
            'text-max-width': 260,
            'border-width': 3,
            'border-color': '#333',
            'text-valign': 'center',
            'text-halign': 'center',
            'transition-property': 'background-color, line-color, target-arrow-color',
            'transition-duration': '0.5s'
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 5,
            'line-color': '#A0A0A0',
            'target-arrow-color': '#A0A0A0',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'arrow-scale': 1.5
          }
        },
        {
          selector: 'node:selected',
          style: {
            'border-width': 3,
            'border-color': '#ff0000'
          }
        }
      ],

      layout: {
        name: 'dagre',
        rankDir: 'TB',
        nodeSep: 30,
        rankSep: 50,
        padding: 40
      },

      minZoom: 0.01,
      maxZoom: 10,
      wheelSensitivity: 0.2
    });

    cyRef.current.on('zoom', () => {
      setZoomLevel(cyRef.current.zoom());
    });

    cyRef.current.on('tap', 'node', (evt) => {
      const node = evt.target;
      setSelectedNode({
        id: node.data('id'),
        type: node.data('type'),
        label: node.data('label')
      });
    });

    cyRef.current.on('dbltap', 'node', (evt) => {
      const node = evt.target;
      const type = node.data('type');
      if (type && type.includes('Conv')) {
        setModalContent({
          id: node.data('id'),
          type: type,
          label: node.data('label')
        });
        setShowModal(true);
      }
    });

    setTimeout(() => {
      if (cyRef.current) {
        cyRef.current.fit(50);
        setZoomLevel(cyRef.current.zoom());
      }
    }, 200);
  };

  const handleZoomIn = () => {
    if (cyRef.current) {
      cyRef.current.zoom(cyRef.current.zoom() * 1.5);
      cyRef.current.center();
    }
  };

  const handleZoomOut = () => {
    if (cyRef.current) {
      cyRef.current.zoom(cyRef.current.zoom() * 0.67);
      cyRef.current.center();
    }
  };

  const handleFit = () => {
    if (cyRef.current) {
      cyRef.current.fit(60);
    }
  };

  const backToOverview = () => {
    setViewMode('overview');
    setSelectedStageId(null);
  };

  // Get current stage info
  const currentStage = selectedStageId && modelJson?.stages
    ? modelJson.stages.find(s => s.id === selectedStageId)
    : null;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#FAFAFA' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Node Detail Modal */}
      {showModal && modalContent && (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }} onClick={() => setShowModal(false)}>
          <div style={{
            width: '500px',
            background: 'white',
            borderRadius: '12px',
            padding: '24px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: 0, fontSize: '18px', borderBottom: '1px solid #eee', paddingBottom: '12px' }}>
              🔧 Node Details: {modalContent.label}
            </h3>

            <div style={{ fontSize: '14px', color: '#555', lineHeight: '1.6' }}>
              <div><strong>Type:</strong> {modalContent.type}</div>
              <div><strong>ID:</strong> {modalContent.id}</div>
              <div style={{ marginTop: '12px', background: '#f5f5f5', padding: '12px', borderRadius: '8px' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>Internal Structure</div>
                <div>• Weights: [Unknown] (Requires Deep Inspection)</div>
                <div>• Bias: [Present]</div>
                <div>• Pruning Status: 0% (Dense)</div>
              </div>

              <div style={{ marginTop: '12px' }}>
                <strong>Incoming Connections:</strong>
                <ul style={{ margin: '4px 0', paddingLeft: '20px' }}>
                  <li>Previous Node (Input)</li>
                </ul>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
              <button onClick={() => setShowModal(false)} style={{
                padding: '8px 16px',
                background: '#333',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Info */}
      {modelJson && (
        <div style={{
          position: 'absolute',
          top: '16px',
          left: '16px',
          background: 'rgba(255,255,255,0.96)',
          padding: '12px 16px',
          borderRadius: '8px',
          fontSize: '11px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          border: '1px solid #e0e0e0',
          lineHeight: '1.6',
          fontFamily: 'monospace'
        }}>
          <div style={{ fontWeight: '600', color: '#333', marginBottom: '6px' }}>
            {viewMode === 'overview' ? '🌍 Overview' : `🔍 ${currentStage?.label || 'Detail'}`}
          </div>
          <div>Zoom: {zoomLevel.toFixed(2)}x</div>
          {viewMode === 'overview' && modelJson.stages && (
            <div>Blocks: {modelJson.stages.length}</div>
          )}
          {viewMode === 'detail' && currentStage && (
            <div>Nodes: {currentStage.children.length}</div>
          )}
        </div>
      )}

      {/* Controls */}
      <div style={{
        position: 'absolute',
        bottom: '20px',
        right: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px'
      }}>
        {viewMode === 'detail' && (
          <button
            onClick={backToOverview}
            style={{
              padding: '12px 20px',
              background: '#4a7ba7',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: '600',
              cursor: 'pointer',
              boxShadow: '0 3px 10px rgba(0,0,0,0.15)'
            }}
          >
            ← Back to Overview
          </button>
        )}
        <button onClick={handleZoomIn} style={btnStyle}>+</button>
        <button onClick={handleZoomOut} style={btnStyle}>−</button>
        <button onClick={handleFit} style={btnStyle}>⊡</button>
      </div>

      {/* Guide */}
      <div style={{
        position: 'absolute',
        bottom: '20px',
        left: '20px',
        background: 'rgba(79, 70, 229, 0.95)',
        color: '#fff',
        padding: '12px 16px',
        borderRadius: '8px',
        fontSize: '11px',
        maxWidth: '260px',
        lineHeight: '1.6',
        boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)'
      }}>
        <div style={{ fontWeight: '600', marginBottom: '6px' }}>💡 사용법</div>
        {viewMode === 'overview' ? (
          <>
            <div>• 블록 클릭: 해당 블록 상세보기</div>
            <div>• 12개 블록, 각 10개 레이어</div>
          </>
        ) : (
          <>
            <div>• 노드 클릭: 상세 정보</div>
            <div>• Back 버튼: Overview로 복귀</div>
          </>
        )}
      </div>
    </div>
  );
}

const btnStyle = {
  width: '44px',
  height: '44px',
  background: 'rgba(255,255,255,0.98)',
  border: '1px solid #ccc',
  borderRadius: '10px',
  fontSize: '22px',
  fontWeight: 'bold',
  cursor: 'pointer',
  boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
  transition: 'all 0.2s',
  color: '#333'
};
