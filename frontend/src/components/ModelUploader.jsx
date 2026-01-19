import React, { useState } from 'react';
import { uploadModel, selectOnnxFile } from '../api';
import useStore from '../store';
import { toast } from 'react-toastify';

function ModelUploader() {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const { updateGraphData, setCurrentModel, setSessionId } = useStore();
  const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron;

  const handleFileProcessing = async (file) => {
    const isFilePath = typeof file === 'string';
    const fileName = isFilePath ? file.split(/[\\/]/).pop() : file?.name;

    if (!fileName || !fileName.endsWith('.onnx')) {
      toast.error('Please select a .onnx file');
      return;
    }

    try {
      console.log("Uploading file:", fileName);
      setIsUploading(true);
      const response = await uploadModel(file);

      // Update graph data
      updateGraphData(response.data);

      // Store session ID (critical for web mode)
      if (response.data.session_id) {
        setSessionId(response.data.session_id);
        console.log("Session ID stored:", response.data.session_id);
      }

      // Set current model
      if (isFilePath) {
        setCurrentModel(file);
      } else {
        setCurrentModel(file?.name || 'uploaded_model.onnx');
      }

      toast.success('✓ Model loaded successfully!');
      console.log("File uploaded successfully");
    } catch (error) {
      console.error("Upload failed:", error);
      toast.error(`Upload failed: ${error.message || 'Unknown error'}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleElectronSelect = async () => {
    try {
      const filePath = await selectOnnxFile();
      if (filePath) {
        await handleFileProcessing(filePath);
      }
    } catch (error) {
      toast.error(`File selection failed: ${error.message}`);
    }
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
    if (file) {
      if (isElectron && file.path) {
        handleFileProcessing(file.path);
      } else {
        handleFileProcessing(file);
      }
    }
  };

  return (
    <div style={styles.container}>
      {!isElectron && (
        <div
          style={{
            ...styles.dropZone,
            ...(isDragging ? styles.dropZoneActive : {}),
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <input
            type="file"
            accept=".onnx"
            onChange={(e) => handleFileProcessing(e.target.files[0])}
            style={styles.fileInput}
            id="file-upload"
          />

          {isUploading ? (
            <div style={styles.uploadingState}>
              <div className="spinner" style={styles.spinner}></div>
              <div style={styles.uploadingText}>Analyzing model...</div>
              <div style={styles.uploadingHint}>This may take a few seconds</div>
            </div>
          ) : (
            <label htmlFor="file-upload" style={styles.dropLabel}>
              <div style={styles.uploadIcon}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
              </div>
              <div style={styles.uploadTitle}>
                {isDragging ? 'Drop your ONNX model here' : 'Upload ONNX Model'}
              </div>
              <div style={styles.uploadDescription}>
                Drag & drop or click to browse
              </div>
              <div style={styles.uploadHint}>
                Supports .onnx files • Maximum 500MB
              </div>
            </label>
          )}
        </div>
      )}

      {isElectron && (
        <div style={styles.electronContainer}>
          <button onClick={handleElectronSelect} style={styles.electronButton} disabled={isUploading}>
            {isUploading ? (
              <>
                <span className="spinner" style={styles.spinnerSmall}></span>
                <span>Loading...</span>
              </>
            ) : (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '8px' }}>
                  <path d="M3 15v4c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2v-4M17 9l-5-5-5 5M12 4v12" />
                </svg>
                Select ONNX File
              </>
            )}
          </button>
          <div style={styles.electronHint}>
            Choose a .onnx model file from your computer
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    margin: '20px',
  },
  dropZone: {
    border: '2px dashed rgba(255, 255, 255, 0.2)',
    borderRadius: '12px',
    padding: '48px 24px',
    textAlign: 'center',
    background: 'rgba(255, 255, 255, 0.05)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  dropZoneActive: {
    borderColor: '#6366f1',
    background: 'rgba(99, 102, 241, 0.1)',
    transform: 'scale(1.02)',
  },
  fileInput: {
    display: 'none',
  },
  dropLabel: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    cursor: 'pointer',
  },
  uploadIcon: {
    color: '#94a3b8',
    marginBottom: '8px',
  },
  uploadTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#e0e0e0',
    marginBottom: '4px',
  },
  uploadDescription: {
    fontSize: '13px',
    color: '#94a3b8',
    marginBottom: '4px',
  },
  uploadHint: {
    fontSize: '11px',
    color: '#64748b',
  },
  uploadingState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
  },
  uploadingText: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#e0e0e0',
  },
  uploadingHint: {
    fontSize: '11px',
    color: '#94a3b8',
  },
  spinner: {
    width: '32px',
    height: '32px',
    border: '3px solid rgba(99, 102, 241, 0.2)',
    borderTopColor: '#6366f1',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  },
  electronContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    padding: '32px 24px',
    background: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '12px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
  },
  electronButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '12px 24px',
    fontSize: '14px',
    fontWeight: '600',
    color: '#ffffff',
    background: '#6366f1',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    minWidth: '180px',
  },
  electronHint: {
    fontSize: '12px',
    color: '#94a3b8',
  },
  spinnerSmall: {
    width: '16px',
    height: '16px',
    marginRight: '8px',
    border: '2px solid rgba(255, 255, 255, 0.3)',
    borderTopColor: '#ffffff',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  },
};

export default ModelUploader;