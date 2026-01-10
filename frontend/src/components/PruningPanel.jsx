import React, { useState } from 'react';
import useStore from '../store';
import axios from 'axios';
import { toast } from 'react-toastify';

export default function PruningPanel() {
  const [pruningMethod, setPruningMethod] = useState('magnitude');
  const [pruningRatio, setPruningRatio] = useState(30);
  const [isPruning, setIsPruning] = useState(false);
  const [pruningStats, setPruningStats] = useState(null);
  
  const currentModel = useStore((state) => state.currentModel);
  const sessionId = useStore((state) => state.sessionId);

  const methodDescriptions = {
    magnitude: 'Remove weights with smallest absolute values',
    structured: 'Remove entire channels for hardware efficiency',
    gradient: 'Prioritize weights based on importance simulation',
    pattern: 'Apply 2:4 sparsity pattern (hardware-friendly)'
  };

  const handlePrune = async () => {
    if (!currentModel) {
      toast.warning('Please upload a model first');
      return;
    }

    setIsPruning(true);
    setPruningStats(null);

    const ratio = pruningRatio / 100;

    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.pruneModel(currentModel, ratio);
        
        if (result.success) {
          setPruningStats(result.stats);
          toast.success('✓ Pruning complete! Model saved');
        } else {
          toast.error(`Pruning failed: ${result.error}`);
        }
      } else {
        if (!sessionId) {
          toast.error('Session expired. Please re-upload model');
          return;
        }

        const formData = new FormData();
        formData.append('session_id', sessionId);
        formData.append('method', pruningMethod);
        formData.append('ratio', ratio);

        const response = await axios.post('http://localhost:8000/api/prune-model', formData, {
          responseType: 'blob'
        });

        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        link.download = `model_pruned_${pruningMethod}.onnx`;
        link.click();
        window.URL.revokeObjectURL(url);

        toast.success(`✓ Model pruned with ${pruningMethod} method!`);
        
        setPruningStats({
          message: `Pruned using ${pruningMethod} method`,
          pruning_ratio: ratio
        });
      }
    } catch (error) {
      console.error('Pruning error:', error);
      toast.error(`Error: ${error.message}`);
    } finally {
      setIsPruning(false);
    }
  };

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <div style={styles.headerIcon}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 11l3 3L22 4"></path>
            <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"></path>
          </svg>
        </div>
        <h3 style={styles.title}>Pruning</h3>
      </div>
      
      {!currentModel ? (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>📊</div>
          <div style={styles.emptyText}>Upload a model to start pruning</div>
        </div>
      ) : (
        <>
          <div style={styles.section}>
            <label style={styles.label}>Method</label>
            <select 
              value={pruningMethod} 
              onChange={e => setPruningMethod(e.target.value)}
              style={styles.select}
            >
              <option value="magnitude">Magnitude-based</option>
              <option value="structured">Structured (Channel-wise)</option>
              <option value="gradient">Gradient-based</option>
              <option value="pattern">Pattern-based (2:4)</option>
            </select>
            <div style={styles.hint}>
              {methodDescriptions[pruningMethod]}
            </div>
          </div>
          
          <div style={styles.section}>
            <label style={styles.label}>
              Pruning Ratio: <strong style={{ color: '#6366f1' }}>{pruningRatio}%</strong>
            </label>
            <input
              type="range"
              min="10"
              max="90"
              value={pruningRatio}
              onChange={(e) => setPruningRatio(e.target.value)}
              style={styles.slider}
            />
            <div style={styles.hint}>
              Percentage of weights to remove
            </div>
          </div>

          <button
            onClick={handlePrune}
            disabled={isPruning}
            style={{
              ...styles.button,
              ...(isPruning ? styles.buttonDisabled : {}),
            }}
          >
            {isPruning ? (
              <>
                <span className="spinner" style={styles.spinner}></span>
                Pruning...
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '8px' }}>
                  <path d="M9 11l3 3L22 4"></path>
                  <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"></path>
                </svg>
                Apply Pruning
              </>
            )}
          </button>

          {pruningStats && (
            <div style={styles.stats}>
              <div style={styles.statsHeader}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                </svg>
                <span>Pruning Results</span>
              </div>
              <div style={styles.statItem}>
                <span>Method:</span>
                <span style={{ fontWeight: '600' }}>{pruningMethod}</span>
              </div>
              {pruningStats.total_params && (
                <>
                  <div style={styles.statItem}>
                    <span>Total Parameters:</span>
                    <span>{pruningStats.total_params?.toLocaleString()}</span>
                  </div>
                  <div style={styles.statItem}>
                    <span>Pruned Parameters:</span>
                    <span>{pruningStats.pruned_params?.toLocaleString()}</span>
                  </div>
                  <div style={styles.statItem}>
                    <span>Actual Ratio:</span>
                    <span style={{ color: '#10b981', fontWeight: '600' }}>
                      {(pruningStats.pruning_ratio * 100).toFixed(2)}%
                    </span>
                  </div>
                </>
              )}
            </div>
          )}
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
    color: '#6366f1',
    display: 'flex',
    alignItems: 'center',
  },
  title: {
    margin: 0,
    fontSize: '15px',
    fontWeight: '600',
    color: '#242424',
  },
  section: {
    padding: '16px',
    borderBottom: '1px solid #f5f5f5',
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
    cursor: 'pointer',
    marginBottom: '6px',
    transition: 'all 0.15s ease',
  },
  slider: {
    width: '100%',
    marginBottom: '6px',
  },
  hint: {
    fontSize: '11px',
    color: '#666',
    lineHeight: '1.4',
  },
  button: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 'calc(100% - 32px)',
    margin: '16px',
    padding: '12px',
    fontSize: '14px',
    fontWeight: '600',
    color: '#ffffff',
    backgroundColor: '#6366f1',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    gap: '8px',
  },
  buttonDisabled: {
    backgroundColor: '#d0d0d0',
    cursor: 'not-allowed',
    color: '#888',
  },
  spinner: {
    width: '16px',
    height: '16px',
    border: '2px solid rgba(255, 255, 255, 0.3)',
    borderTopColor: '#ffffff',
  },
  stats: {
    margin: '0 16px 16px 16px',
    padding: '12px',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    border: '1px solid #e9ecef',
  },
  statsHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    fontWeight: '600',
    color: '#6366f1',
    marginBottom: '10px',
  },
  statItem: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '6px 0',
    fontSize: '12px',
    color: '#242424',
    borderBottom: '1px solid #f0f0f0',
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
