import React from 'react';
import useStore from '../store';

function InfoPanel() {
  const { selectedNode } = useStore();

  return (
    <div className="info-panel-container">
      <h3>2. Layer Information</h3>
      {selectedNode ? (
        <div>
          <p><strong>ID:</strong> {selectedNode.id}</p>
          <p><strong>Label:</strong> {selectedNode.label}</p>
          {/* 앞으로 여기에 더 많은 정보가 추가될 예정입니다. */}
        </div>
      ) : (
        <p>Click on a node in the graph to see its details.</p>
      )}
    </div>
  );
}

export default InfoPanel;