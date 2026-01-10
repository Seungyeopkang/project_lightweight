import React, { useState } from 'react';
import useStore from '../store';
import axios from 'axios';
import { toast } from 'react-toastify';

export default function QuantizationPanel() {
  const [isQuantizing, setIsQuantizing] = useState(false);
  const currentModel = useStore((state) => state.currentModel);
  const sessionId = useStore((state) => state.sessionId);

  const handleQuantize = async () => {
    if (!currentModel) {
      toast.warning('Please upload a model first');
      return;
    }

    setIsQuantizing(true);

    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.quantizeModel(currentModel);
        
        if (result.success) {
          toast.success('✓ Model quantized and saved!');
        } else {
          toast.error(`Quantization failed: ${result.error}`);
        }
      } else {
        if (!sessionId) {
          toast.error('Session expired. Please re-upload model');
          return;
        }

        const formData = new FormData();
        formData.append('session_id', sessionId);

        const response = await axios.post('http://localhost:8000/api/quantize-model', formData, {
          responseType: 'blob'
        });

        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'model_quantized.onnx';
        link.click();
        window.URL.revokeObjectURL(url);

        toast.success('✓ Model quantized to INT8!');
      }
    } catch (error) {
      console.error('Quantization error:', error);
      toast.error(`Error: ${error.message}`);
    } finally {
      setIsQuantizing(false);
    }
  };

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <div style={styles.headerIcon}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7"></rect>
            <rect x="14" y="3" width="7" height="7"></rect>
            <rect x="14" y="14" width="7" height="7"></rect>
            <rect x="3" y="14" width="7" height="7"></rect>
          </svg>
        </div>
        <h3 style={styles.title}>Quantization</h3>
      </div>
      
      {!currentModel ? (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>🔧</div>
          <div style={styles.emptyText}>Upload a model to apply quantization</div>
        </div>
      ) : (
        <>
          <div style={styles.description}>
            Convert model weights from FP32 to INT8 for faster inference and smaller file size
          </div>

          <div style={styles.infoBox}>
            <div style={styles.infoIcon}>ℹ️</div>
            <div style={styles.infoContent}>
              <div style={styles.infoTitle}>Expected Benefits</div>
              <ul style={styles.infoList}>
                <li>~4x smaller model size</li>
                <li>~2-3x faster inference</li>
                <li>Minimal accuracy loss</li>
              </ul>
            </div>
          </div>

          <div style={styles.section}>
            <label style={styles.label}>Quantization Type</label>
            <select style={styles.select} disabled>
              <option value="int8">INT8 Dynamic Quantization</option>
            </select>
            <div style={styles.hint}>
              Currently only INT8 dynamic quantization is supported
            </div>
          </div>

          <button
            onClick={handleQuantize}
            disabled={isQuantizing}
            style={{
              ...styles.button,
              ...(isQuantizing ? styles.buttonDisabled : {}),
            }}
          >
            {isQuantizing ? (
              <>
                <span className="spinner" style={styles.spinner}></span>
                Quantizing...
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '8px' }}>
                  <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"></path>
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                  <line x1="12" y1="22.08" x2="12" y2="12"></line>
                </svg>
                Quantize to INT8
              </>
            )}
          </button>
        </>
      )}
    </div>
  );
}

const styles = {
  panel: {
    margin: '12px',
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    border: '1px solid #e0e0e0',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '16px',
    borderBottom: '1px solid #f0f0f0',
  },
  headerIcon: {
    color: '#10b981',
    display: 'flex',
    alignItems: 'center',
  },
  title: {
    margin: 0,
    fontSize: '15px',
    fontWeight: '600',
    color: '#242424',
  },
  description: {
    padding: '16px',
    fontSize: '12px',
    color: '#666',
    lineHeight: '1.5',
    borderBottom: '1px solid #f5f5f5',
  },
  infoBox: {
    display: 'flex',
    gap: '12px',
    margin: '16px',
    padding: '12px',
    backgroundColor: '#eff6ff',
    borderRadius: '8px',
    border: '1px solid #dbeafe',
  },
  infoIcon: {
    fontSize: '20px',
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#1e40af',
    marginBottom: '6px',
  },
  infoList: {
    margin: 0,
    paddingLeft: '20px',
    fontSize: '11px',
    color: '#3b82f6',
    lineHeight: '1.6',
  },
  section: {
    padding: '0 16px 16px 16px',
  },
  label: {
    display: 'block',
    fontSize: '12px',
    color: '#242424',
    marginBottom: '8px',
    fontWeight: '500',
  },
  select: {
    width: '100%',
    padding: '10px 12px',
    fontSize: '13px',
    backgroundColor: '#fafafa',
    color: '#242424',
    border: '1px solid #e0e0e0',
    borderRadius: '8px',
    outline: 'none',
    marginBottom: '6px',
  },
  hint: {
    fontSize: '11px',
    color: '#666',
  },
  button: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 'calc(100% - 32px)',
    margin: '0 16px 16px 16px',
    padding: '12px',
    fontSize: '14px',
    fontWeight: '600',
    color: '#ffffff',
    backgroundColor: '#10b981',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    gap: '8px',
  },
  buttonDisabled: {
    backgroundColor: '#d0d0d0',
    cursor: 'not-allowed',
  },
  spinner: {
    width: '16px',
    height: '16px',
    border: '2px solid rgba(255, 255, 255, 0.3)',
    borderTopColor: '#ffffff',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '40px 20px',
    textAlign: 'center',
  },
  emptyIcon: {
    fontSize: '48px',
    marginBottom: '12px',
    opacity: 0.3,
  },
  emptyText: {
    fontSize: '13px',
    color: '#666',
  },
};
