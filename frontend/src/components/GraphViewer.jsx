import React, { useEffect, useRef } from 'react';
import useStore from '../store';
import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import expandCollapse from 'cytoscape-expand-collapse'; // 1. 라이브러리 import

cytoscape.use(dagre);
cytoscape.use(expandCollapse); // 2. 라이브러리 등록

function GraphViewer() {
  const { modelJson } = useStore();
  const graphContainerRef = useRef(null);
  const cyRef = useRef(null);

  useEffect(() => {
    if (!modelJson || !graphContainerRef.current) {
      return;
    }

    const animationFrameId = requestAnimationFrame(() => {
      if (!graphContainerRef.current) return;
      if (cyRef.current) cyRef.current.destroy();

      const elements = [...modelJson.nodes, ...modelJson.edges];

      cyRef.current = cytoscape({
        container: graphContainerRef.current,
        elements: elements,
        style: [ // 스타일 시트는 그대로 유지
          { selector: 'node', style: { 'background-color': '#888', 'label': 'data(label)' } },
          { selector: 'edge', style: { 'width': 2, 'line-color': '#555', 'target-arrow-color': '#555', 'target-arrow-shape': 'triangle', 'curve-style': 'bezier' } },
          { selector: 'node[type="Input"]', style: { 'background-color': '#22c55e' } },
          { selector: 'node[type="Output"]', style: { 'background-color': '#ef4444' } },
          { selector: 'node[type="Conv"]', style: { 'background-color': '#3b82f6', 'shape': 'rectangle' } },
          { selector: 'node[type="Relu"]', style: { 'background-color': '#f59e0b' } },
          { selector: 'node[type="Add"]', style: { 'background-color': '#a855f7', 'shape': 'diamond' } },
          { selector: 'node[type="MaxPool"]', style: { 'background-color': '#6366f1', 'shape': 'diamond' } },
          { selector: ':parent', style: { 'background-opacity': 0.2, 'background-color': '#999', 'border-color': '#999', 'border-width': 2, 'font-size': 18, 'font-weight': 'bold', 'text-valign': 'top', 'text-halign': 'center' } }
        ],
        layout: { name: 'preset' },
        userPanningEnabled: true,
        userZoomingEnabled: true,
      });

      // 3. 확장/축소 API를 가져옵니다.
      const api = cyRef.current.expandCollapse({
        layoutBy: {
          name: "dagre",
          rankDir: 'TB',
          spacingFactor: 1.2,
          fit: true,
          padding: 30
        },
        fisheye: false,
        animate: true,
      });

      // 4. ★★★★★
      //    모든 노드를 '축소된(collapsed)' 상태로 시작합니다.
      //    이것이 자식 노드를 숨기는 핵심입니다.
      api.collapseAll();

      // 5. 이제 '부모 노드'만을 대상으로 dagre 레이아웃을 실행합니다.
      cyRef.current.layout({
        name: 'dagre',
        rankDir: 'TB', // Top-to-Bottom
        spacingFactor: 1.5
      }).run();

      // 6. 부모 노드들만 보이도록 뷰를 맞춥니다.
      //    cyRef.current.nodes(':parent') -> 부모 노드만 선택
      cyRef.current.fit(cyRef.current.nodes(':parent'), 30); // 30px 여백

    });

    return () => {
      cancelAnimationFrame(animationFrameId);
      if (cyRef.current) cyRef.current.destroy();
    };
  }, [modelJson]);

  if (!modelJson) {
    return null;
  }

  return (
    <div
      ref={graphContainerRef}
      style={{ width: '100%', height: '100%' }}
    />
  );
}

export default GraphViewer;