import { useState, useEffect } from 'react';
import useStore from '../store';

export default function LLMOptimizationPanel() {
  const { currentModel } = useStore();
  const [modelType, setModelType] = useState(null);
  const [isDetecting, setIsDetecting] = useState(false);
  
  // LLM-specific settings
  const [headPruningRatio, setHeadPruningRatio] = useState(30);
  const [ffnPruningRatio, setFfnPruningRatio] = useState(50);
  const [loraRank, setLoraRank] = useState(8);
  const [distillationRatio, setDistillationRatio] = useState(50);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (currentModel) {
      detectModelType();
    }
  }, [currentModel]);

  const detectModelType = async () => {
    setIsDetecting(true);
    setError(null);
    
    try {
      const isElectron = window.electronAPI?.isElectron;
      
      if (isElectron) {
        const detection = await window.electronAPI.invoke('detect-model-type', currentModel);
        if (detection.success) {
          setModelType(detection.data);
        } else {
          setError(detection.error);
        }
      }
    } catch (err) {
      console.error('Model detection error:', err);
      setError(err.message);
    } finally {
      setIsDetecting(false);
    }
  };

  const applyAttentionPruning = async () => {
    setIsProcessing(true);
    setError(null);
    setResult(null);
    
    try {
      const isElectron = window.electronAPI?.isElectron;
      
      if (isElectron) {
        const result = await window.electronAPI.invoke('llm-prune-attention', {
          modelPath: currentModel,
          ratio: headPruningRatio / 100
        });
        
        if (result.success) {
          setResult(result.data);
          
          // Save pruned model
          const savePath = await window.electronAPI.saveFile('pruned_model.onnx');
          if (savePath.filePath) {
            // Model already saved by backend
            console.log('Model saved:', savePath.filePath);
          }
        } else {
          setError(result.error);
        }
      }
    } catch (err) {
      console.error('Attention pruning error:', err);
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const applyFFNPruning = async () => {
    setIsProcessing(true);
    setError(null);
    setResult(null);
    
    try {
      const isElectron = window.electronAPI?.isElectron;
      
      if (isElectron) {
        const result = await window.electronAPI.invoke('llm-prune-ffn', {
          modelPath: currentModel,
          ratio: ffnPruningRatio / 100
        });
        
        if (result.success) {
          setResult(result.data);
        } else {
          setError(result.error);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const applyLoRA = async () => {
    setIsProcessing(true);
    setError(null);
    setResult(null);
    
    try {
      const isElectron = window.electronAPI?.isElectron;
      
      if (isElectron) {
        const result = await window.electronAPI.invoke('apply-lora', {
          modelPath: currentModel,
          rank: loraRank
        });
        
        if (result.success) {
          setResult(result.data);
        } else {
          setError(result.error);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const applyDistillation = async () => {
    setIsProcessing(true);
    setError(null);
    setResult(null);
    
    try {
      const isElectron = window.electronAPI?.isElectron;
      
      if (isElectron) {
        const result = await window.electronAPI.invoke('create-student-model', {
          modelPath: currentModel,
          compression: distillationRatio / 100
        });
        
        if (result.success) {
          setResult(result.data);
        } else {
          setError(result.error);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const styles = {
    container: {
      padding: '20px',
      backgroundColor: '#1f1f1f',
      borderRadius: '8px',
      marginBottom: '20px',
      border: '1px solid #444',
    },
    title: {
      fontSize: '18px',
      fontWeight: 'bold',
      marginBottom: '15px',
      color: '#ffffff',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
    },
    badge: {
      backgroundColor: '#6366f1',
      color: '#fff',
      padding: '4px 12px',
      borderRadius: '12px',
      fontSize: '12px',
      fontWeight: 'normal',
    },
    section: {
      marginBottom: '20px',
      padding: '15px',
      backgroundColor: '#2a2a2a',
      borderRadius: '6px',
    },
    sectionTitle: {
      fontSize: '14px',
      fontWeight: 'bold',
      marginBottom: '12px',
      color: '#cccccc',
    },
    sliderContainer: {
      marginBottom: '15px',
    },
    label: {
      display: 'flex',
      justifyContent: 'space-between',
      marginBottom: '8px',
      fontSize: '13px',
      color: '#aaaaaa',
    },
    slider: {
      width: '100%',
      height: '6px',
      borderRadius: '3px',
      backgroundColor: '#444',
      outline: 'none',
      cursor: 'pointer',
    },
    button: {
      padding: '10px 20px',
      backgroundColor: '#6366f1',
      color: '#ffffff',
      border: 'none',
      borderRadius: '6px',
      cursor: 'pointer',
      fontSize: '14px',
      fontWeight: '500',
      width: '100%',
      marginTop: '10px',
    },
    buttonDisabled: {
      backgroundColor: '#555',
      cursor: 'not-allowed',
    },
    modelInfo: {
      padding: '12px',
      backgroundColor: '#2a2a2a',
      borderRadius: '6px',
      marginBottom: '15px',
      fontSize: '13px',
      color: '#cccccc',
    },
    infoRow: {
      display: 'flex',
      justifyContent: 'space-between',
      marginBottom: '6px',
    },
    error: {
      backgroundColor: '#ef4444',
      color: '#ffffff',
      padding: '12px',
      borderRadius: '6px',
      marginTop: '15px',
      fontSize: '13px',
    },
    result: {
      backgroundColor: '#10b981',
      color: '#ffffff',
      padding: '12px',
      borderRadius: '6px',
      marginTop: '15px',
      fontSize: '13px',
    },
    tooltip: {
      fontSize: '12px',
      color: '#888',
      fontStyle: 'italic',
      marginTop: '5px',
    },
  };

  // Only show if LLM detected
  if (!modelType?.is_llm && !isDetecting) {
    return null;
  }

  return (
    <div style={styles.container}>
      <div style={styles.title}>
        🤖 LLM Optimization
        {modelType?.is_llm && (
          <span style={styles.badge}>
            {modelType.variant?.toUpperCase() || 'LLM'}
          </span>
        )}
      </div>

      {isDetecting && (
        <div style={styles.modelInfo}>
          Detecting model type...
        </div>
      )}

      {modelType?.is_llm && (
        <div style={styles.modelInfo}>
          <div style={styles.infoRow}>
            <span>Model Type:</span>
            <strong>{modelType.variant}</strong>
          </div>
          {modelType.num_layers && (
            <div style={styles.infoRow}>
              <span>Layers:</span>
              <strong>{modelType.num_layers}</strong>
            </div>
          )}
          {modelType.hidden_size && (
            <div style={styles.infoRow}>
              <span>Hidden Size:</span>
              <strong>{modelType.hidden_size}</strong>
            </div>
          )}
          {modelType.num_heads && (
            <div style={styles.infoRow}>
              <span>Attention Heads:</span>
              <strong>{modelType.num_heads}</strong>
            </div>
          )}
        </div>
      )}

      {/* Attention Head Pruning */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>🎯 Attention Head Pruning</div>
        <div style={styles.sliderContainer}>
          <div style={styles.label}>
            <span>Pruning Ratio</span>
            <strong>{headPruningRatio}%</strong>
          </div>
          <input
            type="range"
            min="10"
            max="70"
            value={headPruningRatio}
            onChange={(e) => setHeadPruningRatio(parseInt(e.target.value))}
            style={styles.slider}
            disabled={isProcessing}
          />
          <div style={styles.tooltip}>
            Remove {headPruningRatio}% of attention heads
          </div>
        </div>
        <button
          onClick={applyAttentionPruning}
          disabled={isProcessing || !currentModel}
          style={{
            ...styles.button,
            ...(isProcessing || !currentModel ? styles.buttonDisabled : {})
          }}
        >
          {isProcessing ? 'Processing...' : 'Apply Attention Pruning'}
        </button>
      </div>

      {/* FFN Pruning */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>🔧 FFN Neuron Pruning</div>
        <div style={styles.sliderContainer}>
          <div style={styles.label}>
            <span>Pruning Ratio</span>
            <strong>{ffnPruningRatio}%</strong>
          </div>
          <input
            type="range"
            min="10"
            max="80"
            value={ffnPruningRatio}
            onChange={(e) => setFfnPruningRatio(parseInt(e.target.value))}
            style={styles.slider}
            disabled={isProcessing}
          />
          <div style={styles.tooltip}>
            FFN contains 2/3 of parameters - safe to prune aggressively
          </div>
        </div>
        <button
          onClick={applyFFNPruning}
          disabled={isProcessing || !currentModel}
          style={{
            ...styles.button,
            ...(isProcessing || !currentModel ? styles.buttonDisabled : {})
          }}
        >
          {isProcessing ? 'Processing...' : 'Apply FFN Pruning'}
        </button>
      </div>

      {/* LoRA */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>🔗 LoRA Decomposition</div>
        <div style={styles.sliderContainer}>
          <div style={styles.label}>
            <span>LoRA Rank</span>
            <strong>{loraRank}</strong>
          </div>
          <input
            type="range"
            min="4"
            max="32"
            step="4"
            value={loraRank}
            onChange={(e) => setLoraRank(parseInt(e.target.value))}
            style={styles.slider}
            disabled={isProcessing}
          />
          <div style={styles.tooltip}>
            Lower rank = more compression, rank 8-16 recommended
          </div>
        </div>
        <button
          onClick={applyLoRA}
          disabled={isProcessing || !currentModel}
          style={{
            ...styles.button,
            ...(isProcessing || !currentModel ? styles.buttonDisabled : {})
          }}
        >
          {isProcessing ? 'Processing...' : 'Apply LoRA'}
        </button>
      </div>

      {/* Knowledge Distillation */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>🎓 Knowledge Distillation</div>
        <div style={styles.sliderContainer}>
          <div style={styles.label}>
            <span>Student Size</span>
            <strong>{distillationRatio}% of teacher</strong>
          </div>
          <input
            type="range"
            min="20"
            max="80"
            step="10"
            value={distillationRatio}
            onChange={(e) => setDistillationRatio(parseInt(e.target.value))}
            style={styles.slider}
            disabled={isProcessing}
          />
          <div style={styles.tooltip}>
            Creates smaller student model from teacher
          </div>
        </div>
        <button
          onClick={applyDistillation}
          disabled={isProcessing || !currentModel}
          style={{
            ...styles.button,
            ...(isProcessing || !currentModel ? styles.buttonDisabled : {})
          }}
        >
          {isProcessing ? 'Processing...' : 'Create Student Model'}
        </button>
      </div>

      {error && (
        <div style={styles.error}>
          ❌ Error: {error}
        </div>
      )}

      {result && (
        <div style={styles.result}>
          ✅ Success! {JSON.stringify(result, null, 2)}
        </div>
      )}
    </div>
  );
}
