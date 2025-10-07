import React, { useState } from 'react';

function ModelUploader() {
  const [selectedFile, setSelectedFile] = useState(null);

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      console.log("Selected file:", file.name);
      setSelectedFile(file);
    }
  };

  return (
    <div className="uploader-container">
      <h3>1. Upload Your PyTorch Model</h3>
      <input type="file" accept=".pt, .pth" onChange={handleFileChange} />
      {selectedFile && <p>Selected: {selectedFile.name}</p>}
    </div>
  );
}

// 오타를 수정한 올바른 코드입니다.s
export default ModelUploader;