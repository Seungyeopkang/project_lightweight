import React, { useEffect, useRef } from 'react';
import useStore from '../store';
import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import expandCollapse from 'cytoscape-expand-collapse';

cytoscape.use(dagre);
cytoscape.use(expandCollapse);

function GraphViewer() {
  const { modelJson } = useStore();
  const graphContainerRef = useRef(null);
  const cyRef = useRef(null);
  const apiRef = useRef(null);

  useEffect(() => {
    if (!modelJson || !graphContainerRef.current) return;
    if (cyRef.current) cyRef.current.destroy();

    const cy = cytoscape({
      container: graphContainerRef.current,
      elements: [...modelJson.nodes, ...modelJson.edges],
      style: [
        {
          selector: 'node',
          style: {
            'background-color': '#777',
            'label': 'data(label)',
            'font-size': 20,
            'text-valign': 'center',
            'text-halign': 'center',
            'color': '#fff',
            'width': 120,
            'height': 70,
            'text-outline-color': '#000',
            'text-outline-width': 2
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 4,
            'line-color': '#888',
            'target-arrow-color': '#888',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier'
          }
        },
        {
          selector: 'node[type="Input"]',
          style: {
            'background-color': '#22c55e',
            'shape': 'rectangle',
            'width': 220,
            'height': 110,
            'font-size': 30,
            'font-weight': 'bold'
          }
        },
        {
          selector: 'node[type="Output"]',
          style: {
            'background-color': '#ef4444',
            'shape': 'rectangle',
            'width': 220,
            'height': 110,
            'font-size': 30,
            'font-weight': 'bold'
          }
        },
        {
          selector: 'node[type="Conv"]',
          style: {
            'background-color': '#3b82f6',
            'shape': 'rectangle',
            'width': 140,
            'height': 70
          }
        },
        {
          selector: 'node[type="Relu"]',
          style: {
            'background-color': '#fbbf24',
            'shape': 'ellipse',
            'width': 120,
            'height': 60
          }
        },
        {
          selector: 'node[type="MaxPool"]',
          style: {
            'background-color': '#6366f1',
            'shape': 'round-rectangle',
            'width': 130,
            'height': 65
          }
        },
        {
          selector: ':parent',
          style: {
            'shape': 'rectangle',
            'background-opacity': 0.35,
            'background-color': '#333',
            'border-color': '#aaa',
            'border-width': 8,
            'font-size': 48,
            'font-weight': 'bold',
            'color': '#fff',
            'text-outline-color': '#000',
            'text-outline-width': 4,
            'text-valign': 'center',
            'text-halign': 'center',
            'padding': '40px',
            'width': 900,
            'height': 300
          }
        },
        {
          selector: ':parent:selected',
          style: {
            'border-color': '#3b82f6',
            'border-width': 8
          }
        }
      ],
      layout: { name: 'preset' },
      minZoom: 0.3,
      maxZoom: 4,
      wheelSensitivity: 0.1
    });

    cyRef.current = cy;

    // Expand/Collapse 초기화
    apiRef.current = cy.expandCollapse({
      layoutBy: {
        name: 'dagre',
        rankDir: 'TB',
        spacingFactor: 2.0,
        nodeSep: 180,
        rankSep: 200,
        fit: true,
        padding: 100
      },
      animate: true,
      fisheye: false,
      animationDuration: 400
    });

    // 초기 Stage 크기 고정
    cy.nodes(':parent').forEach(node => {
      node.style({ width: 900, height: 300 });
    });

    apiRef.current.collapseAll();

    // 첫 레이아웃 및 확대 조정
    const layout = cy.layout({
      name: 'dagre',
      rankDir: 'TB',
      spacingFactor: 1.5,
      nodeSep: 150,
      rankSep: 150,
      animate: true
    });
    layout.run();

    layout.promiseOn('layoutstop').then(() => {
      cy.fit(cy.nodes(':visible'), 50);
      cy.zoom(cy.zoom() * 1.4);
      cy.center();
    });

    // 줌 기반 자동 확장/축소
    let lastZoom = cy.zoom();
    const EXPAND_THRESHOLD = 1.4;
    const COLLAPSE_THRESHOLD = 0.9;

    cy.on('zoom', () => {
      const currentZoom = cy.zoom();
      const parents = cy.nodes(':parent');

      if (currentZoom >= EXPAND_THRESHOLD && lastZoom < EXPAND_THRESHOLD) {
        parents.forEach(n => {
          if (n.hasClass('cy-expand-collapse-collapsed-node')) apiRef.current.expand(n);
        });
        cy.layout({ name: 'dagre', animate: true }).run();
      } else if (currentZoom <= COLLAPSE_THRESHOLD && lastZoom > COLLAPSE_THRESHOLD) {
        parents.forEach(n => {
          if (!n.hasClass('cy-expand-collapse-collapsed-node')) apiRef.current.collapse(n);
        });
        cy.layout({ name: 'dagre', animate: true }).run();
      }
      lastZoom = currentZoom;
    });

    // 더블클릭으로 Stage 확장/축소
    cy.on('dblclick', 'node:parent', evt => {
      const node = evt.target;
      if (node.hasClass('cy-expand-collapse-collapsed-node')) {
        apiRef.current.expand(node);
      } else {
        apiRef.current.collapse(node);
      }
      cy.layout({ name: 'dagre', animate: true }).run();
    });

    return () => {
      if (cyRef.current) cyRef.current.destroy();
    };
  }, [modelJson]);

  if (!modelJson) return null;

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div
        ref={graphContainerRef}
        style={{ width: '100%', height: '100%', backgroundColor: '#1a1a1a' }}
      />
      <div
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          backgroundColor: 'rgba(0,0,0,0.7)',
          color: 'white',
          padding: '8px 12px',
          borderRadius: 4,
          fontSize: 14
        }}
      >
        💡 확대하면 Stage 내부 Conv/Relu 표시 / 더블클릭으로 수동 확장
      </div>
    </div>
  );
}

export default GraphViewer;
