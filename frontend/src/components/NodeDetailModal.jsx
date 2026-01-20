import React, { useEffect, useState, useMemo } from 'react';
import useStore from '../store';

const NodeDetailModal = ({ isOpen, onClose, nodeId, onPruningComplete }) => {
    const [loading, setLoading] = useState(false);
    const [details, setDetails] = useState(null);
    const [error, setError] = useState(null);

    // Pruning State
    const [pruningMode, setPruningMode] = useState('unstructured'); // 'unstructured' | 'structured'
    const [selectedChannels, setSelectedChannels] = useState(new Set());
    const [threshold, setThreshold] = useState(0.1);
    const [sortBy, setSortBy] = useState('index');

    // Global Store
    const sessionId = useStore(state => state.sessionId);

    // Fetch Details (Resetting selection when node changes)
    useEffect(() => {
        if (!isOpen || !nodeId || !sessionId) return;

        // Reset Logic
        setSelectedChannels(new Set());
        setPruningMode('unstructured');
        setThreshold(0.1);
        setError(null);

        const fetchDetails = async () => {
            // ... existing fetch logic ...
            setLoading(true);
            try {
                const formData = new FormData();
                formData.append('session_id', sessionId);
                formData.append('node_name', nodeId);

                const response = await fetch('http://localhost:8000/api/get-node-details', {
                    method: 'POST',
                    body: formData
                });

                if (!response.ok) throw new Error("Failed to fetch node details");
                const data = await response.json();
                if (data.error) throw new Error(data.error);
                setDetails(data);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchDetails();
    }, [isOpen, nodeId, sessionId]);

    // Sorting Logic
    const sortedChannels = useMemo(() => {
        if (!details || !details.channels) return [];
        let channels = [...details.channels];

        if (sortBy === 'l1') {
            channels.sort((a, b) => a.l1_norm - b.l1_norm);
        } else if (sortBy === 'l1_desc') {
            channels.sort((a, b) => b.l1_norm - a.l1_norm);
        } else if (sortBy === 'sparsity') {
            channels.sort((a, b) => b.sparsity - a.sparsity);
        } else {
            channels.sort((a, b) => a.index - b.index);
        }
        return channels;
    }, [details, sortBy]);

    // Color Scale for Heatmap (Blue=Low/Prune, Red=High/Keep)
    const getColor = (importance) => {
        // importance is 0.0 to 1.0
        // 0.0 -> Blue (rgb(59, 130, 246))
        // 1.0 -> Red (rgb(239, 68, 68))
        // We can use a simple interpolation
        const r = Math.round(59 + (239 - 59) * importance);
        const g = Math.round(130 + (68 - 130) * importance);
        const b = Math.round(246 + (68 - 246) * importance);
        return `rgb(${r}, ${g}, ${b})`;
    };

    // Auto Select
    const handleAutoSelect = (mode) => {
        const newSet = new Set();
        if (mode === 'low20') {
            const sorted = [...details.channels].sort((a, b) => a.l1_norm - b.l1_norm);
            sorted.slice(0, 20).forEach(c => newSet.add(c.index));
        } else if (mode === 'top20') {
            const sorted = [...details.channels].sort((a, b) => b.l1_norm - a.l1_norm);
            sorted.slice(0, 20).forEach(c => newSet.add(c.index));
        }
        setSelectedChannels(newSet);
    };

    const toggleChannel = (idx, multi) => {
        const newSet = new Set(multi ? selectedChannels : []);
        if (selectedChannels.has(idx) && multi) {
            newSet.delete(idx);
        } else {
            newSet.add(idx);
        }
        setSelectedChannels(newSet);
    };

    const handleApplyPruning = async () => {
        if (!sessionId || !nodeId) return;

        try {
            setLoading(true);
            const formData = new FormData();
            formData.append('session_id', sessionId);
            formData.append('node_name', nodeId);
            formData.append('mode', pruningMode);

            if (pruningMode === 'unstructured') {
                formData.append('threshold', threshold);
            } else {
                // Structured - just UI for now, logic guarded in backend
                alert("Structured pruning (removing channels) is not yet implemented.");
                setLoading(false);
                return;
            }

            const response = await fetch('http://localhost:8000/api/apply-node-pruning', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) throw new Error("Pruning failed");
            const result = await response.json();

            if (result.stats && result.stats.success) {
                // Determine new metrics
                if (onPruningComplete) {
                    onPruningComplete(result); // Pass updated graph data back
                }
                onClose(); // Close modal on success
            } else {
                throw new Error(result.error || "Unknown error");
            }

        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div style={overlayStyle} onClick={onClose}>
            <div style={modalStyle} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div style={headerStyle}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '18px' }}>{nodeId}</h2>
                        <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                            {details?.type} • {details?.weights?.shape?.join('×') || 'No Weights'} • {details?.dtype || 'float32'}
                        </div>
                    </div>
                    <button style={closeBtnStyle} onClick={onClose}>×</button>
                </div>

                {/* Body */}
                <div style={bodyStyle}>
                    {loading && <div style={{ padding: '40px', textAlign: 'center' }}>Processing...</div>}
                    {error && <div style={{ padding: '40px', color: '#ef4444' }}>Error: {error}</div>}

                    {!loading && !error && details && (
                        <>
                            {/* Conv/Linear View */}
                            {['Conv', 'Gemm', 'MatMul'].includes(details.type) ? (
                                <div style={{ display: 'flex', height: '100%', gap: '16px' }}>
                                    {/* Left: Heatmap Grid */}
                                    <div style={{ flex: 7, display: 'flex', flexDirection: 'column' }}>
                                        {/* Toolbar */}
                                        <div style={toolbarStyle}>
                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                <span style={{ fontSize: '12px', color: '#ccc' }}>Sort:</span>
                                                <select
                                                    style={selectStyle}
                                                    value={sortBy}
                                                    onChange={e => setSortBy(e.target.value)}
                                                >
                                                    <option value="index">Index</option>
                                                    <option value="l1">L1 Norm (Low first)</option>
                                                    <option value="l1_desc">L1 Norm (High first)</option>
                                                    <option value="sparsity">Sparsity</option>
                                                </select>

                                                {/* Search Input */}
                                                <input
                                                    type="number"
                                                    placeholder="CH#"
                                                    style={{ ...selectStyle, width: '50px' }}
                                                    onChange={(e) => {
                                                        const idx = parseInt(e.target.value);
                                                        if (!isNaN(idx) && idx >= 0 && details.channels.some(c => c.index === idx)) {
                                                            const newSet = new Set(selectedChannels);
                                                            newSet.add(idx);
                                                            setSelectedChannels(newSet);
                                                        }
                                                    }}
                                                />
                                            </div>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <button style={actionBtnStyle} onClick={() => handleAutoSelect('low20')}>Select Low 20</button>
                                                <button style={actionBtnStyle} onClick={() => setSelectedChannels(new Set())}>Clear</button>
                                            </div>
                                        </div>

                                        {/* Grid Container */}
                                        <div style={gridContainerStyle}>
                                            {sortedChannels.map(ch => (
                                                <div
                                                    key={ch.index}
                                                    title={`CH:${ch.index}\nL1:${ch.l1_norm.toFixed(4)}\nSparsity:${(ch.sparsity * 100).toFixed(1)}%`}
                                                    onClick={(e) => toggleChannel(ch.index, e.ctrlKey || e.metaKey)}
                                                    style={{
                                                        ...channelBoxStyle,
                                                        background: getColor(ch.importance),
                                                        border: selectedChannels.has(ch.index) ? '2px solid #fff' : '1px solid rgba(0,0,0,0.2)',
                                                        transform: selectedChannels.has(ch.index) ? 'scale(1.1)' : 'scale(1)',
                                                        zIndex: selectedChannels.has(ch.index) ? 2 : 1,
                                                        opacity: pruningMode === 'structured' && !selectedChannels.has(ch.index) ? 0.5 : 1
                                                    }}
                                                >
                                                    <span style={{ fontSize: '9px', fontWeight: 'bold', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                                                        {ch.index}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Right: Info Panel */}
                                    <div style={sidePanelStyle}>
                                        <h3 style={{ fontSize: '14px', margin: '0 0 12px 0', borderBottom: '1px solid #333', paddingBottom: '8px' }}>
                                            Pruning Control
                                        </h3>

                                        {/* Mode Switch */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                                            <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                                <input
                                                    type="radio"
                                                    name="pMode"
                                                    value="unstructured"
                                                    checked={pruningMode === 'unstructured'}
                                                    onChange={e => setPruningMode(e.target.value)}
                                                />
                                                <span style={{ color: pruningMode === 'unstructured' ? '#fff' : '#94a3b8' }}>Unstructured (Weight Zeroing)</span>
                                            </label>
                                            <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                                <input
                                                    type="radio"
                                                    name="pMode"
                                                    value="structured"
                                                    checked={pruningMode === 'structured'}
                                                    onChange={e => setPruningMode(e.target.value)}
                                                />
                                                <span style={{ color: pruningMode === 'structured' ? '#fff' : '#94a3b8' }}>Structured (Remove Channels)</span>
                                            </label>
                                        </div>

                                        {pruningMode === 'unstructured' ? (
                                            <div style={{ marginTop: 'auto' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                                                    <span>Magnitude Threshold</span>
                                                    <span>{threshold.toFixed(2)}</span>
                                                </div>
                                                <input
                                                    type="range"
                                                    min="0" max="1" step="0.01"
                                                    value={threshold}
                                                    onChange={e => setThreshold(parseFloat(e.target.value))}
                                                    style={{ width: '100%', accentColor: '#6366f1', height: '4px', marginBottom: '12px' }}
                                                />
                                                <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '12px' }}>
                                                    Weights with |w| &lt; {threshold} will be set to zero.
                                                    This creates sparse metrices without changing shape.
                                                </div>
                                            </div>
                                        ) : (
                                            <div style={{ marginTop: 'auto' }}>
                                                <div style={{ fontSize: '11px', color: '#fbbf24', marginBottom: '12px', border: '1px solid #fbbf24', padding: '8px', borderRadius: '4px' }}>
                                                    ⚠️ Structured pruning permanently removes selected filters/channels and changes tensor shapes.
                                                </div>
                                                <div style={{ fontSize: '12px', marginBottom: '8px' }}>
                                                    Selected: <span style={{ color: '#fff', fontWeight: 'bold' }}>{selectedChannels.size}</span> channels
                                                </div>
                                            </div>
                                        )}

                                        <button
                                            style={{ ...primaryBtnStyle, opacity: (pruningMode === 'structured' && selectedChannels.size === 0) ? 0.5 : 1 }}
                                            onClick={handleApplyPruning}
                                            disabled={pruningMode === 'structured' && selectedChannels.size === 0}
                                        >
                                            Apply Pruning
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                // Non-Prunable Node View
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', color: '#64748b' }}>
                                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>
                                        {(details.type === 'Input' || details.type === 'Output') ? '📦' : '🔒'}
                                    </div>
                                    <div>
                                        {(details.type === 'Input' || details.type === 'Output')
                                            ? `${details.type} Layer (No Prunable Weights)`
                                            : `This node type (${details.type}) is not supported for individual pruning.`
                                        }
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

// Styles
const overlayStyle = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 2000
};

const modalStyle = {
    width: '900px', height: '650px',
    backgroundColor: '#1e1e1e',
    borderRadius: '16px',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
    display: 'flex', flexDirection: 'column',
    overflow: 'hidden',
    border: '1px solid #333'
};

const headerStyle = {
    padding: '20px 24px',
    borderBottom: '1px solid #333',
    display: 'flex', justifyContent: 'space-between', alignItems: 'start',
    backgroundColor: '#1a1a1a'
};

const closeBtnStyle = {
    background: 'transparent', border: 'none', color: '#fff', fontSize: '24px', cursor: 'pointer', padding: '0 8px'
};

const bodyStyle = {
    flex: 1, padding: '24px', overflow: 'hidden', backgroundColor: '#121212'
};

const toolbarStyle = {
    display: 'flex', justifyContent: 'space-between', marginBottom: '16px',
    paddingBottom: '12px', borderBottom: '1px solid #2d2d2d'
};

const gridContainerStyle = {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(40px, 1fr))', gap: '6px',
    overflowY: 'auto', paddingRight: '8px', flex: 1,
    alignContent: 'start'
};

const channelBoxStyle = {
    aspectRatio: '1', borderRadius: '4px', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', transition: 'transform 0.1s'
};

const sidePanelStyle = {
    flex: 3, backgroundColor: '#1a1a1a', borderRadius: '12px', padding: '16px',
    display: 'flex', flexDirection: 'column',
    border: '1px solid #333'
};

const selectStyle = {
    background: '#333', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', fontSize: '11px'
};

const actionBtnStyle = {
    background: '#333', color: '#eee', border: '1px solid #444',
    padding: '4px 12px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer'
};

const statItemStyle = {
    display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#94a3b8',
    marginBottom: '8px'
};

const statBoxStyle = {
    background: '#262626', padding: '10px', borderRadius: '6px', fontSize: '12px',
    border: '1px solid #333'
};

const primaryBtnStyle = {
    width: '100%', padding: '10px',
    background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
    color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer',
    fontWeight: '600', fontSize: '13px', marginTop: '8px'
};

export default NodeDetailModal;
