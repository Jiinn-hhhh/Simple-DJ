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
    onChangeLoopRollSize,
}) => {
    const [isDragOver, setIsDragOver] = useState(false);
    const [loopState, setLoopState] = useState('inactive');
    const [stemDrag, setStemDrag] = useState({ active: false, targetState: true });
    const [isScratching, setIsScratching] = useState(false);
    const [scratchAngle, setScratchAngle] = useState(0);
    const [scratchReleasing, setScratchReleasing] = useState(false);
    const vinylRef = useRef(null);
    const scratchRef = useRef({ lastAngle: null });
    const releaseTimerRef = useRef(null);

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
        setScratchReleasing(false);
        if (releaseTimerRef.current) clearTimeout(releaseTimerRef.current);
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
            setScratchReleasing(true);
            scratchRef.current.lastAngle = null;
            if (onScratchEnd) onScratchEnd(deckId, track?.bpm);
            // Smooth recovery: gradually reset angle
            releaseTimerRef.current = setTimeout(() => {
                setScratchAngle(0);
                setScratchReleasing(false);
                releaseTimerRef.current = null;
            }, 300);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    const spinDuration = playbackRate > 0 ? `${2 / playbackRate}s` : '2s';

    const vinylClass = [
        'vinyl-disc',
        isScratching ? 'scratching' : '',
        scratchReleasing ? 'scratch-releasing' : '',
        isPlaying && !isScratching && !scratchReleasing ? 'spinning' : '',
    ].filter(Boolean).join(' ');

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
                                <span className="blink">LOADING...</span>
                            ) : (
                                "No Track Loaded"
                            )}
                        </div>
                    )}
                </div>
            </div>

            {track && (
                <div className={`spectrum-overlay ${isPlaying ? 'active' : ''} ${deckId === 'A' ? 'deck-a' : 'deck-b'}`}>
                    <SpectrumAnalyzer analyserNode={visualizerNode} color={deckId === 'A' ? '#00ff00' : '#ff00ff'} />
                </div>
            )}

            <div className="disc-container" style={{ position: 'relative' }}>
                <div
                    ref={vinylRef}
                    className={vinylClass}
                    style={{
                        '--spin-duration': spinDuration,
                        cursor: track && isPlaying ? 'grab' : 'default',
                        ...(isScratching || scratchReleasing ? { transform: `rotate(${scratchAngle}rad)` } : {})
                    }}
                    onMouseDown={handleVinylMouseDown}
                >
                    <div className="disc-label">
                        {deckId === 'A' ? 'LEFT' : 'RIGHT'}
                    </div>
                </div>

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
                                background: 'var(--neon-green)', transition: 'width 0.3s ease'
                            }} />
                        </div>
                    </div>
                )}
                {loadingTrack && (
                    <div style={{
                        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                        background: 'rgba(0,0,0,0.8)', padding: '15px 20px', borderRadius: '8px',
                        border: '2px solid var(--neon-blue)', zIndex: 30, textAlign: 'center', boxShadow: '0 0 15px rgba(0, 229, 255, 0.4)'
                    }}>
                        <span className="pixel-font blink" style={{ color: 'var(--neon-blue)', fontSize: '1rem', display: 'block', lineHeight: '1.5' }}>
                            LOADING<br/><br/>{loadingTrack.length > 15 ? loadingTrack.substring(0, 15) + '...' : loadingTrack}
                        </span>
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
                                    QUANTIZE
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

                        <div className="control-section">
                            <span className="control-label">LOOP ROLL</span>
                            <LoopRollPads
                                activeRoll={activeLoopRoll}
                                onStart={onStartLoopRoll}
                                onEnd={onEndLoopRoll}
                                onChangeSize={onChangeLoopRollSize}
                            />
                        </div>

                        <div className="control-section">
                            <span className="control-label">HOT CUE</span>
                            {hotCues && (
                                <HotCuePads
                                    hotCues={hotCues}
                                    onSetCue={onSetHotCue}
                                    onJumpCue={onJumpHotCue}
                                    onDeleteCue={onDeleteHotCue}
                                />
                            )}
                        </div>

                        <div className="control-section">
                            <span className="control-label">BEAT JUMP</span>
                            <BeatJumpControls
                                beatJumpSize={beatJumpSize || 1}
                                onSetSize={onSetBeatJumpSize}
                                onJump={onBeatJump}
                            />
                        </div>

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
