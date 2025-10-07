import React, { useEffect } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';
import useStore from '../store';

function GraphViewer() {
  const { modelJson, fetchGraphData } = useStore();

  useEffect(() => {
    fetchGraphData();
  }, [fetchGraphData]);

  if (!modelJson) {
    return <div>Loading graph data...</div>;
  }
  
  // --- 이 부분을 추가하여 데이터 형식을 변환합니다 ---
  // modelJson 객체 안의 nodes 배열과 edges 배열을 하나의 배열로 합칩니다.
  const elements = [
      ...modelJson.nodes,
      ...modelJson.edges
  ];

  return (
    <CytoscapeComponent
      elements={elements} // 변환된 배열을 전달합니다.
      style={{ width: '100%', height: '80vh' }}
      layout={{ name: 'cose' }}
    />
  );
}

export default GraphViewer;