import React, { useState } from 'react';
import useStore from '../store';
import CollapsiblePanel from './common/CollapsiblePanel';
import { toast } from 'react-toastify';

const BenchmarkPanel = () => {
  const { currentModel, sessionId } = useStore();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [dataset, setDataset] = useState('cifar10');

  const handleRunBenchmark = async () => {
    if (!currentModel || typeof currentModel !== 'string') {
      toast.warning('Please upload a model first');
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const response = await window.electronAPI.runBenchmark({ sessionId, filePath: currentModel, dataset });
      if (!response.success) {
        toast.error(`Benchmark Failed: ${response.error}`);
      } else {
        setResult(response.data);
        toast.success("Benchmark Completed!");
      }
    } catch (err) {
      console.error(err);
      toast.error("Benchmark Error");
    } finally {
      setLoading(false);
    }
  };

  const styles = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      gap: '12px'
    },
    select: {
      width: '100%',
      padding: '8px',
      borderRadius: '6px',
      border: '1px solid rgba(255, 255, 255, 0.2)',
      fontSize: '13px',
      backgroundColor: 'rgba(0, 0, 0, 0.2)',
      color: '#fff',
      outline: 'none'
    },
    button: {
      padding: '10px',
      backgroundColor: '#10b981', // Emerald 500
      color: 'white',
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      fontSize: '13px',
      fontWeight: '600',
      transition: 'all 0.2s'
    },
    resultBox: {
      marginTop: '10px',
      padding: '12px',
      backgroundColor: 'rgba(16, 185, 129, 0.1)', // Emerald tint
      borderRadius: '8px',
      border: '1px solid rgba(16, 185, 129, 0.2)',
      fontSize: '13px'
    },
    metricRow: {
      display: 'flex',
      justifyContent: 'space-between',
      marginBottom: '6px',
      borderBottom: '1px dashed rgba(255, 255, 255, 0.1)',
      paddingBottom: '4px'
    }
  };

  return (
    <CollapsiblePanel title="Local Benchmark" icon="🚀">
      <div style={styles.container}>
        <div>
          <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>Dataset</label>
          <select
            style={styles.select}
            value={dataset}
            onChange={(e) => setDataset(e.target.value)}
          >
            <option value="cifar10">CIFAR-10 (Test Set)</option>
            {/* <option value="cifar100" disabled>CIFAR-100 (Implementation Pending)</option> */}
          </select>
        </div>

        <button
          style={{
            ...styles.button,
            backgroundColor: loading ? 'rgba(16, 185, 129, 0.5)' : '#10b981',
            cursor: loading ? 'wait' : 'pointer'
          }}
          onClick={handleRunBenchmark}
          disabled={loading}
        >
          {loading ? 'Running Benchmark...' : 'Run Benchmark'}
        </button>

        {result && (
          <div style={styles.resultBox}>
            <div style={styles.metricRow}>
              <span style={{ color: '#cbd5e1' }}>Accuracy</span>
              <span style={{ color: '#fff', fontWeight: 'bold' }}>{result.accuracy.toFixed(2)}%</span>
            </div>
            <div style={styles.metricRow}>
              <span style={{ color: '#cbd5e1' }}>Latency (Avg)</span>
              <span style={{ color: '#fff', fontWeight: 'bold' }}>{result.latency_ms.toFixed(2)} ms</span>
            </div>
            <div style={{ ...styles.metricRow, borderBottom: 'none' }}>
              <span style={{ color: '#cbd5e1' }}>Samples</span>
              <span style={{ color: '#e2e8f0' }}>{result.samples}</span>
            </div>
          </div>
        )}
      </div>
    </CollapsiblePanel>
  );
};

export default BenchmarkPanel;
