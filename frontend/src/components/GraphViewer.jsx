import React, { useEffect, useRef, useState } from 'react';
import NodeDetailModal from './NodeDetailModal';
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

  // New State for Channel Inspection
  const [focusedChannel, setFocusedChannel] = useState(null);

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

    const { nodes, edges, stages } = modelJson;

    try {
      // Direct Flat View (Netron Style)
      createOverviewGraph(nodes, edges);
    } catch (error) {
      console.error('[GraphViewer] Error:', error);
    }

    return () => {
      if (cyRef.current) cyRef.current.destroy();
    };
  }, [modelJson, viewMode, selectedStageId, setSelectedNode]);

  // Main Graph Initialization
  const createOverviewGraph = (nodes, edges) => {
    // 1. Prepare Nodes (Flattened)
    const cyNodes = nodes.map(node => ({
      data: {
        id: node.data?.id || node.id,
        label: (node.data?.label || node.data?.type || 'Node').replace('Total', ''),
        type: node.data?.type || 'Unknown',
        fullData: node
      }
    }));

    // 2. Prepare Edges
    const cyEdges = edges.map((edge, idx) => ({
      data: {
        id: edge.data?.id || `e${idx}`,
        source: edge.data?.source || edge.source,
        target: edge.data?.target || edge.target
      }
    }));

    console.log('[GraphViewer] Creating Flat Graph:', cyNodes.length, 'nodes');

    // 3. Initialize Cytoscape
    cyRef.current = cytoscape({
      container: containerRef.current,
      elements: [...cyNodes, ...cyEdges],

      style: [
        {
          selector: 'node',
          style: {
            'background-color': (ele) => {
              const type = ele.data('type') || '';
              // Netron-like Color Scheme
              if (type.includes('Conv')) return '#28a745'; // Green
              if (type.includes('MatMul') || type.includes('Gemm') || type.includes('Linear')) return '#007bff'; // Blue
              if (type.includes('Pool')) return '#e83e8c'; // Pink/Red
              if (type.includes('Relu') || type.includes('Act') || type.includes('Softmax')) return '#6f42c1'; // Purple
              if (type.includes('Norm') || type.includes('Batch')) return '#fd7e14'; // Orange
              if (type.includes('Concat') || type.includes('Add')) return '#795548'; // Brown
              if (type.includes('Input') || type.includes('Output')) return '#20c997'; // Cyan
              return '#6c757d'; // Gray default
            },
            'label': (ele) => {
              const type = ele.data('type');
              const label = ele.data('label');
              // Show Type on top, Name below? or just Type
              // Netron shows Type inside box usually.
              return type;
            },
            'color': '#fff',
            'text-valign': 'center',
            'text-halign': 'center',
            'font-size': '10px',
            'font-weight': '600',
            'font-family': 'Inter, sans-serif',
            'width': 120,
            'height': 36,
            'shape': 'round-rectangle',
            'text-wrap': 'ellipsis',
            'text-max-width': 110,
            'border-width': 1,
            'border-color': 'rgba(255,255,255,0.2)',
            'overlay-opacity': 0
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 1.5,
            'line-color': '#6c757d',
            'target-arrow-color': '#6c757d',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'arrow-scale': 0.8
          }
        },
        {
          selector: 'node:selected',
          style: {
            'border-width': 2,
            'border-color': '#fff',
            'background-color': '#495057'
          }
        }
      ],

      layout: {
        name: 'dagre',
        rankDir: 'TB',
        nodeSep: 40,
        rankSep: 60,
        padding: 50,
        align: 'UL', // Align Top-Left often helps straightness more than UR
        ranker: 'longest-path' // Tries to keep longest chains straight
      },

      minZoom: 0.1, // Allow zooming out more?
      maxZoom: 3,
      wheelSensitivity: 0.1,
      zoomingEnabled: true,
      userPanningEnabled: false,
      boxSelectionEnabled: false
    });

    // 4. Events
    cyRef.current.on('zoom pan', () => {
      setZoomLevel(cyRef.current.zoom());
      updateScrollbar();
    });

    // Custom Wheel Scroll
    if (containerRef.current) {
      containerRef.current.addEventListener('wheel', (e) => {
        e.preventDefault();
        const pan = cyRef.current.pan();
        const scrollSpeed = 0.5;
        cyRef.current.pan({ x: pan.x, y: pan.y - e.deltaY * scrollSpeed });
        updateScrollbar();
      }, { passive: false });
    }

    cyRef.current.on('tap', 'node', (evt) => {
      const node = evt.target;
      setSelectedNode({
        id: node.data('id'),
        type: node.data('type'),
        data: node.data('fullData').data, // Unwrap the inner data
        label: node.data('label')
      });
    });

    cyRef.current.on('dbltap', 'node', (evt) => {
      const node = evt.target;
      setModalContent(node.data('id')); // Just pass ID, modal fetches details
      setShowModal(true);
    });

    // Initial Fit
    setTimeout(() => {
      if (cyRef.current && containerRef.current) {
        const extent = cyRef.current.elements().boundingBox();
        const containerWidth = containerRef.current.clientWidth;

        cyRef.current.zoom(1.0);
        cyRef.current.pan({
          x: (containerWidth - extent.w) / 2 - extent.x1,
          y: 50
        });
        setZoomLevel(cyRef.current.zoom());
        updateScrollbar();
      }
    }, 100);
  };

  // Scrollbar Logic
  const [scrollPos, setScrollPos] = useState(0);
  const [scrollHeight, setScrollHeight] = useState(0);

  const updateScrollbar = () => {
    if (!cyRef.current) return;
    const pan = cyRef.current.pan();
    const zoom = cyRef.current.zoom();
    const height = cyRef.current.height();
    const extent = cyRef.current.elements().boundingBox();

    // Calculate simplistic scroll bar
    // Total virtual height ~ extent.h * zoom
    // Visible height ~ height
    // Pan.y relates to scroll position

    // Map pan.y to scrollbar position (Rough approximation)
    const contentHeight = extent.h * zoom + 100;
    const visibleRatio = Math.min(height / contentHeight, 1);

    setScrollHeight(Math.max(visibleRatio * height, 20)); // Min 20px handle

    // Pan.y is 50 when at top. Decrease as we scroll down.
    // Progress = (StartPanY - CurrentPanY) / TotalScrollable

    const startPanY = 50;
    const maxScroll = contentHeight - height;

    if (maxScroll <= 0) {
      setScrollPos(0);
      return;
    }

    const scrolled = startPanY - pan.y;
    const ratio = Math.max(0, Math.min(scrolled / maxScroll, 1));

    setScrollPos(ratio * (height - (visibleRatio * height)));
  };

  const createStageDetailGraph = (nodes, edges, stages, stageId) => {
    const stage = stages.find(s => s.id === stageId);
    if (!stage) return;

    // Filter nodes belonging to this stage
    // Assuming stage.children contains node IDs
    const stageNodeIds = new Set(stage.children);
    console.log('[GraphViewer Debug] Stage:', stageId, 'Children Count:', stage.children.length);
    console.log('[GraphViewer Debug] Total Nodes:', nodes.length, 'First Node:', nodes[0]);
    const matched = nodes.filter(n => stageNodeIds.has(n.name));
    console.log('[GraphViewer Debug] Matched Nodes:', matched.length);

    // Map existing nodes to Cytoscape format

    // Map existing nodes to Cytoscape format
    const cyNodes = nodes
      .filter(n => stageNodeIds.has(n.name)) // Assuming n.name is the ID used in children
      .map(n => ({
        data: {
          id: n.name,
          label: n.name.split('/').pop(), // Short label
          type: n.op_type,
          fullData: n
        }
      }));

    // Filter edges that are internal to this stage
    const cyEdges = edges
      .filter(e => stageNodeIds.has(e.from) && stageNodeIds.has(e.to))
      .map(e => ({
        data: {
          id: `edge_${e.from}_${e.to}`,
          source: e.from,
          target: e.to
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
              // Netron Colors
              if (type.includes('Conv')) return '#4CAF50';
              if (type.includes('MatMul') || type.includes('Gemm')) return '#2196F3';
              if (type.includes('Pool')) return '#E91E63';
              if (type.includes('Relu') || type.includes('Act')) return '#9C27B0';
              if (type.includes('Norm')) return '#FF9800';
              if (type.includes('Concat') || type.includes('Add')) return '#795548';
              return '#607D8B';
            },
            'label': 'data(label)',
            'color': '#fff',
            'text-valign': 'center',
            'text-halign': 'center',
            'font-size': '11px',
            'font-weight': '400',
            'font-family': 'Inter, sans-serif',
            'width': 140,
            'height': 40,
            'shape': 'round-rectangle',
            'text-wrap': 'ellipsis',
            'text-max-width': 130,
            'border-width': 0
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 2,
            'line-color': '#888',
            'target-arrow-color': '#888',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'arrow-scale': 1.0
          }
        },
        {
          selector: 'node:selected',
          style: {
            'border-width': 2,
            'border-color': '#fff'
          }
        }
      ],

      layout: {
        name: 'dagre',
        rankDir: 'TB',
        nodeSep: 30,
        rankSep: 50,
        padding: 30
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

    cyRef.current.on('dbltap', 'node', (evt) => {
      const node = evt.target;
      cyRef.current.animate({
        center: { eles: node },
        zoom: Math.max(cyRef.current.zoom() * 1.5, 1.2),
        duration: 400,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
      });

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
        cyRef.current.fit(40);  // More padding for better view
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
              // Netron Colors
              if (type.includes('Conv')) return '#4CAF50';
              if (type.includes('MatMul') || type.includes('Gemm')) return '#2196F3';
              if (type.includes('Pool')) return '#E91E63';
              if (type.includes('Relu') || type.includes('Act')) return '#9C27B0';
              if (type.includes('Norm')) return '#FF9800';
              return '#607D8B';
            },
            'label': 'data(label)',
            'color': '#fff',
            'text-valign': 'center',
            'text-halign': 'center',
            'font-size': '11px',
            'font-weight': '400',
            'font-family': 'Inter, sans-serif',
            'width': 140,
            'height': 40,
            'shape': 'round-rectangle',
            'text-wrap': 'ellipsis',
            'text-max-width': 130,
            'border-width': 0
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 2,
            'line-color': '#888',
            'target-arrow-color': '#888',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'arrow-scale': 1.0
          }
        },
        {
          selector: 'node:selected',
          style: {
            'border-width': 2,
            'border-color': '#fff'
          }
        }
      ],

      layout: {
        name: 'dagre',
        rankDir: 'TB',
        nodeSep: 30,
        rankSep: 50,
        padding: 30
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

    cyRef.current.on('dbltap', 'node', (evt) => {
      const node = evt.target;
      cyRef.current.animate({
        center: { eles: node },
        zoom: Math.max(cyRef.current.zoom() * 1.5, 1.2),
        duration: 400,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
      });
    });

    setTimeout(() => {
      if (cyRef.current) {
        cyRef.current.fit(10);
        setZoomLevel(cyRef.current.zoom());
      }
    }, 200);
  };

  const handleZoomIn = () => {
    if (cyRef.current) {
      cyRef.current.zoom(cyRef.current.zoom() * 1.5);
      cyRef.current.center(); // Center might be bad if we locked X
      updateScrollbar();
    }
  };

  const handleZoomOut = () => {
    if (cyRef.current) {
      cyRef.current.zoom(cyRef.current.zoom() * 0.67);
      // center...
      updateScrollbar();
    }
  };

  const handleFit = () => {
    // Reset to Top Center
    if (cyRef.current) {
      const extent = cyRef.current.elements().boundingBox();
      const containerWidth = containerRef.current.clientWidth;

      cyRef.current.zoom(1.0);
      cyRef.current.pan({
        x: (containerWidth - extent.w) / 2 - extent.x1,
        y: 50
      });
      updateScrollbar();
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
    <div style={{ position: 'relative', width: '100%', height: '100%', background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)', overflow: 'hidden' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Info Overlay */}
      {modelJson && (
        <div style={{
          position: 'absolute',
          top: '16px',
          left: '16px',
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          padding: '8px 12px',
          borderRadius: '6px',
          fontSize: '11px',
          color: '#ccc',
          border: '1px solid rgba(255,255,255,0.1)',
          fontFamily: 'Inter, sans-serif'
        }}>
          <div style={{ fontWeight: '600', color: '#fff', marginBottom: '4px' }}>
            🌍 Overview
          </div>
          <div>Zoom: {zoomLevel.toFixed(2)}x</div>
        </div>
      )}

      {/* Custom Scrollbar */}
      <div style={{
        position: 'absolute',
        right: '4px',
        top: '4px',
        bottom: '4px',
        width: '6px',
        background: 'rgba(255,255,255,0.05)',
        borderRadius: '3px',
        zIndex: 10
      }}>
        <div style={{
          position: 'absolute',
          top: `${scrollPos}px`,
          left: 0,
          right: 0,
          height: `${scrollHeight}px`,
          background: 'rgba(255,255,255,0.3)',
          borderRadius: '3px',
          transition: 'top 0.1s linear'
        }} />
      </div>

      {/* Node Detail Modal */}
      {showModal && modalContent && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.8)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }} onClick={() => setShowModal(false)}>
          <div style={{
            background: '#1a1a2e',
            color: '#fff',
            padding: '24px',
            borderRadius: '12px',
            border: '1px solid #333',
            width: '600px',
            maxWidth: '90%',
            maxHeight: '80vh',
            overflowY: 'auto',
            fontFamily: 'Inter, sans-serif'
          }} onClick={e => e.stopPropagation()}>
            <h2 style={{ marginTop: 0, borderBottom: '1px solid #333', paddingBottom: '12px' }}>
              {modalContent.label || modalContent.id}
            </h2>
            <div style={{ marginBottom: '16px', color: '#888', fontSize: '13px' }}>
              Type: <span style={{ color: '#4CAF50' }}>{modalContent.type}</span>
            </div>

            <div style={{ background: '#0f0f1a', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
              <h4 style={{ margin: '0 0 12px 0', color: '#ccc' }}>Channel Pruning Selection</h4>
              <p style={{ fontSize: '12px', color: '#666', marginBottom: '12px' }}>
                Select channels to inspect or prune (Mock Data: 64 Channels)
              </p>

              <div style={{ display: 'flex', gap: '16px' }}>
                {/* Left: Grid */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(36px, 1fr))',
                  gap: '6px',
                  maxHeight: '200px',
                  overflowY: 'auto',
                  width: '60%',
                  paddingRight: '6px'
                }}>
                  {Array.from({ length: 64 }).map((_, i) => (
                    <div key={i}
                      onClick={() => setFocusedChannel(i)}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '9px',
                        color: focusedChannel === i ? '#fff' : '#888',
                        cursor: 'pointer',
                        padding: '4px',
                        borderRadius: '4px',
                        background: focusedChannel === i ? '#6366f1' : '#13131f',
                        border: focusedChannel === i ? '1px solid #818cf8' : '1px solid transparent',
                        height: '36px'
                      }}
                    >
                      <span>CH</span>
                      <strong>{i}</strong>
                    </div>
                  ))}
                </div>

                {/* Right: Inspection Panel */}
                <div style={{ width: '40%', borderLeft: '1px solid #333', paddingLeft: '16px' }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '12px', color: '#fff' }}>
                    Channel {focusedChannel !== null ? focusedChannel : '-'} Weights
                  </div>

                  {focusedChannel !== null ? (
                    <div style={{ fontSize: '11px', color: '#ccc', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#888' }}>Mean Weight:</span>
                        <span>{(Math.random() * 0.5).toFixed(6)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#888' }}>Max Weight:</span>
                        <span>{(Math.random() * 2.0).toFixed(6)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#888' }}>L1 Norm:</span>
                        <span>{(Math.random() * 10).toFixed(4)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#888' }}>Sparsity:</span>
                        <span style={{ color: '#4CAF50' }}>{(Math.random() * 100).toFixed(1)}%</span>
                      </div>

                      <div style={{ marginTop: '12px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '8px' }}>
                        <div style={{ fontSize: '10px', color: '#666', marginBottom: '4px' }}>Decision Support</div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                          <input type="checkbox" />
                          <span style={{ color: '#ef4444' }}>Prune this Channel</span>
                        </label>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: '11px', color: '#666', fontStyle: 'italic', marginTop: '20px' }}>
                      Click a channel box (left) to view its specific weight statistics.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div style={{ background: '#0f0f1a', padding: '16px', borderRadius: '8px' }}>
              <h4 style={{ margin: '0 0 8px 0', color: '#ccc' }}>Attributes</h4>
              <pre style={{ fontSize: '11px', color: '#aaa', overflowX: 'auto' }}>
                {JSON.stringify(modalContent.fullData, null, 2)}
              </pre>
            </div>

            <div style={{ marginTop: '20px', textAlign: 'right', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  padding: '8px 16px',
                  background: 'transparent',
                  color: '#ccc',
                  border: '1px solid #444',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  // Logic to save pruning would go here
                  setShowModal(false);
                }}
                style={{
                  padding: '8px 16px',
                  background: '#e83e8c',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                Apply Pruning
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Guide */}
      <div style={{
        position: 'absolute',
        bottom: '20px',
        left: '20px',
        background: 'rgba(0, 0, 0, 0.7)',
        color: '#eee',
        padding: '10px 14px',
        borderRadius: '6px',
        fontSize: '11px',
        border: '1px solid rgba(255,255,255,0.1)',
        fontFamily: 'Inter, sans-serif'
      }}>
        <div style={{ fontWeight: '600', marginBottom: '4px', color: '#fff' }}>Controls</div>
        <div>• Single Click: Select & Info</div>
        <div>• Double Click: Expand/Detail</div>
        <div>• Scroll: Zoom</div>
      </div>

      {/* Zoom Controls */}
      <div style={{
        position: 'absolute',
        bottom: '20px',
        right: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      }}>
        {viewMode === 'detail' && (
          <button onClick={backToOverview} style={darkBtnStyle}>← Back</button>
        )}
        <button onClick={handleZoomIn} style={darkBtnStyle}>+</button>
        <button onClick={handleZoomOut} style={darkBtnStyle}>−</button>
        <button onClick={handleFit} style={darkBtnStyle}>⊡</button>
        {/* Detail Modal */}
        <NodeDetailModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          nodeId={modalContent}
          onPruningComplete={(stats) => {
            alert(`Pruning Applied!\n${stats.message}`);
            refreshGraph();
          }}
        />
      </div>
    </div>
  );
}

const darkBtnStyle = {
  width: '36px',
  height: '36px',
  background: 'rgba(255,255,255,0.1)',
  border: '1px solid rgba(255,255,255,0.2)',
  borderRadius: '8px',
  fontSize: '16px',
  color: '#fff',
  cursor: 'pointer',
  backdropFilter: 'blur(4px)',
  transition: 'all 0.2s',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
};
