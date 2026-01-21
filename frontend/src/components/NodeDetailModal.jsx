import React, { useEffect, useState, useMemo } from 'react';
import { toast } from 'react-toastify';
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
    const getColor = (importance, l1) => {
        if (l1 === 0) return '#000'; // Dead channel (Black)

        // importance is 0.0 to 1.0
        // 0.0 -> Blue (rgb(59, 130, 246))
        // 1.0 -> Red (rgb(239, 68, 68))
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
        if (newSet.size > 0) {
            setPruningMode('structured');
        }
    };

    const toggleChannel = (idx) => {
        // Additive selection (Toggle)
        const newSet = new Set(selectedChannels);
        if (newSet.has(idx)) {
            newSet.delete(idx);
        } else {
            newSet.add(idx);
        }
        setSelectedChannels(newSet);

        // If channels are selected, ensure we are in a 'mode' that shows them?
        // Actually, the new UI flow allows mixed usage, but let's keep it simple.
        // If manual selection exists, we are in 'Targeted' mode implicitly.
    };

    const handleApplyPruning = async (overrideMode = null) => {
        if (!sessionId || !nodeId) return;

        const finalMode = overrideMode || pruningMode;

        try {
            setLoading(true);
            const formData = new FormData();
            formData.append('session_id', sessionId);
            formData.append('node_name', nodeId);
            formData.append('mode', finalMode);

            if (selectedChannels.size > 0) {
                // Targeted Pruning (either zeroing or removal)
                formData.append('channels', JSON.stringify(Array.from(selectedChannels)));
            } else if (finalMode === 'unstructured') {
                // Global Magnitude Pruning
                formData.append('threshold', threshold);
            }

            if (finalMode === 'structured') {
                let channelsToPrune = [];

                if (selectedChannels.size > 0) {
                    // Manual selection takes precedence
                    channelsToPrune = Array.from(selectedChannels);
                } else {
                    // Auto-select based on ratio/threshold (Low L1)
                    // If no channels selected, use 'threshold' as a ratio (e.g. 0.2 = bottom 20%)
                    const sorted = [...details.channels].sort((a, b) => a.l1_norm - b.l1_norm);
                    const countToRemove = Math.floor(sorted.length * threshold);

                    if (countToRemove === 0) {
                        toast.warning(`Ratio ${threshold} is too low to remove any channels. Increase ratio.`);
                        setLoading(false);
                        return;
                    }

                    channelsToPrune = sorted.slice(0, countToRemove).map(c => c.index);
                    toast.info(`Auto-selected ${countToRemove} channels (Bottom ${(threshold * 100).toFixed(0)}%) for removal.`);
                }

                // Structured - just UI for now, logic guarded in backend
                if (channelsToPrune.length === 0) {
                    toast.warning("No channels selected for structured pruning.");
                    setLoading(false);
                    return;
                }

                // Send auto-selected channels or manually selected ones
                // Backend 'prune_single_node' handles 'channels' param for zeroing.
                // It might not do physical removal yet, but the selection logic is here.
                formData.append('channels', JSON.stringify(channelsToPrune));

                // We still show the warning that backend might strictly zero instead of remove
                // toast.info("Structured pruning (removing channels) is not yet implemented in the backend kernel.");
                // Let's rely on the backend response or previously known limitation, 
                // but at least we send the data.
            }

            const response = await fetch('http://localhost:8000/api/apply-node-pruning', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) throw new Error("Pruning failed");
            const result = await response.json();

            if (result.stats && result.stats.success) {
                if (onPruningComplete) {
                    onPruningComplete(result);
                }
                onClose();
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
                                                <button
                                                    style={actionBtnStyle}
                                                    onClick={() => handleAutoSelect('low20')}
                                                >
                                                    Select Low 20
                                                </button>
                                                <button
                                                    style={actionBtnStyle}
                                                    onClick={() => {
                                                        setSelectedChannels(new Set());
                                                        setPruningMode('unstructured');
                                                    }}
                                                >
                                                    Clear
                                                </button>
                                            </div>
                                        </div>

                                        {/* Grid Container */}
                                        <div style={gridContainerStyle}>
                                            {sortedChannels.map(ch => (
                                                <div
                                                    key={ch.index}
                                                    title={`CH:${ch.index}\nL1:${ch.l1_norm.toFixed(4)}\nSparsity:${(ch.sparsity * 100).toFixed(1)}%`}
                                                    onClick={() => toggleChannel(ch.index)}
                                                    style={{
                                                        ...channelBoxStyle,
                                                        background: getColor(ch.importance, ch.l1_norm),
                                                        border: selectedChannels.has(ch.index) ? '2px solid #fff' : '1px solid rgba(0,0,0,0.2)',
                                                        boxShadow: selectedChannels.has(ch.index) ? '0 0 10px rgba(255,255,255,0.3)' : 'none',
                                                        transform: selectedChannels.has(ch.index) ? 'scale(1.1)' : 'scale(1)',
                                                        zIndex: selectedChannels.has(ch.index) ? 2 : 1,
                                                        opacity: pruningMode === 'structured' && !selectedChannels.has(ch.index) ? 0.3 : 1,
                                                        position: 'relative',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        overflow: 'hidden',
                                                        borderRadius: '4px'
                                                    }}
                                                >
                                                    {ch.l1_norm === 0 && (
                                                        <div style={{
                                                            position: 'absolute',
                                                            top: 0, left: 0, right: 0, bottom: 0,
                                                            background: 'rgba(0,0,0,0.7)',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            pointerEvents: 'none'
                                                        }}>
                                                            <div style={{
                                                                fontSize: '8px',
                                                                color: '#ef4444',
                                                                fontWeight: 'bold',
                                                                border: '1px solid #ef4444',
                                                                padding: '0 2px',
                                                                borderRadius: '2px',
                                                                transform: 'rotate(-15deg)',
                                                                background: 'rgba(0,0,0,0.8)'
                                                            }}>
                                                                DEAD
                                                            </div>
                                                        </div>
                                                    )}
                                                    <span style={{
                                                        fontSize: '10px',
                                                        fontWeight: 'bold',
                                                        textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                                                        color: ch.l1_norm === 0 ? '#444' : '#fff'
                                                    }}>
                                                        {ch.index}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Right: Info Panel */}
                                    <div style={sidePanelStyle}>
                                        {/* Dynamic Control Panel */}
                                        <h3 style={{ fontSize: '14px', margin: '0 0 12px 0', borderBottom: '1px solid #333', paddingBottom: '8px' }}>
                                            Pruning Control
                                        </h3>

                                        {selectedChannels.size === 0 ? (
                                            /* DEFAULT VIEW: No Channels Selected */
                                            <>
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

                                                <div style={{ marginBottom: '24px' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                        <label style={{ fontSize: '12px', color: '#94a3b8' }}>
                                                            {pruningMode === 'structured' ? 'Pruning Ratio (Remove Bottom %)' : 'Magnitude Threshold'}
                                                        </label>
                                                        <span style={{ fontSize: '12px', fontWeight: 'bold' }}>
                                                            {pruningMode === 'structured' ? `${(threshold * 100).toFixed(0)}%` : threshold}
                                                        </span>
                                                    </div>
                                                    <input
                                                        type="range"
                                                        min={pruningMode === 'structured' ? "0.05" : "0.01"}
                                                        max={pruningMode === 'structured' ? "0.9" : "0.5"}
                                                        step={pruningMode === 'structured' ? "0.05" : "0.01"}
                                                        value={threshold}
                                                        onChange={e => setThreshold(parseFloat(e.target.value))}
                                                        style={{ width: '100%', accentColor: '#6366f1' }}
                                                    />
                                                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                                                        {pruningMode === 'structured'
                                                            ? `Removes the ${(threshold * 100).toFixed(0)}% least important channels (L1 Norm).`
                                                            : `Zeroes out individual weights with |w| < ${threshold}.`}
                                                    </div>
                                                </div>

                                                <button
                                                    style={primaryBtnStyle}
                                                    onClick={() => handleApplyPruning()}
                                                >
                                                    Apply {pruningMode === 'structured' ? 'Structured' : 'Unstructured'} Pruning
                                                </button>

                                                <div style={{ marginTop: '16px', fontSize: '11px', color: '#64748b', borderTop: '1px solid #333', paddingTop: '12px' }}>
                                                    💡 <strong>Tip:</strong> Click on channels in the grid to switch to <em>Manual Selection Mode</em>.
                                                </div>
                                            </>
                                        ) : (
                                            /* SELECTION VIEW: Channels are selected */
                                            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#6366f1' }}>{selectedChannels.size} Channels</span>
                                                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>Targeted Mode</span>
                                                </div>

                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                    <button
                                                        style={primaryBtnStyle}
                                                        onClick={() => handleApplyPruning('unstructured')}
                                                    >
                                                        Zero Selected Weights
                                                    </button>

                                                    <button
                                                        style={{ ...secondaryBtnStyle, background: '#10b981', borderColor: '#10b981', color: '#fff' }}
                                                        onClick={() => handleApplyPruning('structured')}
                                                    >
                                                        Remove Selected (Structured)
                                                    </button>
                                                </div>

                                                <button
                                                    style={{ ...secondaryBtnStyle, marginTop: '8px', padding: '8px', fontSize: '11px', opacity: 0.7 }}
                                                    onClick={() => {
                                                        setSelectedChannels(new Set());
                                                        setPruningMode('unstructured');
                                                    }}
                                                >
                                                    Reset Channels & Mode
                                                </button>
                                            </div>
                                        )}
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
        </div >
    );
};

// Styles
const overlayStyle = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 2000
};

const secondaryBtnStyle = {
    padding: '10px 16px',
    background: 'rgba(255,255,255,0.05)',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s'
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
