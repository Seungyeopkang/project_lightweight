import React, { useState } from 'react';
import { uploadModel } from '../api';
import useStore from '../store';

function ModelUploader() {
  const [isDragging, setIsDragging] = useState(false);
  const setModelJson = useStore((state) => state.setModelJson);

  const handleFileSelect = async (file) => {
    // 1. 파일 확장자 검사 부분을 .onnx로 변경
    if (file && file.name.endsWith('.onnx')) {
      try {
        console.log("Uploading file:", file.name);
        const response = await uploadModel(file);
        setModelJson(response.data);
        console.log("File uploaded successfully, graph data received.");
      } catch (error) {
        console.error("File upload failed:", error);
        alert("File upload failed. Please check the server connection.");
      }
    } else {
      // 2. 사용자에게 보여주는 경고 메시지도 .onnx로 변경
      alert('Please select a .onnx file.');
    }
  };

  const handleFileChange = (event) => {
    handleFileSelect(event.target.files[0]);
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (event) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    handleFileSelect(file);
  };

  return (
    <div 
      className={`uploader-container ${isDragging ? 'dragging' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <h3>Upload Your ONNX Model</h3>
      <input 
        type="file" 
        // 3. 파일 선택 창의 필터도 .onnx로 변경
        accept=".onnx" 
        onChange={handleFileChange} 
        id="file-input" 
        style={{ display: 'none' }} 
      />
      <button onClick={() => document.getElementById('file-input').click()}>
        Click to Select File
      </button>
      <span> or Drag and Drop</span>
    </div>
  );
}

export default ModelUploader;