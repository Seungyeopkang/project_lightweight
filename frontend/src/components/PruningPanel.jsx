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
    <CollapsiblePanel title="Global Pruning" defaultExpanded={true}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* Pruning Method Selection */}
        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px', fontWeight: 'bold', color: '#ccc' }}>
            Pruning Type
          </label>
          <div style={{ display: 'flex', gap: '12px', background: 'rgba(0,0,0,0.2)', padding: '4px', borderRadius: '6px' }}>
            <button
              style={{
                flex: 1,
                padding: '8px',
                background: pruningMethod === 'magnitude' ? '#6366f1' : 'transparent',
                color: pruningMethod === 'magnitude' ? '#fff' : '#888',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 'bold',
                transition: 'all 0.2s'
              }}
              onClick={() => setPruningMethod('magnitude')}
            >
              Unstructured (Weight)
            </button>
            <button
              style={{
                flex: 1,
                padding: '8px',
                background: pruningMethod === 'structured' ? '#10b981' : 'transparent', // Different color for distinction
                color: pruningMethod === 'structured' ? '#fff' : '#888',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 'bold',
                transition: 'all 0.2s'
              }}
              onClick={() => setPruningMethod('structured')}
            >
              Structured (Channel)
            </button>
          </div>
          <div style={{ marginTop: '8px', fontSize: '11px', color: '#666', fontStyle: 'italic', lineHeight: '1.4' }}>
            {pruningMethod === 'magnitude'
              ? "Removes individual connections with low weight. Higher sparsity, but channel count remains same."
              : "Removes entire channels/filters. Reduces channel dimensions (e.g. 64 → 48). Experimental."}
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#ccc' }}>
              Target Sparsity Ratio
            </label>
            <span style={{ fontSize: '12px', color: '#6366f1', fontWeight: 'bold' }}>
              {pruningRatio}%
            </span>
          </div>
          <input
            type="range"
            min="1"
            max="99"
            value={pruningRatio}
            onChange={(e) => setPruningRatio(parseInt(e.target.value))}
            step={1}
            style={{
              width: '100%',
              height: '32px', // Larger touch/click area
              cursor: 'pointer',
              accentColor: pruningMethod === 'magnitude' ? '#6366f1' : '#10b981',
              margin: '10px 0'
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', opacity: 0.5, fontSize: '10px' }}>
            <span>1% (Light)</span>
            <span>99% (Aggressive)</span>
          </div>
          <div style={{ marginTop: '8px', fontSize: '11px', color: '#666' }}>
            {methodDescriptions[pruningMethod]}
          </div>
        </div>

        <button
          onClick={handlePrune}
          disabled={isPruning || !currentModel}
          style={{
            width: '100%',
            padding: '12px',
            background: isPruning ? '#4b5563' : (pruningMethod === 'magnitude' ? '#6366f1' : '#10b981'),
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: isPruning || !currentModel ? 'not-allowed' : 'pointer',
            fontWeight: '600',
            transition: 'background 0.2s',
            display: 'flex',
            alignItems: 'center',

            justifyContent: 'center',
            gap: '8px',
            boxShadow: '0 4px 6px rgba(0,0,0,0.2)'
          }}
        >
          {isPruning ? (
            <>
              <div className="spinner" style={{ width: '16px', height: '16px', border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
              Pruning...
            </>
          ) : (
            <>
              Apply {pruningMethod === 'magnitude' ? 'Unstructured' : 'Structured'} Pruning
            </>
          )}
        </button>

        {pruningStats && (
          <div style={{ background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '6px', fontSize: '12px' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#6366f1' }}>Pruning Results</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><span>Params:</span> <span style={{ color: '#fff' }}>{pruningStats.pruned_params?.toLocaleString()} / {pruningStats.total_params?.toLocaleString()}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Ratio:</span> <span style={{ color: '#fff' }}>{(pruningStats.pruning_ratio * 100).toFixed(2)}%</span></div>
          </div>
        )}


        {/* Global Actions (Restored & Cleaned) */}
        {hasUnsavedChanges && (
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <button
              onClick={handleUndo}
              style={{ ...styles.button, backgroundColor: '#64748b', flex: 1 }}
            >
              Undo
            </button>
            <button
              onClick={handleSaveModel}
              style={{ ...styles.button, backgroundColor: '#10b981', flex: 1 }}
            >
              Save
            </button>
          </div>
        )}
      </div>
    </CollapsiblePanel >
  );
}
