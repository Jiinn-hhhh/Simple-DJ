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

  const [status, setStatus] = useState("SYSTEM LOADING...");
  const [isSystemReady, setIsSystemReady] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [helpTab, setHelpTab] = useState('guide');
  const [hfSpaceUrl, setHfSpaceUrl] = useState("");
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isQuantizeEnabled, setIsQuantizeEnabled] = useState(false);

  const audioPlayerRef = useRef(new AudioPlayer());

  // --- Mixer hook ---
  const mixer = useMixer(audioPlayerRef, null, null); // trackA/B passed below after decks init

  // --- Decks hook ---
  const decks = useDecks(
    audioPlayerRef,
    mixer.masterBpm,
    mixer.setMasterBpm,
    hfSpaceUrl,
    setStatus,
    getStemUrls,
    isQuantizeEnabled,
  );

  // Patch mixer's track refs for BPM change handler
  const mixerWithTracks = useMixer(audioPlayerRef, decks.trackA, decks.trackB);
  // Use mixerWithTracks for BPM-related handlers that need track refs
  const {
    volumeA, volumeB, crossfader, filterA, filterB,
    eqA, eqB, masterVolume, effectVolume, masterBpm,
    handleVolumeChange, handleCrossfaderChange, handleMasterVolumeChange,
    handleEffectVolumeChange,
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

  useEffect(() => {
    if (!user || !isSystemReady) return;

    audioPlayerRef.current.preloadSamplerSamples?.().catch((err) => {
      console.error('Sampler preload failed:', err);
    });
  }, [user, isSystemReady]);

  useEffect(() => {
    audioPlayerRef.current.setQuantize('A', isQuantizeEnabled);
    audioPlayerRef.current.setQuantize('B', isQuantizeEnabled);
  }, [isQuantizeEnabled]);


  // --- Hot Cues ---
  const hotCues = useHotCues(audioPlayerRef);

  // Load cues when tracks change
  useEffect(() => {
    hotCues.loadCuesForTrack('A', decks.trackA);
  }, [decks.trackA?.id, decks.trackA?.filename]);
  useEffect(() => {
    hotCues.loadCuesForTrack('B', decks.trackB);
  }, [decks.trackB?.id, decks.trackB?.filename]);

  // --- Keyboard shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || !isSystemReady) return;
      const key = e.key;
      const lower = key.toLowerCase();
      if (lower === 's') { decks.togglePlay('A'); return; }
      if (lower === 'l') { decks.togglePlay('B'); return; }
      if (key === ' ') { e.preventDefault(); decks.togglePlay(decks.isPlayingA ? 'A' : decks.isPlayingB ? 'B' : 'A'); return; }
      if (key === 'ArrowLeft') { handleCrossfaderChange(Math.max(0, crossfader - 0.05)); return; }
      if (key === 'ArrowRight') { handleCrossfaderChange(Math.min(1, crossfader + 0.05)); return; }
      if (key === 'Tab') { e.preventDefault(); setIsLibraryOpen(prev => !prev); return; }
      if (lower === 'q') { setIsQuantizeEnabled(prev => !prev); return; }
      if (lower === 'w') { decks.toggleSlipMode('A'); return; }
      if (lower === 'e') { toggleKeyLock('A'); return; }
      if (key === '-' || key === '_') { handleMasterBpmChange(Math.max(60, masterBpm - 1)); return; }
      if (key === '=' || key === '+') { handleMasterBpmChange(Math.min(180, masterBpm + 1)); return; }
      const num = parseInt(key);
      if (num >= 1 && num <= 8) {
        const deck = e.shiftKey ? 'B' : 'A';
        const idx = num - 1;
        const cues = e.shiftKey ? hotCues.hotCuesB : hotCues.hotCuesA;
        const track = e.shiftKey ? decks.trackB : decks.trackA;
        if (cues[idx]) { hotCues.jumpToHotCue(deck, idx, masterBpm); }
        else { hotCues.setHotCue(deck, idx, track?.bpm, track); }
        return;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSystemReady, decks, hotCues, masterBpm, toggleKeyLock, handleMasterBpmChange, handleCrossfaderChange, crossfader]);

  // --- Loop Roll ---
  const loopRoll = useLoopRoll(audioPlayerRef);

  // --- Playback Position (for waveform) ---
  const {
    positionA,
    positionB,
    slipPositionA,
    slipPositionB,
    seekPosition,
    syncPosition,
  } = usePlaybackPosition(audioPlayerRef, decks.isPlayingA, decks.isPlayingB);

  // --- Recorder ---
  const recorder = useRecorder(audioPlayerRef);

  // --- Scratch handlers ---
  const handleScratchStart = (deckId) => audioPlayerRef.current.startScratch(deckId);
  const handleScratchMove = (deckId, angleDelta) => audioPlayerRef.current.updateScratch(deckId, angleDelta);
  const handleScratchEnd = (deckId, bpm) => audioPlayerRef.current.endScratch(deckId, bpm);

  // --- Guard wrapper for deck/mixer actions ---
  const guard = (fn) => (...args) => {
    if (!isSystemReady) return undefined;
    return fn(...args);
  };

  // --- Render ---
  return (
    <div className="app-container">
      {authLoading ? (
        <div className="loading-overlay">
          <div className="pixel-font" style={{ fontSize: '1.5rem', color: 'var(--neon-green)', textAlign: 'center' }}>
            SYSTEM LOADING...
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
                  /* glow removed */
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
                  countdown={recorder.countdown}
                  onStartAudio={recorder.startAudioRecording}
                  onStopAudio={recorder.stopAudioRecording}
                  onStartVideo={recorder.startVideoRecording}
                  onStopVideo={recorder.stopVideoRecording}
                  onCancel={recorder.cancelRecordingCountdown}
                />
                <button onClick={() => setShowHelp(true)} className="topbar-btn help-topbar-btn pixel-font" title="Help & Shortcuts">?</button>
                <button onClick={signOut} className="topbar-btn logout-btn pixel-font">LOGOUT</button>
              </div>
            </div>

            {showHelp && (
              <div className="help-modal-overlay" onClick={() => setShowHelp(false)}>
                <div className="help-modal" onClick={e => e.stopPropagation()}>
                  <div className="help-modal-header">
                    <span className="pixel-font" style={{fontSize:'0.6rem',color:'var(--neon-green)'}}>SHORTCUTS</span>
                    <button className="help-modal-close" onClick={() => setShowHelp(false)}>&times;</button>
                  </div>
                  <div className="help-tabs">
                    <button className={`help-tab ${helpTab === 'guide' ? 'active' : ''}`} onClick={() => setHelpTab('guide')}>GUIDE</button>
                    <button className={`help-tab ${helpTab === 'shortcuts' ? 'active' : ''}`} onClick={() => setHelpTab('shortcuts')}>SHORTCUTS</button>
                  </div>
                  <div className="help-modal-body">
                    {helpTab === 'guide' ? (
                      <div className="help-tips">
                        <div>Drag tracks from library to decks</div>
                        <div>Match BPM with -/+ keys, mix with crossfader</div>
                        <div>Stems: mute/unmute drums, bass, vocals, other</div>
                        <div>Hot Cues: click pad to save position, click again to jump</div>
                        <div>Loop: IN sets start, OUT sets end, EXIT leaves loop</div>
                        <div>Loop Roll: hold pad for beat-synced repeat, release to continue or slip-return</div>
                        <div>Slip Mode: scratching/looping returns to original position</div>
                        <div>Key Lock: keep pitch when changing BPM</div>
                        <div>Quantize: global start timing snaps to the next master beat</div>
                        <div>EQ: adjust low/mid/high frequencies per deck</div>
                        <div>Filter: low-pass (left) / high-pass (right)</div>
                        <div>FX Pad: X=reverb/distortion, Y=intensity</div>
                      </div>
                    ) : (
                      <div className="help-section">
                        <div className="help-row"><kbd>S</kbd> Deck A play/pause</div>
                        <div className="help-row"><kbd>L</kbd> Deck B play/pause</div>
                        <div className="help-row"><kbd>Space</kbd> Active deck play/pause</div>
                        <div className="help-row"><kbd>Q</kbd> Global quantize toggle</div>
                        <div className="help-row"><kbd>W</kbd> Slip mode toggle</div>
                        <div className="help-row"><kbd>E</kbd> Key lock toggle</div>
                        <div className="help-row"><kbd>1-4</kbd> Deck A hot cues</div>
                        <div className="help-row"><kbd>Shift+1-4</kbd> Deck B hot cues</div>
                        <div className="help-row"><kbd>-/+</kbd> BPM adjust</div>
                        <div className="help-row"><kbd>&larr;/&rarr;</kbd> Crossfader</div>
                        <div className="help-row"><kbd>Tab</kbd> Library toggle</div>
                      </div>
                    )}
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
                slipPlaybackPosition={slipPositionA}
                activeStems={decks.stemsA}
                onToggleStem={(stem) => guard(decks.toggleStem)('A', stem)}
                isSeparating={decks.isSeparatingA}
                separationProgress={decks.separationProgressA}
                onLoopIn={() => guard(decks.handleLoopIn)('A')}
                onLoopOut={() => guard(decks.handleLoopOut)('A')}
                onExitLoop={() => guard(decks.handleExitLoop)('A')}
                onSeek={(p) => { guard(decks.handleSeek)('A', p); seekPosition('A', p); }}
                onScratchStart={handleScratchStart}
                onScratchMove={handleScratchMove}
                onScratchEnd={handleScratchEnd}
                visualizerNode={audioPlayerRef.current.getAnalyser('A')}
                loadingTrack={decks.loadingFileA}
                hotCues={hotCues.hotCuesA}
                onSetHotCue={(idx) => guard(hotCues.setHotCue)('A', idx, decks.trackA?.bpm, decks.trackA)}
                onJumpHotCue={async (idx) => {
                  if (!isSystemReady) return;
                  await hotCues.jumpToHotCue('A', idx, isQuantizeEnabled ? masterBpm : null);
                  syncPosition('A');
                }}
                onDeleteHotCue={(idx) => guard(hotCues.deleteHotCue)('A', idx, decks.trackA)}
                beatJumpSize={decks.beatJumpSizeA}
                onSetBeatJumpSize={(size) => decks.setBeatJumpSize('A', size)}
                onBeatJump={async (dir) => {
                  if (!isSystemReady) return;
                  await decks.handleBeatJump('A', dir);
                  syncPosition('A');
                }}
                keyLockEnabled={keyLockA}
                onToggleKeyLock={() => guard(toggleKeyLock)('A')}
                slipModeEnabled={decks.slipModeA}
                onToggleSlipMode={() => guard(decks.toggleSlipMode)('A')}
                activeLoopRoll={loopRoll.activeRollA}
                onStartLoopRoll={(beats) => guard(loopRoll.startLoopRoll)('A', beats, decks.trackA?.bpm, masterBpm)}
                onEndLoopRoll={() => guard(loopRoll.endLoopRoll)('A')}
                onChangeLoopRollSize={(beats) => guard(loopRoll.changeLoopRollSize)('A', beats, decks.trackA?.bpm, masterBpm)}
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
                effectVolume={effectVolume}
                onMasterVolumeChange={guard(handleMasterVolumeChange)}
                onEffectVolumeChange={guard(handleEffectVolumeChange)}
                onMasterEffect={guard(handleMasterEffect)}
                onTriggerSampler={guard(triggerSampler)}
                quantizeEnabled={isQuantizeEnabled}
                onToggleQuantize={() => setIsQuantizeEnabled(prev => !prev)}
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
                slipPlaybackPosition={slipPositionB}
                activeStems={decks.stemsB}
                onToggleStem={(stem) => guard(decks.toggleStem)('B', stem)}
                isSeparating={decks.isSeparatingB}
                separationProgress={decks.separationProgressB}
                onLoopIn={() => guard(decks.handleLoopIn)('B')}
                onLoopOut={() => guard(decks.handleLoopOut)('B')}
                onExitLoop={() => guard(decks.handleExitLoop)('B')}
                onSeek={(p) => { guard(decks.handleSeek)('B', p); seekPosition('B', p); }}
                onScratchStart={handleScratchStart}
                onScratchMove={handleScratchMove}
                onScratchEnd={handleScratchEnd}
                visualizerNode={audioPlayerRef.current.getAnalyser('B')}
                loadingTrack={decks.loadingFileB}
                hotCues={hotCues.hotCuesB}
                onSetHotCue={(idx) => guard(hotCues.setHotCue)('B', idx, decks.trackB?.bpm, decks.trackB)}
                onJumpHotCue={async (idx) => {
                  if (!isSystemReady) return;
                  await hotCues.jumpToHotCue('B', idx, isQuantizeEnabled ? masterBpm : null);
                  syncPosition('B');
                }}
                onDeleteHotCue={(idx) => guard(hotCues.deleteHotCue)('B', idx, decks.trackB)}
                beatJumpSize={decks.beatJumpSizeB}
                onSetBeatJumpSize={(size) => decks.setBeatJumpSize('B', size)}
                onBeatJump={async (dir) => {
                  if (!isSystemReady) return;
                  await decks.handleBeatJump('B', dir);
                  syncPosition('B');
                }}
                keyLockEnabled={keyLockB}
                onToggleKeyLock={() => guard(toggleKeyLock)('B')}
                slipModeEnabled={decks.slipModeB}
                onToggleSlipMode={() => guard(decks.toggleSlipMode)('B')}
                activeLoopRoll={loopRoll.activeRollB}
                onStartLoopRoll={(beats) => guard(loopRoll.startLoopRoll)('B', beats, decks.trackB?.bpm, masterBpm)}
                onEndLoopRoll={() => guard(loopRoll.endLoopRoll)('B')}
                onChangeLoopRollSize={(beats) => guard(loopRoll.changeLoopRollSize)('B', beats, decks.trackB?.bpm, masterBpm)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
