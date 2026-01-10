import { useState, useEffect } from 'react';
import useStore from '../store';

export default function MetricsPanel() {
  const [metrics, setMetrics] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  
  const currentModel = useStore((state) => state.currentModel);

  const loadMetrics = async () => {
    if (!currentModel) return;

    setIsLoading(true);
    try {
      const isElectron = window.electronAPI?.isElectron;
      
      if (isElectron) {
        // For desktop, we need to add benchmark endpoint to IPC
        // For now, show basic info
        const result = await window.electronAPI.getModelInfo(currentModel);
        
        if (result.success) {
          setMetrics({
            total_parameters: result.data.total_parameters,
            num_layers: result.data.num_layers
          });
        }
      }
    } catch (error) {
      console.error('Failed to load metrics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (currentModel) {
      loadMetrics();
    } else {
      setMetrics(null);
    }
  }, [currentModel]);

  const formatNumber = (num) => {
    if (!num) return 'N/A';
    if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
    return num.toString();
  };

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>📊 Model Metrics</h3>
      
      {metrics ? (
        <div style={styles.metricsGrid}>
          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>Parameters</div>
            <div style={styles.metricValue}>{formatNumber(metrics.total_parameters)}</div>
          </div>
          
          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>Layers</div>
            <div style={styles.metricValue}>{metrics.num_layers || 'N/A'}</div>
          </div>
          
          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>File Size</div>
            <div style={styles.metricValue}>
              {metrics.file_size_mb ? `${metrics.file_size_mb} MB` : 'N/A'}
            </div>
          </div>
          
          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>FLOPs</div>
            <div style={styles.metricValue}>
              {metrics.flops_giga ? `${metrics.flops_giga} G` : 'N/A'}
            </div>
          </div>
        </div>
      ) : currentModel ? (
        <div style={styles.loading}>
          {isLoading ? 'Loading metrics...' : 'Click Refresh to load metrics'}
        </div>
      ) : (
        <div style={styles.placeholder}>
          Upload a model to see metrics
        </div>
      )}
      
      {currentModel && (
        <button
          onClick={loadMetrics}
          disabled={isLoading}
          style={{
            ...styles.refreshButton,
            ...(isLoading ? styles.buttonDisabled : {})
          }}
        >
          {isLoading ? '⏳ Loading...' : '🔄 Refresh Metrics'}
        </button>
      )}
    </div>
  );
}

const styles = {
  container: {
    padding: '20px',
    backgroundColor: '#2a2a2a',
    borderRadius: '8px',
  },
  title: {
    margin: '0 0 16px 0',
    fontSize: '18px',
    fontWeight: '600',
    color: '#ffffff',
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
    marginBottom: '16px',
  },
  metricCard: {
    padding: '12px',
    backgroundColor: '#1f1f1f',
    borderRadius: '6px',
    border: '1px solid #444444',
  },
  metricLabel: {
    fontSize: '11px',
    color: '#888888',
    marginBottom: '4px',
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  metricValue: {
    fontSize: '20px',
    color: '#ffffff',
    fontWeight: '700',
  },
  refreshButton: {
    width: '100%',
    padding: '10px',
    fontSize: '13px',
    fontWeight: '600',
    color: '#ffffff',
    backgroundColor: '#6366f1',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  buttonDisabled: {
    backgroundColor: '#555555',
    cursor: 'not-allowed',
  },
  loading: {
    padding: '20px',
    textAlign: 'center',
    color: '#888888',
    fontSize: '14px',
  },
  placeholder: {
    padding: '20px',
    textAlign: 'center',
    color: '#666666',
    fontSize: '14px',
    fontStyle: 'italic',
  },
};
