import { useState } from 'react';
import useStore from '../store';

export default function ComparisonPanel() {
  const [originalMetrics, setOriginalMetrics] = useState(null);
  const [optimizedMetrics, setOptimizedMetrics] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  
  const currentModel = useStore((state) => state.currentModel);

  const loadCurrentModelMetrics = async () => {
    if (!currentModel) return;
    
    setIsLoading(true);
    try {
      const isElectron = window.electronAPI?.isElectron;
      
      if (isElectron) {
        const result = await window.electronAPI.getModelInfo(currentModel);
        if (result.success) {
          const metrics = {
            parameters: result.data.total_parameters,
            layers: result.data.num_layers,
            size_mb: null  // Would need file size from separate call
          };
          
          if (!originalMetrics) {
            setOriginalMetrics(metrics);
          } else {
            setOptimizedMetrics(metrics);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load metrics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const calculateReduction = (original, optimized) => {
    if (!original || !optimized) return null;
    const reduction = ((original - optimized) / original) * 100;
    return reduction.toFixed(1);
  };

  const formatNumber = (num) => {
    if (!num) return 'N/A';
    if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
    return num.toString();
  };

  const clearComparison = () => {
    setOriginalMetrics(null);
    setOptimizedMetrics(null);
  };

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>📊 Before/After Comparison</h3>
      
      {originalMetrics || optimizedMetrics ? (
        <>
          <table style={styles.table}>
            <thead>
              <tr style={styles.headerRow}>
                <th style={styles.headerCell}>Metric</th>
                <th style={styles.headerCell}>Original</th>
                <th style={styles.headerCell}>Optimized</th>
                <th style={styles.headerCell}>Δ</th>
              </tr>
            </thead>
            <tbody>
              <tr style={styles.row}>
                <td style={styles.labelCell}>Parameters</td>
                <td style={styles.valueCell}>
                  {originalMetrics ? formatNumber(originalMetrics.parameters) : '-'}
                </td>
                <td style={styles.valueCell}>
                  {optimizedMetrics ? formatNumber(optimizedMetrics.parameters) : '-'}
                </td>
                <td style={{...styles.valueCell, ...styles.deltaCell}}>
                  {originalMetrics && optimizedMetrics
                    ? `-${calculateReduction(originalMetrics.parameters, optimizedMetrics.parameters)}%`
                    : '-'}
                </td>
              </tr>
              
              <tr style={styles.row}>
                <td style={styles.labelCell}>Layers</td>
                <td style={styles.valueCell}>
                  {originalMetrics?.layers || '-'}
                </td>
                <td style={styles.valueCell}>
                  {optimizedMetrics?.layers || '-'}
                </td>
                <td style={{...styles.valueCell, ...styles.deltaCell}}>
                  {originalMetrics && optimizedMetrics && originalMetrics.layers && optimizedMetrics.layers
                    ? `-${calculateReduction(originalMetrics.layers, optimizedMetrics.layers)}%`
                    : '-'}
                </td>
              </tr>
            </tbody>
          </table>
          
          <div style={styles.buttonGroup}>
            <button
              onClick={loadCurrentModelMetrics}
              disabled={isLoading}
              style={{...styles.button, ...styles.captureButton}}
            >
              {isLoading ? '⏳ Loading...' : 
               !originalMetrics ? '📸 Capture Original' : '📸 Capture Optimized'}
            </button>
            
            <button
              onClick={clearComparison}
              style={{...styles.button, ...styles.clearButton}}
            >
              🗑️ Clear
            </button>
          </div>
        </>
      ) : (
        <div style={styles.placeholder}>
          <p style={styles.placeholderText}>
            1. Load original model<br/>
            2. Click "Capture Original"<br/>
            3. Apply optimizations<br/>
            4. Click "Capture Optimized"
          </p>
          <button
            onClick={loadCurrentModelMetrics}
            disabled={!currentModel || isLoading}
            style={{
              ...styles.button,
              ...styles.captureButton,
              ...(!currentModel ? styles.buttonDisabled : {})
            }}
          >
            {isLoading ? '⏳ Loading...' : '📸 Start Comparison'}
          </button>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    padding: '20px',
    backgroundColor: '#2a2a2a',
    borderRadius: '8px',
    marginBottom: '20px',
  },
  title: {
    margin: '0 0 16px 0',
    fontSize: '18px',
    fontWeight: '600',
    color: '#ffffff',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    marginBottom: '16px',
  },
  headerRow: {
    borderBottom: '2px solid #444444',
  },
  headerCell: {
    padding: '8px 4px',
    textAlign: 'left',
    fontSize: '11px',
    fontWeight: '700',
    color: '#888888',
    textTransform: 'uppercase',
  },
  row: {
    borderBottom: '1px solid #333333',
  },
  labelCell: {
    padding: '10px 4px',
    fontSize: '13px',
    color: '#cccccc',
    fontWeight: '500',
  },
  valueCell: {
    padding: '10px 4px',
    fontSize: '14px',
    color: '#ffffff',
    fontFamily: 'monospace',
  },
  deltaCell: {
    color: '#10b981',
    fontWeight: '600',
  },
  buttonGroup: {
    display: 'flex',
    gap: '8px',
  },
  button: {
    flex: 1,
    padding: '10px',
    fontSize: '13px',
    fontWeight: '600',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  captureButton: {
    color: '#ffffff',
    backgroundColor: '#8b5cf6',
  },
  clearButton: {
    color: '#ffffff',
    backgroundColor: '#ef4444',
  },
  buttonDisabled: {
    backgroundColor: '#555555',
    cursor: 'not-allowed',
  },
  placeholder: {
    textAlign: 'center',
    padding: '20px 0',
  },
  placeholderText: {
    color: '#888888',
    fontSize: '13px',
    lineHeight: '1.8',
    marginBottom: '16px',
  },
};
