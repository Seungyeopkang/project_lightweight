import React, { useState } from 'react';
import useStore from '../store';
import { toast } from 'react-toastify';
import CollapsiblePanel from './common/CollapsiblePanel';

export default function QuantizationPanel() {
  const [isQuantizing, setIsQuantizing] = useState(false);
  const currentModel = useStore((state) => state.currentModel);
  const sessionId = useStore((state) => state.sessionId);
  const addToHistory = useStore((state) => state.addToHistory);
  const updateGraphData = useStore((state) => state.updateGraphData);

  const handleQuantize = async () => {
    if (!currentModel) {
      toast.warning('Please upload a model first');
      return;
    }

    setIsQuantizing(true);
    try {
      if (window.electronAPI) {
        addToHistory('Quantized model (INT8)');
        const result = await window.electronAPI.quantizeModel(currentModel);
        if (result.success) {
          toast.success('✓ Model quantized and saved!');

          if (sessionId && window.electronAPI.getGraph) {
            const newGraph = await window.electronAPI.getGraph(sessionId);
            if (newGraph && (newGraph.success !== false)) {
              updateGraphData(newGraph);
            }
          }
        } else {
          toast.error(`Quantization failed: ${result.error}`);
        }
      }
    } catch (error) {
      console.error('Quantization error:', error);
      toast.error(`Error: ${error.message}`);
    } finally {
      setIsQuantizing(false);
    }
  };

  const styles = {
    infoBox: { padding: '10px', backgroundColor: '#eff6ff', borderRadius: '6px', fontSize: '11px', color: '#1e40af', marginBottom: '12px' },
    button: { width: '100%', padding: '10px', backgroundColor: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' },
    buttonDisabled: { backgroundColor: '#a7f3d0', cursor: 'wait' }
  };

  return (
    <CollapsiblePanel title="Quantization" icon="🧊">
      <div>
        <div style={styles.infoBox}>
          <strong>INT8 Dynamic Quantization</strong><br />
          Reduces model size (~4x) and speeds up inference with minimal accuracy loss.
        </div>

        <button
          onClick={handleQuantize}
          disabled={isQuantizing}
          style={{ ...styles.button, ...(isQuantizing ? styles.buttonDisabled : {}) }}
        >
          {isQuantizing ? 'Quantizing...' : 'Quantize to INT8'}
        </button>
      </div>
    </CollapsiblePanel>
  );
}
