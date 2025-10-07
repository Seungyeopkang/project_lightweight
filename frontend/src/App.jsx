// src/App.jsx (이 코드로 전체를 교체하세요)

import { useEffect } from 'react';
import { healthCheck } from './api';
import GraphViewer from './components/GraphViewer';
import './App.css'; // 기본 CSS는 그대로 둡니다.

function App() {
  // 2. useEffect를 사용해 앱이 처음 실행될 때 코드를 실행합니다.
  useEffect(() => {
    const checkServerHealth = async () => {
      try {
        // 3. healthCheck 함수를 호출하고 응답을 기다립니다.
        const response = await healthCheck();
        // 4. 성공하면 개발자 콘솔에 성공 메시지를 출력합니다.
        console.log('✅ Server Connection OK:', response.data);
      } catch (error) {
        // 5. 실패하면 에러 메시지를 출력합니다.
        console.error('❌ Server Connection FAILED:', error);
      }
    };
    
    checkServerHealth();
  }, []); // []는 이 코드를 딱 한 번만 실행하라는 의미입니다.

  // 6. 화면에 표시될 내용은 간단하게 수정합니다.
  return (
    <div className="App">
      <h1>AI Model Optimization Tool</h1>
      <GraphViewer /> {/* 2. 화면에 그래프 뷰어를 추가합니다. */}
    </div>
  );
}

export default App;