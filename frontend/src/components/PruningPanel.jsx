import React, { useState } from 'react';
import useStore from '../store';
import axios from 'axios';
import { toast } from 'react-toastify';
import CollapsiblePanel from './common/CollapsiblePanel';

export default function PruningPanel() {
  const [pruningMethod, setPruningMethod] = useState('magnitude');
  const [pruningRatio, setPruningRatio] = useState(30);
  const [isPruning, setIsPruning] = useState(false);
  const [pruningStats, setPruningStats] = useState(null);

  const currentModel = useStore((state) => state.currentModel);
  const sessionId = useStore((state) => state.sessionId);
  const selectedNode = useStore((state) => state.selectedNode);
  const setSelectedNode = useStore((state) => state.setSelectedNode);
  const addToHistory = useStore((state) => state.addToHistory);
  const updateGraphData = useStore((state) => state.updateGraphData);

  const [isRemoving, setIsRemoving] = useState(false);

  const handleRemoveNode = async () => {
    if (!currentModel || !selectedNode) return;
    if (!confirm(`Are you sure you want to remove node "${selectedNode.label}"? This is destructive.`)) return;

    setIsRemoving(true);
    try {
      if (window.electronAPI) {
        addToHistory(`Removed node ${selectedNode.label}`);
        const result = await window.electronAPI.removeNode(currentModel, selectedNode.id);
        if (result.success) {
          // result.data is already { data: base64, filename: ... }
          const fileData = result.data.data;
          const filename = result.data.filename;

          try {
            const saveResult = await window.electronAPI.saveFile(filename || `model_removed_${selectedNode.id}.onnx`);
            if (saveResult.success && saveResult.filePath) {
              await window.electronAPI.writeFile(saveResult.filePath, fileData);
              toast.success(`✓ Node ${selectedNode.label} removed. Model saved.`);

              if (sessionId && window.electronAPI.getGraph) {
                const newGraph = await window.electronAPI.getGraph(sessionId);
                if (newGraph && (newGraph.success !== false)) {
                  updateGraphData(newGraph);
                }
              }

              setSelectedNode(null);
            }
          } catch (err) {
            toast.error('Save failed: ' + err.message);
          }
        } else {
          toast.error(`Removal failed: ${result.error}`);
        }
      }
    } catch (e) {
      console.error(e);
      toast.error(e.message);
    } finally {
      setIsRemoving(false);
    }
  };

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
        addToHistory(`Pruned model (${pruningMethod}, ${ratio})`);
        const result = await window.electronAPI.pruneModel(currentModel, ratio);
        if (result.success) {
          const fileData = result.data.data;
          const stats = result.data.stats;
          const filename = result.data.filename;

          if (stats) setPruningStats(stats);

          try {
            const saveResult = await window.electronAPI.saveFile(filename || `pruned_model_${ratio}.onnx`);
            if (saveResult.success && saveResult.filePath) {
              await window.electronAPI.writeFile(saveResult.filePath, fileData);
              toast.success('✓ Pruning complete! Model saved.');

              if (sessionId && window.electronAPI.getGraph) {
                const newGraph = await window.electronAPI.getGraph(sessionId);
                if (newGraph && (newGraph.success !== false)) {
                  updateGraphData(newGraph);
                }
              }
            } else {
              toast.info('Save canceled by user');
            }
          } catch (writeError) {
            toast.error('Failed to save file: ' + writeError.message);
          }
        } else {
          toast.error(`Pruning failed: ${result.error}`);
        }
      } else {
        // Web fallback loop omitted for brevity as we are in Electron
      }
    } catch (error) {
      console.error('Pruning error:', error);
      toast.error(`Error: ${error.message}`);
    } finally {
      setIsPruning(false);
    }
  };

  const styles = {
    section: { marginBottom: '16px' },
    label: { display: 'block', fontSize: '12px', color: '#242424', marginBottom: '8px', fontWeight: '500' },
    select: { width: '100%', padding: '8px', fontSize: '13px', borderRadius: '4px', border: '1px solid #ddd', marginBottom: '6px' },
    slider: { width: '100%', marginBottom: '6px' },
    hint: { fontSize: '11px', color: '#666' },
    button: { width: '100%', padding: '10px', backgroundColor: '#6366f1', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' },
    buttonDisabled: { backgroundColor: '#a5a6f6', cursor: 'wait' },
    stats: { marginTop: '16px', padding: '10px', backgroundColor: '#f8fafc', borderRadius: '6px', fontSize: '12px' },
    statItem: { display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }
  };

  return (
    <CollapsiblePanel title="Pruning" icon="✂️" defaultOpen={true}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
          <div style={styles.hint}>{methodDescriptions[pruningMethod]}</div>
        </div>

        <div style={styles.section}>
          <label style={styles.label}>
            Pruning Ratio: <strong style={{ color: '#6366f1' }}>{pruningRatio}%</strong>
          </label>
          <input
            type="range" min="10" max="90" value={pruningRatio}
            onChange={(e) => setPruningRatio(e.target.value)}
            style={styles.slider}
          />
          <div style={styles.hint}>Percentage of weights to remove</div>
        </div>

        <button
          onClick={handlePrune}
          disabled={isPruning}
          style={{ ...styles.button, ...(isPruning ? styles.buttonDisabled : {}) }}
        >
          {isPruning ? 'Pruning...' : 'Apply Pruning'}
        </button>

        {pruningStats && (
          <div style={styles.stats}>
            <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#6366f1' }}>Pruning Results</div>
            <div style={styles.statItem}><span>Params:</span> <span>{pruningStats.pruned_params?.toLocaleString()} / {pruningStats.total_params?.toLocaleString()}</span></div>
            <div style={styles.statItem}><span>Ratio:</span> <span>{(pruningStats.pruning_ratio * 100).toFixed(2)}%</span></div>
          </div>
        )}

        {/* Manual Pruning Sub-Section */}
        <div style={{ borderTop: '1px solid #eee', paddingTop: '12px' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '8px' }}>Manual Pruning</div>
          {!selectedNode ? (
            <div style={{ fontSize: '12px', color: '#888', fontStyle: 'italic' }}>Select a node in graph to remove</div>
          ) : (
            <div>
              <div style={{ fontSize: '12px', marginBottom: '6px' }}>Selected: <b>{selectedNode.label}</b></div>
              <button
                onClick={handleRemoveNode}
                disabled={isRemoving}
                style={{ ...styles.button, backgroundColor: '#ef4444', fontSize: '12px', padding: '8px' }}
              >
                {isRemoving ? 'Removing...' : 'Delete Node'}
              </button>
            </div>
          )}
        </div>
      </div>
    </CollapsiblePanel>
  );
}
