import React, { useEffect, useRef } from 'react';
import useStore from '../store';
import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
cytoscape.use(dagre);

function GraphViewer() {
  const { modelJson } = useStore();
  const graphContainerRef = useRef(null);
  const cyRef = useRef(null);

  useEffect(() => {
    if (!modelJson || !graphContainerRef.current) return;
    if (cyRef.current) cyRef.current.destroy();

    // --- True Netron Style: Flat & Vertical ---
    // 가독성을 위해 "Stage" 박스를 제거하고(Flatten), 모든 노드를 일렬로 배치합니다.
    const flatNodes = modelJson.nodes.map(node => ({
      data: { ...node.data, parent: undefined } // 부모(Stage) 종속성 제거
    }));
    const elements = [...flatNodes, ...modelJson.edges];

    const cy = cytoscape({
      container: graphContainerRef.current,
      elements: elements,
      style: [
        // --- Dark Theme Node Base ---
        {
          selector: 'node',
          style: {
            'shape': 'round-rectangle',
            'background-color': '#404040', // Netron Default Gray
            'border-width': 0,
            'label': (n) => {
               const data = n.data();
               let label = data.label; // Op Type (e.g., Conv)
               
               // 속성 정보 추가 (W, B 등)
               if(data.attributes) {
                   if(data.attributes.W) label += `\nW (${data.attributes.W.join('x')})`;
                   if(data.attributes.B) label += `\nB (${data.attributes.B.join('x')})`;
                   if(data.attributes.kernel_shape) label += `\nks: ${data.attributes.kernel_shape.join('x')}`;
                   if(data.attributes.strides) label += `\nstr: ${data.attributes.strides.join('x')}`;
               }
               return label;
            },
            'color': '#ececec', // Light Gray Text
            'font-size': 10,
            'font-family': 'Menlo, Consolas, monospace', // 코드 느낌 폰트
            'font-weight': 'normal',
            'text-valign': 'center',
            'text-halign': 'center',
            'width': 'label',
            'height': 'label',
            'padding': '8px', // 패딩을 줄여서 타이트하게
            'text-wrap': 'wrap',
            'text-max-width': 120,
            'text-justification': 'center',
            'shadow-blur': 0,
            'text-margin-y': 0
          }
        },
        // --- Netron-Specific Operator Styling ---
        {
          selector: "node[type = 'Conv']",
          style: { 
            'background-color': '#3a5e8c', // Netron Blue
            'border-color': '#283c5a',
            'border-width': 1,
            'shape': 'round-rectangle',
            'color': '#ffffff',
            'font-weight': 'bold',
            'text-valign': 'center'
          }
        },
        {
          selector: "node[type = 'Gemm'], node[type = 'MatMul']", // Fully Connected
          style: { 'background-color': '#3a5e8c', 'color': '#ffffff', 'font-weight': 'bold' } 
        },
        {
          selector: "node[type = 'MaxPool'], node[type = 'AveragePool'], node[type = 'GlobalAveragePool']",
          style: { 'background-color': '#386c48', 'color': '#e8f5e9' } // Netron Green
        },
        {
          selector: "node[type = 'Relu'], node[type = 'LeakyRelu'], node[type = 'Sigmoid']",
          style: { 
             'background-color': '#8c3a3a', // Netron Red/Brown
             'width': 60,
             'height': 30,
             'font-size': 9
          }
        },
        {
          selector: "node[type = 'Add'], node[type = 'Concat']",
          style: { 'background-color': '#404040', 'border-width': 1, 'border-color': '#606060' } // Basic Gray
        },
        {
           selector: "node[type = 'Input']",
           style: { 
             'background-color': '#e0e0e0', // Light Gray 
             'color': '#333',
             'font-weight': 'bold',
             'border-radius': 4
           }
        },
        {
           selector: "node[type = 'Output']",
           style: { 
             'background-color': '#e0e0e0', 
             'color': '#333',
             'font-weight': 'bold'
           }
        },
        {
          selector: ':selected',
          style: {
            'border-color': '#d4d4d4', // White selection border
            'border-width': 2,
            'shadow-blur': 10,
            'shadow-color': '#000'
          }
        },
        // --- Edges ---
        {
          selector: 'edge',
          style: {
            'width': 1.5,
            'line-color': '#707070',       // Darker Gray lines
            'target-arrow-color': '#707070',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'arrow-scale': 0.8
          }
        },
        {
           selector: 'edge:selected',
           style: { 'line-color': '#ececec', 'target-arrow-color': '#ececec', 'width': 2.5 }
        }
      ],
      layout: { name: 'preset' },
      minZoom: 0.4, // 너무 작아지지 않게 제한
      maxZoom: 2.0,
      wheelSensitivity: 0.2, // 스크롤 속도 부드럽게
      boxSelectionEnabled: false // 드래그 선택 비활성화 (팬 기능과 충돌 방지)
    });

    cyRef.current = cy;

    // --- Clean Vertical Layout ---
    const runLayout = () => {
      const layout = cy.layout({
        name: 'dagre',
        rankDir: 'TB',
        align: 'UL',
        ranker: 'tight-tree', 
        nodeSep: 50,
        rankSep: 60,
        padding: 50,
        animate: true,
        animationDuration: 600,
        fit: false // ★ 중요: 억지로 한 화면에 구겨넣지 않음 (깨알 글씨 방지)
      });

      layout.run();

      layout.promiseOn('layoutstop').then(() => {
          // 1. 줌 레벨을 적당히 고정 (1.0 = 100%)
          cy.zoom(0.8);
          
          // 2. 맨 위(Input) 노드로 이동
          const inputNode = cy.nodes()[0]; // 보통 첫 번째가 Input이거나 위쪽
          if (inputNode) {
              cy.center(inputNode);
              // 살짝 아래로 내리기 (여백 확보)
              cy.panBy({ x: 0, y: 100 });
          } else {
              cy.center();
          }
      });
    };

    runLayout();

    // 더블클릭: 줌 리셋 (Fit)
    cy.on('dblclick', (evt) => {
         cy.animation({
            fit: { eles: cy.elements(), padding: 50 },
            duration: 500,
            easing: 'ease-in-out-cubic'
         }).play();
    });

    // 클릭: 속성 보기
    cy.on('tap', 'node', evt => {
        const node = evt.target;
        const attrs = node.data('attributes');
        
        // 부모 노드(Stage)가 아닌 경우에만 선택
        if (!node.isParent()) {
            useStore.getState().setSelectedNode(node.data());
            
            // 선택된 노드 강조 효과 (선택 노드 외에는 투명도 조절 etc. - 여기선 간단히 테두리만)
            cy.nodes().removeClass('selected');
            node.addClass('selected');
        }
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
        style={{ width: '100%', height: '100%', backgroundColor: '#2d2d2d' }}
      />

      {/* 힌트 메시지 업데이트 */}
      <div
        style={{
          position: 'absolute',
          bottom: 20,
          left: 20,
          backgroundColor: 'rgba(0,0,0,0.7)',
          color: '#e2e8f0',
          padding: '10px 16px',
          borderRadius: 8,
          fontSize: 14,
          pointerEvents: 'none',
          boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
        }}
      >
        🖱️ <b>Double Click</b>: 펼치기/접기/확대 <br/>
        🖱️ <b>Click</b>: 속성 보기 (좌측 패널)
      </div>
    </div>
  );
}

export default GraphViewer;
