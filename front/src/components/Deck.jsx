import React, { useState, useRef } from 'react';
import HelpPopup from './HelpPopup';
import SpectrumAnalyzer from './SpectrumAnalyzer';

const STEMS = ['drums', 'bass', 'vocals', 'other'];

const Deck = ({
    deckId,
    track,
    isPlaying,
    playbackRate = 1.0,
    effectiveKey,
    onPlayPause,
    onLoadTrack,
    activeStems,
    onToggleStem,
    isSeparating,
    onLoopIn,
    onLoopOut,
    onExitLoop,
    onSeek,
    visualizerNode,
    loadingTrack
}) => {
    const [isDragging, setIsDragging] = useState(false);
    const [loopState, setLoopState] = useState('inactive'); // inactive, in, active

    // Stem Dragging State
    // active: boolean, targetState: boolean (true=turn on, false=turn off)
    const [stemDrag, setStemDrag] = useState({ active: false, targetState: true });

    const fileInputRef = useRef(null);
    const waveformRef = useRef(null);

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) onLoadTrack(file);
    };

    const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
    const handleDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('audio/')) onLoadTrack(file);
    };

    const handleLoopToggle = () => {
        if (loopState === 'inactive') {
            setLoopState('in');
            onLoopIn();
        } else if (loopState === 'in') {
            setLoopState('active');
            onLoopOut();
        } else {
            setLoopState('inactive');
            onExitLoop();
        }
    };

    const handleWaveformClick = (e) => {
        if (!track || !waveformRef.current) return;
        const rect = waveformRef.current.getBoundingClientRect();
        const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        onSeek(percent);
    };

    // Animation speed
    const rotationDuration = isPlaying && playbackRate > 0 ? `${2 / playbackRate}s` : '0s';

    return (
        <div
            className={`deck-container ${isDragging ? 'dragging' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            <div className="deck-header">
                <h2>DECK {deckId}</h2>
                <div className="track-display">
                    {track ? (
                        <>
                            <div className="track-title">{track.filename}</div>
                            <div className="track-meta">
                                <span>{track.bpm ? Math.round(track.bpm) : '--'} BPM</span>
                                <span title={`Original: ${track.key}`}>{effectiveKey || track.key || '--'}</span>
                            </div>
                        </>
                    ) : (
                        <div style={{ color: '#666', fontStyle: 'italic' }}>
                            {loadingTrack ? (
                                <span className="blink">LOADING {loadingTrack.toUpperCase()}...</span>
                            ) : (
                                "No Track Loaded"
                            )}
                        </div>
                    )}
                </div>
            </div>

            <div className="disc-container" style={{ position: 'relative' }}>
                <div
                    className={`vinyl-disc ${isPlaying ? 'spinning' : ''}`}
                    style={{ animationDuration: rotationDuration }}
                >
                    <div className="disc-label">
                        {deckId === 'A' ? 'LEFT' : 'RIGHT'}
                    </div>
                </div>

                {/* Spectrum Analyzer Overlay - Retro Box Style */}
                {track && (
                    <div style={{
                        position: 'absolute',
                        top: '10px',
                        left: '50%',
                        transform: 'translate(-50%, 0)',
                        width: '100%',
                        height: '80px',
                        boxSizing: 'border-box',
                        background: '#000',
                        border: isPlaying ? `3px solid ${deckId === 'A' ? 'var(--neon-green)' : 'var(--neon-pink)'}` : '3px solid #333',
                        borderRadius: '6px',
                        zIndex: 10,
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        boxShadow: isPlaying ? `0 0 15px ${deckId === 'A' ? 'rgba(0, 255, 157, 0.6)' : 'rgba(255, 0, 85, 0.6)'}` : 'none',
                        overflow: 'hidden'
                    }}>
                        <SpectrumAnalyzer
                            analyserNode={visualizerNode}
                            color={deckId === 'A' ? '#00ff00' : '#ff00ff'}
                        />
                        {/* Retro Glare Effect */}
                        <div style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            background: 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0) 50%)',
                            pointerEvents: 'none'
                        }}></div>
                    </div>
                )}

                {isSeparating && (
                    <div className="separation-overlay" style={{ position: 'absolute', bottom: '10px', background: 'black', padding: '5px 10px', borderRadius: '4px', border: '1px solid var(--neon-green)', zIndex: 20 }}>
                        <span className="pixel-font" style={{ color: 'var(--neon-green)', fontSize: '0.7rem' }}>SEPARATING...</span>
                    </div>
                )}
            </div>

            <div className="deck-controls">
                {!track ? (
                    <div className="upload-section" onClick={() => fileInputRef.current.click()}>
                        <input
                            type="file"
                            accept="audio/*"
                            onChange={handleFileChange}
                            ref={fileInputRef}
                            className="hidden-input"
                        />
                        <span>Click or Drop Audio Here</span>
                    </div>
                ) : (
                    <>
                        <div
                            className="waveform-container"
                            ref={waveformRef}
                            onClick={handleWaveformClick}
                        >
                            <div className="waveform-grid"></div>
                            <div className="waveform-progress" style={{ width: '0%' /* Needs state connection for real progress if available */ }}></div>
                        </div>

                        <div className="control-row">
                            <button
                                className={`play-btn ${isPlaying ? 'active' : ''}`}
                                onClick={onPlayPause}
                            >
                                {isPlaying ? '||' : '▶'}
                            </button>

                            <div className="feature-grid">
                                <button
                                    className={`glass-btn loop ${loopState !== 'inactive' ? 'active' : ''}`}
                                    onClick={handleLoopToggle}
                                    style={{
                                        gridColumn: 'span 4',
                                        border: loopState === 'in' ? '2px dashed var(--neon-yellow)' : undefined
                                    }}
                                >
                                    {loopState === 'inactive' ? 'LOOP IN' : (loopState === 'in' ? 'LOOP OUT' : 'EXIT LOOP')}
                                </button>
                            </div>
                        </div>


                        <div className="stems-row" onMouseLeave={() => setStemDrag({ ...stemDrag, active: false })}>
                            {STEMS.map(stem => (
                                <button
                                    key={stem}
                                    className={`stem-btn ${activeStems[stem] ? 'active' : ''}`}
                                    onMouseDown={() => {
                                        const newState = !activeStems[stem];
                                        setStemDrag({ active: true, targetState: newState });
                                        onToggleStem(stem); // Toggle current immediately
                                    }}
                                    onMouseEnter={() => {
                                        if (stemDrag.active && activeStems[stem] !== stemDrag.targetState) {
                                            onToggleStem(stem);
                                        }
                                    }}
                                    onMouseUp={() => setStemDrag({ ...stemDrag, active: false })}
                                    disabled={!track.separated}
                                >
                                    {stem.toUpperCase()}
                                </button>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div >
    );
};

export default Deck;
