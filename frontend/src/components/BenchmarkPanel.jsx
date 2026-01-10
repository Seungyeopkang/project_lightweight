import React, { useState } from 'react';
import useStore from '../store';
import axios from 'axios';
import { toast } from 'react-toastify';

export default function BenchmarkPanel() {
  const [benchmarking, setBenchmarking] = useState(false);
  const currentModel = useStore((state) => state.currentModel);
  const sessionId = useStore((state) => state.sessionId);
  const [metrics, setMetrics] = useState(null);

  const handleBenchmark = async () => {
    if (!currentModel) {
      toast.warning('Please upload a model first');
      return;
    }

    if (!sessionId) {
      toast.error('Session expired. Please re-upload model');
      return;
    }

    setBenchmarking(true);
    
    try {
      const formData = new FormData();
      formData.append('session_id', sessionId);

      const response = await axios.post('http://localhost:8000/api/benchmark', formData);
      setMetrics(response.data);
      toast.success('✓ Benchmark completed successfully!');
    } catch (error) {
      console.error('Benchmark error:', error);
      toast.error(`Benchmark failed: ${error.message}`);
    } finally {
      setBenchmarking(false);
    }
  };

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <div style={styles.headerIcon}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
          </svg>
        </div>
        <h3 style={styles.title}>Performance Benchmark</h3>
      </div>
      
      {!currentModel ? (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>⚡</div>
          <div style={styles.emptyText}>Upload a model to measure performance</div>
        </div>
      ) : (
        <>
          <div style={styles.description}>
            Measure inference speed, memory usage, and computational complexity
          </div>

          <button
            onClick={handleBenchmark}
            disabled={benchmarking}
            style={{
              ...styles.button,
              ...(benchmarking ? styles.buttonDisabled : {}),
            }}
          >
            {benchmarking ? (
              <>
                <span className="spinner" style={styles.spinner}></span>
                Running benchmark...
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '8px' }}>
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
                Run Benchmark
              </>
            )}
          </button>

          {metrics && (
            <div style={styles.metrics}>
              <div style={styles.metricsHeader}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
                  <polyline points="17 6 23 6 23 12"></polyline>
                </svg>
                <span>Results</span>
              </div>
              
              <div style={styles.metricCard}>
                <div style={styles.metricIcon}>⚡</div>
                <div style={styles.metricContent}>
                  <div style={styles.metricLabel}>Inference Speed</div>
                  <div style={styles.metricValue}>{metrics.inference_ms} ms</div>
                </div>
              </div>

              <div style={styles.metricCard}>
                <div style={styles.metricIcon}>💾</div>
                <div style={styles.metricContent}>
                  <div style={styles.metricLabel}>Model Size</div>
                  <div style={styles.metricValue}>{metrics.model_size_mb} MB</div>
                </div>
              </div>

              <div style={styles.metricCard}>
                <div style={styles.metricIcon}>🔢</div>
                <div style={styles.metricContent}>
                  <div style={styles.metricLabel}>Parameters</div>
                  <div style={styles.metricValue}>{metrics.total_params?.toLocaleString()}</div>
                </div>
              </div>

              <div style={styles.metricCard}>
                <div style={styles.metricIcon}>⚙️</div>
                <div style={styles.metricContent}>
                  <div style={styles.metricLabel}>FLOPs</div>
                  <div style={styles.metricValue}>{metrics.flops}</div>
                </div>
              </div>
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
    color: '#8b5cf6',
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
    backgroundColor: '#8b5cf6',
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
  metrics: {
    padding: '0 16px 16px 16px',
  },
  metricsHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    fontWeight: '600',
    color: '#8b5cf6',
    marginBottom: '12px',
  },
  metricCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px',
    marginBottom: '8px',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    border: '1px solid #e9ecef',
  },
  metricIcon: {
    fontSize: '24px',
  },
  metricContent: {
    flex: 1,
  },
  metricLabel: {
    fontSize: '11px',
    color: '#666',
    marginBottom: '2px',
  },
  metricValue: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#242424',
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
