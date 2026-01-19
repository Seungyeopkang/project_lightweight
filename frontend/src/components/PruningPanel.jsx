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

  const handleUndo = async () => {
    try {
      if (!sessionId) {
        toast.warning("No active session");
        return;
      }
      const result = await window.electronAPI.undo({ sessionId });
      if (result.success) {
        // Backend returns graph data
        updateGraphData(result.data);
        toast.success("Undo successful");
      } else {
        toast.error("Undo failed: " + result.error);
      }
    } catch (e) {
      toast.error(e.message);
    }
  };

  const handleRemoveNode = async () => {
    if (!currentModel || !selectedNode) return;
    if (!confirm(`Are you sure you want to remove node "${selectedNode.label}"? This is destructive.`)) return;

    setIsRemoving(true);
    try {
      if (window.electronAPI) {
        // Fix: Use label or id for history log
        const nodeLabel = selectedNode.label || selectedNode.id || 'Unknown Node';
        addToHistory(`Removed node ${nodeLabel}`);

        const result = await window.electronAPI.removeNode({
          sessionId,
          filePath: currentModel,
          nodeName: selectedNode.id
        });

        if (result.success) {
          // New logic: result.data is Graph JSON
          const newGraphData = result.data;
          updateGraphData(newGraphData);
          setHasUnsavedChanges(true);
          toast.success(`✓ Node ${selectedNode.label} removed.`);
          setSelectedNode(null);
        } else {
          // Show backend error (e.g. Safety check)
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

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

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
        const result = await window.electronAPI.pruneModel({
          sessionId,
          filePath: currentModel,
          ratio,
          method: pruningMethod
        });

        if (result.success) {
          // New logic: Backend returns graph JSON, not file
          const newGraphData = result.data;
          if (newGraphData.stats) {
            setPruningStats(newGraphData.stats);
          }
          // Update global graph view
          updateGraphData(newGraphData);
          setHasUnsavedChanges(true);
          toast.success('Pruning applied. Review graph and click Save to keep changes.');
        } else {
          toast.error(`Pruning failed: ${result.error}`);
        }
      }
    } catch (error) {
      console.error('Pruning error:', error);
      toast.error(`Error: ${error.message}`);
    } finally {
      setIsPruning(false);
    }
  };

  const handleSaveModel = async () => {
    try {
      if (!sessionId) return;
      const result = await window.electronAPI.saveRemoteModel(sessionId);
      if (result.success) {
        toast.success(`Saved to ${result.filePath}`);
        setHasUnsavedChanges(false);
      } else {
        if (result.canceled) toast.info('Save canceled');
        else toast.error('Save failed');
      }
    } catch (e) {
      toast.error(e.message);
    }
  };

  const styles = {
    section: { marginBottom: '16px' },
    label: { display: 'block', fontSize: '12px', color: '#e0e0e0', marginBottom: '8px', fontWeight: '500' },
    select: {
      width: '100%',
      padding: '8px',
      fontSize: '13px',
      borderRadius: '6px',
      border: '1px solid rgba(255, 255, 255, 0.2)',
      marginBottom: '6px',
      backgroundColor: 'rgba(0, 0, 0, 0.2)',
      color: '#fff',
      outline: 'none'
    },
    slider: { width: '100%', marginBottom: '6px', accentColor: '#6366f1' },
    hint: { fontSize: '11px', color: '#94a3b8' },
    button: {
      width: '100%',
      padding: '10px',
      backgroundColor: '#6366f1',
      color: '#fff',
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      fontWeight: '600',
      transition: 'all 0.2s'
    },
    buttonDisabled: { backgroundColor: 'rgba(99, 102, 241, 0.5)', cursor: 'not-allowed' },
    stats: {
      marginTop: '16px',
      padding: '12px',
      backgroundColor: 'rgba(255, 255, 255, 0.05)',
      borderRadius: '8px',
      fontSize: '12px',
      border: '1px solid rgba(255, 255, 255, 0.1)'
    },
    statItem: { display: 'flex', justifyContent: 'space-between', marginBottom: '4px', color: '#ccc' }
  };

  return (
    <CollapsiblePanel title="Pruning & Inspection" icon="✂️" defaultOpen={true}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* MODE 1: Node Selected (Inspector View) */}
        {selectedNode ? (
          <div style={{ animation: 'fadeIn 0.2s' }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
              borderBottom: '1px solid rgba(255,255,255,0.1)',
              paddingBottom: '8px'
            }}>
              {/* Big Type Name */}
              <div style={{ fontWeight: '600', fontSize: '18px', color: '#fff' }}>
                {selectedNode.data.type}
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '18px' }}
              >
                ✕
              </button>
            </div>

            <div style={{ marginBottom: '16px', color: '#888', fontSize: '13px' }}>
              <p>Node details are now shown in the Left Sidebar.</p>
            </div>

            {/* Actions */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '16px' }}>
              <button
                onClick={handleRemoveNode}
                disabled={isRemoving}
                style={{ ...styles.button, backgroundColor: '#ef4444' }}
              >
                {isRemoving ? 'Removing Link/Node...' : 'Delete Node'}
              </button>
            </div>
          </div>
        ) : (
          /* MODE 2: No Selection (Global Pruning) */
          <div style={{ animation: 'fadeIn 0.2s' }}>
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
              {isPruning ? 'Pruning...' : 'Apply Global Pruning'}
            </button>

            {pruningStats && (
              <div style={styles.stats}>
                <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#6366f1' }}>Pruning Results</div>
                <div style={styles.statItem}><span>Params:</span> <span>{pruningStats.pruned_params?.toLocaleString()} / {pruningStats.total_params?.toLocaleString()}</span></div>
                <div style={styles.statItem}><span>Ratio:</span> <span>{(pruningStats.pruning_ratio * 100).toFixed(2)}%</span></div>
              </div>
            )}
          </div>
        )}

        {/* Global Actions (Always visible if unsaved) */}
        {hasUnsavedChanges && (
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '12px' }}>
            <button
              onClick={handleUndo}
              style={{ ...styles.button, backgroundColor: '#64748b', flex: 1 }}
            >
              ↶ Undo
            </button>
            <button
              onClick={handleSaveModel}
              style={{ ...styles.button, backgroundColor: '#10b981', flex: 1 }}
            >
              💾 Save
            </button>
          </div>
        )}
      </div>
    </CollapsiblePanel>
  );
}
