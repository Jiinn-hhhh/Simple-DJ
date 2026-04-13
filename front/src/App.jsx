import { useState, useEffect, useRef } from "react";
import AudioPlayer from "./audioPlayer";
import Deck from "./components/Deck";
import Mixer from "./components/Mixer";
import useAuth from "./hooks/useAuth";
import useLibrary from "./hooks/useLibrary";
import useDecks from "./hooks/useDecks";
import useMixer from "./hooks/useMixer";
import { initSystem } from "./lib/api";
import { getShiftedKey, getPlaybackRate } from "./utils/music";
import useRecorder from "./hooks/useRecorder";
import useHotCues from "./hooks/useHotCues";
import useLoopRoll from "./hooks/useLoopRoll";
import usePlaybackPosition from "./hooks/usePlaybackPosition";
import AuthScreen from "./components/Auth/AuthScreen";
import LibraryPanel from "./components/Library/LibraryPanel";
import RecordBar from "./components/RecordBar";
import "./App.css";

function App() {
  const { user, loading: authLoading, signUp, signIn, signInWithGoogle, signOut } = useAuth();
  const {
    tracks: libraryTracks, loading: libraryLoading, uploadTrack, deleteTrack, getStemUrls,
    uploadQueueInfo, cancelProcessingTrack, clearQueue
  } = useLibrary(user);

  const [status, setStatus] = useState("INSERT COIN");
  const [isSystemReady, setIsSystemReady] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [hfSpaceUrl, setHfSpaceUrl] = useState("");
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);

  const audioPlayerRef = useRef(new AudioPlayer());

  // --- Mixer hook ---
  const mixer = useMixer(audioPlayerRef, null, null); // trackA/B passed below after decks init
  // We need a two-phase approach: mixer needs tracks for BPM sync
  // So we use a ref-based approach for the circular dependency
  const mixerRef = useRef(mixer);
  mixerRef.current = mixer;

  // --- Decks hook ---
  const decks = useDecks(
    audioPlayerRef,
    mixer.masterBpm,
    mixer.setMasterBpm,
    hfSpaceUrl,
    setStatus,
    getStemUrls,
  );

  // Patch mixer's track refs for BPM change handler
  const mixerWithTracks = useMixer(audioPlayerRef, decks.trackA, decks.trackB);
  // Use mixerWithTracks for BPM-related handlers that need track refs
  const {
    volumeA, volumeB, crossfader, filterA, filterB,
    eqA, eqB, masterVolume, masterBpm,
    setCrossfader,
    handleVolumeChange, handleCrossfaderChange, handleMasterVolumeChange,
    handleEqChange, handleFilterChange, handleMasterBpmChange,
    handleMasterEffect, triggerSampler,
    keyLockA, keyLockB, toggleKeyLock,
  } = mixerWithTracks;

  // --- System init ---
  useEffect(() => {
    initSystem()
      .then(({ hfSpaceUrl: url }) => {
        setHfSpaceUrl(url);
        setStatus("SYSTEM READY");
        setIsSystemReady(true);
      })
      .catch((err) => {
        console.error("System init error:", err);
        setStatus("OFFLINE");
        setIsSystemReady(false);
      });

    return () => audioPlayerRef.current?.cleanup();
  }, []);

  // --- Keyboard shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || !isSystemReady) return;
      const key = e.key;
      const lower = key.toLowerCase();

      // Deck A/B play
      if (lower === 's') { decks.togglePlay('A'); return; }
      if (lower === 'l') { decks.togglePlay('B'); return; }
      // Space: toggle active deck (A priority)
      if (key === ' ') { e.preventDefault(); decks.togglePlay(decks.isPlayingA ? 'A' : decks.isPlayingB ? 'B' : 'A'); return; }
      // Crossfader
      if (key === 'ArrowLeft') { setCrossfader(prev => Math.max(0, prev - 0.1)); return; }
      if (key === 'ArrowRight') { setCrossfader(prev => Math.min(1, prev + 0.1)); return; }
      // Library
      if (key === 'Tab') { e.preventDefault(); setIsLibraryOpen(prev => !prev); return; }
      // Deck A controls
      if (lower === 'q') { decks.toggleQuantize('A'); return; }
      if (lower === 'w') { decks.toggleSlipMode('A'); return; }
      if (lower === 'e') { toggleKeyLock('A'); return; }
      // BPM adjust
      if (key === '-' || key === '_') { handleMasterBpmChange(Math.max(60, masterBpm - 1)); return; }
      if (key === '=' || key === '+') { handleMasterBpmChange(Math.min(180, masterBpm + 1)); return; }
      // Hot cues: 1-8 Deck A, Shift+1-8 Deck B
      const num = parseInt(key);
      if (num >= 1 && num <= 8) {
        const deck = e.shiftKey ? 'B' : 'A';
        const idx = num - 1;
        const cues = e.shiftKey ? hotCues.hotCuesB : hotCues.hotCuesA;
        const track = e.shiftKey ? decks.trackB : decks.trackA;
        if (cues[idx]) {
          hotCues.jumpToHotCue(deck, idx);
        } else {
          hotCues.setHotCue(deck, idx, track?.bpm, track);
        }
        return;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSystemReady, decks, hotCues, masterBpm, toggleKeyLock, handleMasterBpmChange, setCrossfader]);

  // --- Hot Cues ---
  const hotCues = useHotCues(audioPlayerRef);

  // Load cues when tracks change
  useEffect(() => {
    hotCues.loadCuesForTrack('A', decks.trackA);
  }, [decks.trackA?.id, decks.trackA?.filename]);
  useEffect(() => {
    hotCues.loadCuesForTrack('B', decks.trackB);
  }, [decks.trackB?.id, decks.trackB?.filename]);

  // --- Loop Roll ---
  const loopRoll = useLoopRoll(audioPlayerRef);

  // --- Playback Position (for waveform) ---
  const { positionA, positionB } = usePlaybackPosition(audioPlayerRef, decks.isPlayingA, decks.isPlayingB);

  // --- Recorder ---
  const recorder = useRecorder(audioPlayerRef);

  // --- Scratch handlers ---
  const handleScratchStart = (deckId) => audioPlayerRef.current.startScratch(deckId);
  const handleScratchMove = (deckId, angleDelta) => audioPlayerRef.current.updateScratch(deckId, angleDelta);
  const handleScratchEnd = (deckId, bpm) => audioPlayerRef.current.endScratch(deckId, bpm);

  // --- Guard wrapper for deck/mixer actions ---
  const guard = (fn) => (...args) => { if (isSystemReady) fn(...args); };

  // --- Render ---
  return (
    <div className="app-container">
      {authLoading ? (
        <div className="loading-overlay">
          <div className="pixel-font" style={{ fontSize: '1.5rem', color: 'var(--neon-green)', textAlign: 'center', textShadow: '0 0 10px rgba(0, 255, 157, 0.8)' }}>
            LOADING...
          </div>
        </div>
      ) : !user ? (
        <AuthScreen onSignIn={signIn} onSignUp={signUp} onSignInWithGoogle={signInWithGoogle} />
      ) : (
        <div className={`main-layout ${isLibraryOpen ? 'library-open' : ''}`}>
          <LibraryPanel
            isOpen={isLibraryOpen}
            onClose={() => setIsLibraryOpen(false)}
            tracks={libraryTracks}
            loading={libraryLoading}
            onUpload={uploadTrack}
            onDelete={deleteTrack}
            onLoadToDeck={guard(decks.loadTrackFromLibrary)}
            uploadQueueInfo={uploadQueueInfo}
            onCancelProcessing={cancelProcessingTrack}
            onClearQueue={clearQueue}
          />
          <button
            className={`library-toggle ${isLibraryOpen ? 'panel-open' : ''}`}
            onClick={() => setIsLibraryOpen(prev => !prev)}
          >
            LIBRARY
          </button>

          <div className="main-content">
            {!isSystemReady && (
              <div className="loading-overlay">
                <div className="pixel-font" style={{
                  fontSize: '1.5rem',
                  color: status === 'OFFLINE' ? 'var(--neon-pink)' : 'var(--neon-green)',
                  textAlign: 'center', marginBottom: '20px',
                  textShadow: `0 0 10px ${status === 'OFFLINE' ? 'rgba(255, 0, 85, 0.8)' : 'rgba(0, 255, 157, 0.8)'}`,
                }}>
                  {status}
                </div>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-dim)', fontFamily: 'Rajdhani, sans-serif' }}>
                  {status === 'OFFLINE' ? 'Backend server is offline. Please check your connection.' : 'Initializing system...'}
                </div>
              </div>
            )}

            <div className="top-bar">
              <a href="https://jiinn-hhhh.github.io/homepage/" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                <h1 className="pixel-font">Simple DJ</h1>
              </a>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <RecordBar
                  isRecordingAudio={recorder.isRecordingAudio}
                  isRecordingVideo={recorder.isRecordingVideo}
                  recordingTime={recorder.recordingTime}
                  onStartAudio={recorder.startAudioRecording}
                  onStopAudio={recorder.stopAudioRecording}
                  onStartVideo={recorder.startVideoRecording}
                  onStopVideo={recorder.stopVideoRecording}
                />
                <button onClick={() => setShowHelp(true)} className="help-topbar-btn pixel-font" title="Help & Shortcuts">?</button>
                <button onClick={signOut} style={{
                  background: 'transparent', border: '1px solid var(--neon-pink)', color: 'var(--neon-pink)',
                  fontFamily: "'Press Start 2P', cursive", fontSize: '0.6rem', padding: '8px 12px', cursor: 'pointer', borderRadius: '4px',
                }}>
                  LOGOUT
                </button>
              </div>
            </div>

            {showHelp && (
              <div className="help-modal-overlay" onClick={() => setShowHelp(false)}>
                <div className="help-modal" onClick={e => e.stopPropagation()}>
                  <div className="help-modal-header">
                    <span className="pixel-font" style={{fontSize:'0.6rem',color:'var(--neon-green)'}}>SHORTCUTS</span>
                    <button className="help-modal-close" onClick={() => setShowHelp(false)}>&times;</button>
                  </div>
                  <div className="help-modal-body">
                    <div className="help-section">
                      <div className="help-row"><kbd>S</kbd> Deck A play/pause</div>
                      <div className="help-row"><kbd>L</kbd> Deck B play/pause</div>
                      <div className="help-row"><kbd>Space</kbd> Active deck play/pause</div>
                      <div className="help-row"><kbd>Q</kbd> Deck A quantize</div>
                      <div className="help-row"><kbd>W</kbd> Deck A slip mode</div>
                      <div className="help-row"><kbd>E</kbd> Deck A key lock</div>
                      <div className="help-row"><kbd>1-8</kbd> Deck A hot cues</div>
                      <div className="help-row"><kbd>Shift+1-8</kbd> Deck B hot cues</div>
                      <div className="help-row"><kbd>-/+</kbd> BPM adjust</div>
                      <div className="help-row"><kbd>&larr;/&rarr;</kbd> Crossfader</div>
                      <div className="help-row"><kbd>Tab</kbd> Library toggle</div>
                    </div>
                    <div className="help-section" style={{marginTop:'8px',fontSize:'0.7rem',color:'#666'}}>
                      Drag tracks from library to decks. Double-click track name to rename.
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="console-layout" style={{ opacity: isSystemReady ? 1 : 0.3, pointerEvents: isSystemReady ? 'auto' : 'none' }}>
              <Deck
                deckId="A"
                track={decks.trackA}
                isPlaying={decks.isPlayingA}
                playbackRate={getPlaybackRate(decks.trackA, masterBpm)}
                effectiveKey={keyLockA ? decks.trackA?.key : getShiftedKey(decks.trackA?.key, decks.trackA?.bpm, masterBpm)}
                onPlayPause={() => guard(decks.togglePlay)('A')}
                onLoadFromLibrary={guard(decks.loadTrackFromLibrary)}
                waveformData={decks.waveformDataA}
                playbackPosition={positionA}
                volume={volumeA}
                onVolumeChange={(val) => guard(handleVolumeChange)('A', val)}
                filter={filterA}
                onFilterChange={(val) => guard(handleFilterChange)('A', val)}
                activeStems={decks.stemsA}
                onToggleStem={(stem) => guard(decks.toggleStem)('A', stem)}
                isSeparating={decks.isSeparatingA}
                separationProgress={decks.separationProgressA}
                onLoopIn={() => guard(decks.handleLoopIn)('A')}
                onLoopOut={() => guard(decks.handleLoopOut)('A')}
                onExitLoop={() => guard(decks.handleExitLoop)('A')}
                onSeek={(p) => guard(decks.handleSeek)('A', p)}
                onScratchStart={handleScratchStart}
                onScratchMove={handleScratchMove}
                onScratchEnd={handleScratchEnd}
                visualizerNode={audioPlayerRef.current.getAnalyser('A')}
                loadingTrack={decks.loadingFileA}
                quantizeEnabled={decks.quantizeA}
                onToggleQuantize={() => guard(decks.toggleQuantize)('A')}
                hotCues={hotCues.hotCuesA}
                onSetHotCue={(idx) => guard(hotCues.setHotCue)('A', idx, decks.trackA?.bpm, decks.trackA)}
                onJumpHotCue={(idx) => guard(hotCues.jumpToHotCue)('A', idx)}
                onDeleteHotCue={(idx) => guard(hotCues.deleteHotCue)('A', idx, decks.trackA)}
                beatJumpSize={decks.beatJumpSizeA}
                onSetBeatJumpSize={(size) => decks.setBeatJumpSize('A', size)}
                onBeatJump={(dir) => guard(decks.handleBeatJump)('A', dir)}
                keyLockEnabled={keyLockA}
                onToggleKeyLock={() => guard(toggleKeyLock)('A')}
                slipModeEnabled={decks.slipModeA}
                onToggleSlipMode={() => guard(decks.toggleSlipMode)('A')}
                activeLoopRoll={loopRoll.activeRollA}
                onStartLoopRoll={(beats) => guard(loopRoll.startLoopRoll)('A', beats, decks.trackA?.bpm)}
                onEndLoopRoll={() => guard(loopRoll.endLoopRoll)('A')}
              />

              <Mixer
                crossfader={crossfader}
                onCrossfaderChange={guard(handleCrossfaderChange)}
                volumeA={volumeA}
                onVolumeAChange={(val) => guard(handleVolumeChange)('A', val)}
                volumeB={volumeB}
                onVolumeBChange={(val) => guard(handleVolumeChange)('B', val)}
                filterA={filterA}
                onFilterAChange={(val) => guard(handleFilterChange)('A', val)}
                filterB={filterB}
                onFilterBChange={(val) => guard(handleFilterChange)('B', val)}
                eqA={eqA}
                eqB={eqB}
                onEqChange={guard(handleEqChange)}
                masterBpm={masterBpm}
                onBpmChange={guard(handleMasterBpmChange)}
                masterVolume={masterVolume}
                onMasterVolumeChange={guard(handleMasterVolumeChange)}
                onMasterEffect={guard(handleMasterEffect)}
                onTriggerSampler={guard(triggerSampler)}
              />

              <Deck
                deckId="B"
                track={decks.trackB}
                isPlaying={decks.isPlayingB}
                playbackRate={getPlaybackRate(decks.trackB, masterBpm)}
                effectiveKey={keyLockB ? decks.trackB?.key : getShiftedKey(decks.trackB?.key, decks.trackB?.bpm, masterBpm)}
                onPlayPause={() => guard(decks.togglePlay)('B')}
                onLoadFromLibrary={guard(decks.loadTrackFromLibrary)}
                waveformData={decks.waveformDataB}
                playbackPosition={positionB}
                volume={volumeB}
                onVolumeChange={(val) => guard(handleVolumeChange)('B', val)}
                filter={filterB}
                onFilterChange={(val) => guard(handleFilterChange)('B', val)}
                activeStems={decks.stemsB}
                onToggleStem={(stem) => guard(decks.toggleStem)('B', stem)}
                isSeparating={decks.isSeparatingB}
                separationProgress={decks.separationProgressB}
                onLoopIn={() => guard(decks.handleLoopIn)('B')}
                onLoopOut={() => guard(decks.handleLoopOut)('B')}
                onExitLoop={() => guard(decks.handleExitLoop)('B')}
                onSeek={(p) => guard(decks.handleSeek)('B', p)}
                onScratchStart={handleScratchStart}
                onScratchMove={handleScratchMove}
                onScratchEnd={handleScratchEnd}
                visualizerNode={audioPlayerRef.current.getAnalyser('B')}
                loadingTrack={decks.loadingFileB}
                quantizeEnabled={decks.quantizeB}
                onToggleQuantize={() => guard(decks.toggleQuantize)('B')}
                hotCues={hotCues.hotCuesB}
                onSetHotCue={(idx) => guard(hotCues.setHotCue)('B', idx, decks.trackB?.bpm, decks.trackB)}
                onJumpHotCue={(idx) => guard(hotCues.jumpToHotCue)('B', idx)}
                onDeleteHotCue={(idx) => guard(hotCues.deleteHotCue)('B', idx, decks.trackB)}
                beatJumpSize={decks.beatJumpSizeB}
                onSetBeatJumpSize={(size) => decks.setBeatJumpSize('B', size)}
                onBeatJump={(dir) => guard(decks.handleBeatJump)('B', dir)}
                keyLockEnabled={keyLockB}
                onToggleKeyLock={() => guard(toggleKeyLock)('B')}
                slipModeEnabled={decks.slipModeB}
                onToggleSlipMode={() => guard(decks.toggleSlipMode)('B')}
                activeLoopRoll={loopRoll.activeRollB}
                onStartLoopRoll={(beats) => guard(loopRoll.startLoopRoll)('B', beats, decks.trackB?.bpm)}
                onEndLoopRoll={() => guard(loopRoll.endLoopRoll)('B')}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
