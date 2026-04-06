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
import AuthScreen from "./components/Auth/AuthScreen";
import LibraryPanel from "./components/Library/LibraryPanel";
import "./App.css";

function App() {
  const { user, loading: authLoading, signUp, signIn, signInWithGoogle, signOut } = useAuth();
  const { tracks: libraryTracks, loading: libraryLoading, uploadTrack, deleteTrack, getStemUrls } = useLibrary(user);

  const [status, setStatus] = useState("INSERT COIN");
  const [isSystemReady, setIsSystemReady] = useState(false);
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
      switch (e.key.toLowerCase()) {
        case 's': decks.togglePlay('A'); break;
        case 'l': decks.togglePlay('B'); break;
        case 'arrowleft': setCrossfader(prev => Math.max(0, prev - 0.1)); break;
        case 'arrowright': setCrossfader(prev => Math.min(1, prev + 0.1)); break;
        case 'tab': e.preventDefault(); setIsLibraryOpen(prev => !prev); break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSystemReady, decks.togglePlay, setCrossfader]);

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
                <div className="status-bar pixel-font">{status}</div>
                <button onClick={signOut} style={{
                  background: 'transparent', border: '1px solid var(--neon-pink)', color: 'var(--neon-pink)',
                  fontFamily: "'Press Start 2P', cursive", fontSize: '0.6rem', padding: '8px 12px', cursor: 'pointer', borderRadius: '4px',
                }}>
                  LOGOUT
                </button>
              </div>
            </div>

            <div className="console-layout" style={{ opacity: isSystemReady ? 1 : 0.3, pointerEvents: isSystemReady ? 'auto' : 'none' }}>
              <Deck
                deckId="A"
                track={decks.trackA}
                isPlaying={decks.isPlayingA}
                playbackRate={getPlaybackRate(decks.trackA, masterBpm)}
                effectiveKey={getShiftedKey(decks.trackA?.key, decks.trackA?.bpm, masterBpm)}
                onPlayPause={() => guard(decks.togglePlay)('A')}
                onLoadFromLibrary={guard(decks.loadTrackFromLibrary)}
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
                effectiveKey={getShiftedKey(decks.trackB?.key, decks.trackB?.bpm, masterBpm)}
                onPlayPause={() => guard(decks.togglePlay)('B')}
                onLoadTrack={(file) => guard(decks.loadTrack)('B', file)}
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
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
