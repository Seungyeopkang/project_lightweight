import React, { useState } from 'react';
import useStore from '../store';
import CollapsiblePanel from './common/CollapsiblePanel';
import { toast } from 'react-toastify';

const BenchmarkPanel = () => {
  const { currentModel } = useStore();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [dataset, setDataset] = useState('cifar10');

  const handleRunBenchmark = async () => {
    if (!currentModel) return;

    setLoading(true);
    setResult(null);
    try {
      const data = await window.electronAPI.runBenchmark(currentModel.path, dataset);
      if (data.error) {
        toast.error(`Benchmark Failed: ${data.error}`);
      } else {
        setResult(data);
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
      borderRadius: '4px',
      border: '1px solid #ddd',
      fontSize: '13px'
    },
    button: {
      padding: '10px',
      backgroundColor: '#10b981', // Emerald 500
      color: 'white',
      border: 'none',
      borderRadius: '6px',
      cursor: 'pointer',
      fontSize: '13px',
      fontWeight: '600',
      transition: 'background 0.2s'
    },
    resultBox: {
      marginTop: '10px',
      padding: '10px',
      backgroundColor: '#f8fafc', // Slate 50
      borderRadius: '6px',
      border: '1px solid #e2e8f0',
      fontSize: '13px'
    },
    metricRow: {
      display: 'flex',
      justifyContent: 'space-between',
      marginBottom: '6px',
      borderBottom: '1px dashed #cbd5e1',
      paddingBottom: '4px'
    }
  };

  return (
    <CollapsiblePanel title="Local Benchmark" icon="🚀">
      <div style={styles.container}>
        <div>
          <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px' }}>Dataset</label>
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
            backgroundColor: loading ? '#6ee7b7' : '#10b981',
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
              <span style={{ color: '#64748b' }}>Accuracy</span>
              <span style={{ color: '#0f172a', fontWeight: 'bold' }}>{result.accuracy.toFixed(2)}%</span>
            </div>
            <div style={styles.metricRow}>
              <span style={{ color: '#64748b' }}>Latency (Avg)</span>
              <span style={{ color: '#0f172a', fontWeight: 'bold' }}>{result.latency_ms.toFixed(2)} ms</span>
            </div>
            <div style={styles.metricRow}>
              <span style={{ color: '#64748b' }}>Samples</span>
              <span>{result.samples}</span>
            </div>
          </div>
        )}
      </div>
    </CollapsiblePanel>
  );
};

export default BenchmarkPanel;
