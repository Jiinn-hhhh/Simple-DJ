import React, { useState, useRef } from 'react';
import SpectrumAnalyzer from './SpectrumAnalyzer';
import HotCuePads from './HotCuePads';
import BeatJumpControls from './BeatJumpControls';
import LoopRollPads from './LoopRollPads';
import ColorWaveform from './ColorWaveform';

const STEMS = ['drums', 'bass', 'vocals', 'other'];

const Deck = ({
    deckId,
    track,
    isPlaying,
    playbackRate = 1.0,
    effectiveKey,
    onPlayPause,
    onLoadFromLibrary,
    activeStems,
    onToggleStem,
    isSeparating,
    separationProgress = 0,
    onLoopIn,
    onLoopOut,
    onExitLoop,
    onSeek,
    onScratchStart,
    onScratchMove,
    onScratchEnd,
    visualizerNode,
    loadingTrack,
    // Pro DJ controls
    quantizeEnabled,
    onToggleQuantize,
    hotCues,
    onSetHotCue,
    onJumpHotCue,
    onDeleteHotCue,
    beatJumpSize,
    onSetBeatJumpSize,
    onBeatJump,
    // Key Lock
    keyLockEnabled,
    onToggleKeyLock,
    // Waveform
    waveformData,
    playbackPosition,
    // Slip Mode + Loop Roll
    slipModeEnabled,
    onToggleSlipMode,
    activeLoopRoll,
    onStartLoopRoll,
    onEndLoopRoll,
}) => {
    const [isDragOver, setIsDragOver] = useState(false);
    const [loopState, setLoopState] = useState('inactive');
    const [stemDrag, setStemDrag] = useState({ active: false, targetState: true });
    const [isScratching, setIsScratching] = useState(false);
    const [scratchAngle, setScratchAngle] = useState(0);
    const [padMode, setPadMode] = useState('hotcue'); // 'hotcue' | 'looproll'
    const waveformRef = useRef(null);
    const vinylRef = useRef(null);
    const scratchRef = useRef({ lastAngle: null });

    // Accept library track drops (from TrackItem drag)
    const handleDragOver = (e) => {
        e.preventDefault();
        if (e.dataTransfer.types.includes('application/x-library-track')) {
            setIsDragOver(true);
        }
    };
    const handleDragLeave = () => setIsDragOver(false);
    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragOver(false);
        const data = e.dataTransfer.getData('application/x-library-track');
        if (data) {
            try {
                const libraryTrack = JSON.parse(data);
                if (onLoadFromLibrary) onLoadFromLibrary(deckId, libraryTrack);
            } catch {}
        }
    };

    const handleLoopToggle = () => {
        if (loopState === 'inactive') { setLoopState('in'); onLoopIn(); }
        else if (loopState === 'in') { setLoopState('active'); onLoopOut(); }
        else { setLoopState('inactive'); onExitLoop(); }
    };

    const handleWaveformClick = (e) => {
        if (!track || !waveformRef.current) return;
        const rect = waveformRef.current.getBoundingClientRect();
        const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        onSeek(percent);
    };

    // --- Vinyl scratch handlers ---
    const getAngle = (e, rect) => {
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        return Math.atan2(e.clientY - cy, e.clientX - cx);
    };

    const handleVinylMouseDown = (e) => {
        if (!track || !isPlaying) return;
        e.preventDefault();
        const rect = vinylRef.current.getBoundingClientRect();
        scratchRef.current.lastAngle = getAngle(e, rect);
        setIsScratching(true);
        if (onScratchStart) onScratchStart(deckId);

        const handleMouseMove = (ev) => {
            const r = vinylRef.current?.getBoundingClientRect();
            if (!r) return;
            const angle = getAngle(ev, r);
            const delta = angle - scratchRef.current.lastAngle;
            // Normalize delta to handle ±π wraparound
            let normalized = delta;
            if (normalized > Math.PI) normalized -= 2 * Math.PI;
            if (normalized < -Math.PI) normalized += 2 * Math.PI;
            scratchRef.current.lastAngle = angle;
            setScratchAngle(prev => prev + normalized);
            if (onScratchMove) onScratchMove(deckId, normalized);
        };

        const handleMouseUp = () => {
            setIsScratching(false);
            scratchRef.current.lastAngle = null;
            if (onScratchEnd) onScratchEnd(deckId, track?.bpm);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    const spinDuration = playbackRate > 0 ? `${2 / playbackRate}s` : '2s';

    return (
        <div
            className={`deck-container ${isDragOver ? 'dragging' : ''}`}
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
                    ref={vinylRef}
                    className={`vinyl-disc ${isPlaying && !isScratching ? 'spinning' : ''} ${isScratching ? 'scratching' : ''}`}
                    style={{
                        '--spin-duration': spinDuration,
                        cursor: track && isPlaying ? 'grab' : 'default',
                        ...(isScratching ? { transform: `rotate(${scratchAngle}rad)` } : {})
                    }}
                    onMouseDown={handleVinylMouseDown}
                >
                    <div className="disc-label">
                        {deckId === 'A' ? 'LEFT' : 'RIGHT'}
                    </div>
                </div>

                {track && (
                    <div style={{
                        position: 'absolute', bottom: '0', left: '50%',
                        transform: 'translate(-50%, 0)', width: '90%', height: '40px',
                        boxSizing: 'border-box', background: '#000',
                        border: isPlaying ? `2px solid ${deckId === 'A' ? 'var(--neon-green)' : 'var(--neon-pink)'}` : '2px solid #333',
                        borderRadius: '4px', zIndex: 10, display: 'flex',
                        justifyContent: 'center', alignItems: 'center',
                        boxShadow: isPlaying ? `0 0 10px ${deckId === 'A' ? 'rgba(0, 255, 157, 0.4)' : 'rgba(255, 0, 85, 0.4)'}` : 'none',
                        overflow: 'hidden'
                    }}>
                        <SpectrumAnalyzer analyserNode={visualizerNode} color={deckId === 'A' ? '#00ff00' : '#ff00ff'} />
                    </div>
                )}

                {isSeparating && (
                    <div style={{
                        position: 'absolute', bottom: '10px', background: 'black',
                        padding: '8px 12px', borderRadius: '4px',
                        border: '1px solid var(--neon-green)', zIndex: 20, minWidth: '120px'
                    }}>
                        <span className="pixel-font" style={{ color: 'var(--neon-green)', fontSize: '0.7rem', display: 'block', marginBottom: '4px' }}>
                            SEPARATING... {separationProgress > 0 ? `${separationProgress}%` : ''}
                        </span>
                        <div style={{ width: '100%', height: '4px', background: '#333', borderRadius: '2px', overflow: 'hidden' }}>
                            <div style={{
                                width: `${separationProgress}%`, height: '100%',
                                background: 'var(--neon-green)', transition: 'width 0.3s ease',
                                boxShadow: '0 0 8px var(--neon-green)'
                            }} />
                        </div>
                    </div>
                )}
            </div>

            <div className="deck-controls">
                {!track ? (
                    <div className="deck-empty-hint">
                        <span>Drag a track from Library</span>
                    </div>
                ) : (
                    <>
                        <ColorWaveform
                            waveformData={waveformData}
                            position={playbackPosition || 0}
                            hotCues={hotCues}
                            duration={track?.duration}
                            bpm={track?.bpm}
                            deckId={deckId}
                            onSeek={onSeek}
                        />

                        <div className="control-row">
                            <button className={`play-btn ${isPlaying ? 'active' : ''}`} onClick={onPlayPause}>
                                {isPlaying ? '||' : '▶'}
                            </button>
                            <div className="feature-grid">
                                <button
                                    className={`glass-btn quantize ${quantizeEnabled ? 'active' : ''}`}
                                    onClick={onToggleQuantize}
                                    title="Quantize"
                                >
                                    Q
                                </button>
                                <button
                                    className={`glass-btn slip ${slipModeEnabled ? 'active' : ''}`}
                                    onClick={onToggleSlipMode}
                                    title="Slip Mode"
                                >
                                    SLIP
                                </button>
                                <button
                                    className={`glass-btn keylock ${keyLockEnabled ? 'active' : ''}`}
                                    onClick={onToggleKeyLock}
                                    title="Key Lock"
                                >
                                    KEY
                                </button>
                                <button
                                    className={`glass-btn loop ${loopState !== 'inactive' ? 'active' : ''}`}
                                    onClick={handleLoopToggle}
                                    style={{ border: loopState === 'in' ? '2px dashed var(--neon-yellow)' : undefined }}
                                >
                                    {loopState === 'inactive' ? 'LOOP' : (loopState === 'in' ? 'OUT' : 'EXIT')}
                                </button>
                            </div>
                        </div>

                        <div className="pad-mode-toggle">
                            <button
                                className={`pad-mode-btn ${padMode === 'hotcue' ? 'active' : ''}`}
                                onClick={() => setPadMode('hotcue')}
                            >
                                HOT CUE
                            </button>
                            <button
                                className={`pad-mode-btn ${padMode === 'looproll' ? 'active' : ''}`}
                                onClick={() => setPadMode('looproll')}
                            >
                                LOOP ROLL
                            </button>
                        </div>

                        {padMode === 'hotcue' && hotCues && (
                            <HotCuePads
                                hotCues={hotCues}
                                onSetCue={onSetHotCue}
                                onJumpCue={onJumpHotCue}
                                onDeleteCue={onDeleteHotCue}
                            />
                        )}

                        {padMode === 'looproll' && (
                            <LoopRollPads
                                activeRoll={activeLoopRoll}
                                onStart={onStartLoopRoll}
                                onEnd={onEndLoopRoll}
                            />
                        )}

                        <BeatJumpControls
                            beatJumpSize={beatJumpSize || 1}
                            onSetSize={onSetBeatJumpSize}
                            onJump={onBeatJump}
                        />

                        <div className="stems-row" onMouseLeave={() => setStemDrag({ ...stemDrag, active: false })}>
                            {STEMS.map(stem => (
                                <button
                                    key={stem}
                                    className={`stem-btn ${activeStems[stem] ? 'active' : ''}`}
                                    onMouseDown={() => {
                                        const newState = !activeStems[stem];
                                        setStemDrag({ active: true, targetState: newState });
                                        onToggleStem(stem);
                                    }}
                                    onMouseEnter={() => {
                                        if (stemDrag.active && activeStems[stem] !== stemDrag.targetState) onToggleStem(stem);
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
        </div>
    );
};

export default Deck;
