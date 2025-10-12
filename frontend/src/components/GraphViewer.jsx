import React, { useEffect, useRef } from 'react';
import useStore from '../store';
import cytoscape from 'cytoscape'; // 라이브러리 직접 import
import dagre from 'cytoscape-dagre';

cytoscape.use(dagre); // cytoscape에 dagre 확장 기능 등록

function GraphViewer() {
  const { modelJson } = useStore();
  const graphContainerRef = useRef(null); // 그래프가 그려질 div
  const cyInstance = useRef(null);      // 생성된 그래프 인스턴스를 저장할 공간

  // 1. 컴포넌트가 처음 생길 때 '단 한 번만' 실행되는 부분
  useEffect(() => {
    // 그래프 인스턴스를 초기화합니다. 아직 데이터는 비어있습니다.
    if (graphContainerRef.current && !cyInstance.current) {
      cyInstance.current = cytoscape({
        container: graphContainerRef.current,
        elements: [], // 처음엔 비어있는 상태로 시작
        style: [
          { selector: 'node', style: { 'background-color': '#888', 'label': 'data(id)' } },
          { selector: 'edge', style: { 'width': 2, 'line-color': '#555' } }
        ],
        layout: { name: 'preset' },
        userPanningEnabled: true,
        userZoomingEnabled: true,
      });
    }

    // 컴포넌트가 사라질 때 그래프 인스턴스를 파괴하여 메모리 누수 방지
    return () => {
      if (cyInstance.current) {
        cyInstance.current.destroy();
        cyInstance.current = null;
      }
    };
  }, []); // 의존성 배열이 비어있어, 마운트될 때 딱 한 번만 실행됩니다.

  // 2. 'modelJson' 데이터가 바뀔 때만 실행되는 부분
  useEffect(() => {
    // 그래프 인스턴스가 준비되었고, 새로운 모델 데이터가 들어왔을 때
    if (cyInstance.current && modelJson) {
      const cy = cyInstance.current;
      const elements = [...modelJson.nodes, ...modelJson.edges];

      // 브라우저가 DOM 계산을 완료할 시간을 줍니다.
      const timer = setTimeout(() => {
        // 기존 요소를 모두 지우고 새로운 요소로 교체합니다.
        cy.elements().remove();
        cy.add(elements);

        // 새 데이터에 맞춰 레이아웃을 다시 실행합니다.
        const layout = cy.layout({ name: 'dagre', rankDir: 'TB' });
        layout.run();

        // 레이아웃 실행이 끝난 후, 뷰포트에 맞춥니다.
        layout.promiseOn('layoutstop').then(() => {
          cy.fit(null, 30); // 30px 여백
        });
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [modelJson]); // 이 로직은 오직 modelJson이 바뀔 때만 실행됩니다.

  if (!modelJson) {
    return null;
  }

  // 실제로는 이 비어있는 div에 useEffect 훅이 그래프를 그려넣습니다.
  return (
    <div
      ref={graphContainerRef}
      style={{ width: '100%', height: '100%' }}
    />
  );
}

export default GraphViewer;