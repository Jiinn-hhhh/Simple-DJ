import { useState, useEffect, useRef, useCallback } from "react";
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
  const [isHeadphoneMenuOpen, setIsHeadphoneMenuOpen] = useState(false);
  const [halfTimeByDeck, setHalfTimeByDeck] = useState({ A: false, B: false });
  const [isAutoTransitioning, setIsAutoTransitioning] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [autoSwitchGlow, setAutoSwitchGlow] = useState(false);
  const [masterBpm, setMasterBpm] = useState(128);

  const audioPlayerRef = useRef(new AudioPlayer());
  const autoTransitionTimersRef = useRef([]);
  const autoSwitchGlowTimerRef = useRef(null);
  const isAutoTransitioningRef = useRef(false);

  // --- Decks hook ---
  const decks = useDecks(
    audioPlayerRef,
    masterBpm,
    setMasterBpm,
    hfSpaceUrl,
    setStatus,
    getStemUrls,
    isQuantizeEnabled,
    halfTimeByDeck,
  );

  const deckBeatBpms = {
    A: decks.getDeckBeatBpm?.('A', decks.trackA?.bpm) || decks.trackA?.bpm || 0,
    B: decks.getDeckBeatBpm?.('B', decks.trackB?.bpm) || decks.trackB?.bpm || 0,
  };

  const {
    volumeA, volumeB, crossfader, filterA, filterB,
    eqA, eqB, masterVolume, effectVolume,
    headphoneOnlyA, headphoneOnlyB, headphoneVolume,
    headphoneOutputs,
    handleVolumeChange, handleCrossfaderChange, handleMasterVolumeChange,
    handleEffectVolumeChange, handleHeadphoneOnlyToggle, handleHeadphoneVolumeChange,
    handleRefreshHeadphoneOutputs, handleSelectHeadphoneOutput,
    handleEqChange, handleFilterChange, handleMasterBpmChange,
    handleMasterEffect, triggerSampler,
    keyLockA, keyLockB, toggleKeyLock,
  } = useMixer(audioPlayerRef, decks.trackA, decks.trackB, masterBpm, setMasterBpm, setStatus, deckBeatBpms);

  const setAutoTransitionActive = useCallback((active) => {
    isAutoTransitioningRef.current = active;
    setIsAutoTransitioning(active);
  }, []);

  const handleSafeMasterBpmChange = useCallback((nextBpm) => {
    if (isAutoTransitioningRef.current) {
      setStatus('BPM LOCKED DURING SWICH');
      return;
    }

    handleMasterBpmChange(nextBpm);
  }, [handleMasterBpmChange]);

  // --- System init ---
  useEffect(() => {
    const audioPlayer = audioPlayerRef.current;

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

    return () => audioPlayer?.cleanup();
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

  useEffect(() => () => {
    autoTransitionTimersRef.current.forEach(({ id, type }) => {
      if (type === 'interval') window.clearInterval(id);
      else window.clearTimeout(id);
    });
    autoTransitionTimersRef.current = [];
    if (autoSwitchGlowTimerRef.current) window.clearTimeout(autoSwitchGlowTimerRef.current);
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement || document.webkitFullscreenElement));
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('visibilitychange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('visibilitychange', handleFullscreenChange);
    };
  }, []);


  // --- Hot Cues ---
  const hotCues = useHotCues(audioPlayerRef);
  const { loadCuesForTrack } = hotCues;

  // Load cues when tracks change
  useEffect(() => {
    loadCuesForTrack('A', decks.trackA);
  }, [decks.trackA, loadCuesForTrack]);
  useEffect(() => {
    loadCuesForTrack('B', decks.trackB);
  }, [decks.trackB, loadCuesForTrack]);

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
      if (key === '-' || key === '_') { handleSafeMasterBpmChange(Math.max(60, masterBpm - 1)); return; }
      if (key === '=' || key === '+') { handleSafeMasterBpmChange(Math.min(180, masterBpm + 1)); return; }
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
  }, [isSystemReady, decks, hotCues, masterBpm, toggleKeyLock, handleSafeMasterBpmChange, handleCrossfaderChange, crossfader]);

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

  const clearAutoTransitionTimers = () => {
    autoTransitionTimersRef.current.forEach(({ id, type }) => {
      if (type === 'interval') window.clearInterval(id);
      else window.clearTimeout(id);
    });
    autoTransitionTimersRef.current = [];
  };

  const scheduleAutoTimeout = (callback, delayMs) => {
    const id = window.setTimeout(callback, Math.max(0, delayMs));
    autoTransitionTimersRef.current.push({ id, type: 'timeout' });
    return id;
  };

  const rampDeckControl = (deckId, kind, from, to, durationMs) => {
    const setter = kind === 'filter' ? handleFilterChange : handleVolumeChange;
    const safeDuration = Math.max(1, durationMs);
    let elapsedMs = 0;
    setter(deckId, from);

    const id = window.setInterval(() => {
      elapsedMs += 33;
      const progress = Math.min(1, elapsedMs / safeDuration);
      const eased = progress * progress * (3 - 2 * progress);
      const next = from + ((to - from) * eased);
      setter(deckId, Math.max(0, Math.min(1, next)));

      if (progress >= 1) {
        window.clearInterval(id);
        autoTransitionTimersRef.current = autoTransitionTimersRef.current.filter(timer => timer.id !== id);
      }
    }, 33);

    autoTransitionTimersRef.current.push({ id, type: 'interval' });
  };

  const rampCrossfaderToCenter = (from, durationMs = 450) => {
    const safeDuration = Math.max(1, durationMs);
    const start = Number.isFinite(from) ? from : 0.5;
    let elapsedMs = 0;
    handleCrossfaderChange(start);

    const id = window.setInterval(() => {
      elapsedMs += 16;
      const progress = Math.min(1, elapsedMs / safeDuration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = start + ((0.5 - start) * eased);
      handleCrossfaderChange(Math.max(0, Math.min(1, next)));

      if (progress >= 1) {
        window.clearInterval(id);
        autoTransitionTimersRef.current = autoTransitionTimersRef.current.filter(timer => timer.id !== id);
      }
    }, 16);

    autoTransitionTimersRef.current.push({ id, type: 'interval' });
  };

  const triggerAutoSwitchGlow = () => {
    if (autoSwitchGlowTimerRef.current) window.clearTimeout(autoSwitchGlowTimerRef.current);
    setAutoSwitchGlow(false);
    window.requestAnimationFrame(() => {
      setAutoSwitchGlow(true);
      autoSwitchGlowTimerRef.current = window.setTimeout(() => {
        setAutoSwitchGlow(false);
        autoSwitchGlowTimerRef.current = null;
      }, 760);
    });
  };

  const handleToggleHalfTime = (deckId) => {
    if (isAutoTransitioningRef.current) {
      setStatus('HALFTIME LOCKED DURING SWICH');
      return;
    }

    const track = deckId === 'A' ? decks.trackA : decks.trackB;
    setHalfTimeByDeck(prev => {
      const nextEnabled = !prev[deckId];
      const next = { ...prev, [deckId]: nextEnabled };
      const beatBpm = track?.bpm ? track.bpm / (nextEnabled ? 2 : 1) : 0;
      const normalBpm = track?.bpm || 0;
      const halfBpm = normalBpm / 2;
      const shouldFollowHalfTime = normalBpm && nextEnabled && Math.abs(masterBpm - normalBpm) <= 2;
      const shouldRestoreNormalTime = normalBpm && !nextEnabled && Math.abs(masterBpm - halfBpm) <= 2;
      const nextMasterBpm = shouldFollowHalfTime ? halfBpm : (shouldRestoreNormalTime ? normalBpm : masterBpm);
      if (nextMasterBpm !== masterBpm) setMasterBpm(nextMasterBpm);
      if (beatBpm) audioPlayerRef.current.setPlaybackRate(deckId, nextMasterBpm / beatBpm);
      setStatus(`DECK ${deckId} HALF TIME ${nextEnabled ? 'ON' : 'OFF'}`);
      return next;
    });
  };

  const handleAutoTransition = async (targetDeckId, bars) => {
    if (isAutoTransitioningRef.current) {
      setStatus('SWICH ALREADY RUNNING');
      return;
    }

    const sourceDeckId = targetDeckId === 'A' ? 'B' : 'A';
    const targetTrack = targetDeckId === 'A' ? decks.trackA : decks.trackB;
    const sourceTrack = sourceDeckId === 'A' ? decks.trackA : decks.trackB;
    const sourcePlaying = sourceDeckId === 'A' ? decks.isPlayingA : decks.isPlayingB;

    if (!targetTrack || !sourceTrack) {
      setStatus('LOAD BOTH DECKS FOR SWICH');
      return;
    }

    if (!sourcePlaying) {
      setStatus(`START DECK ${sourceDeckId} FIRST`);
      return;
    }

    const sourceBeatBpm = deckBeatBpms[sourceDeckId] || sourceTrack.bpm || masterBpm;
    const targetBeatBpm = deckBeatBpms[targetDeckId] || targetTrack.bpm || masterBpm;
    const transitionMasterBpm = masterBpm || sourceBeatBpm || targetBeatBpm || 128;
    const transitionBpm = Math.max(1, transitionMasterBpm);
    const barMs = (60 / transitionBpm) * 4 * 1000;
    const totalBars = bars === 2 ? 2 : 4;
    const filterStartBar = totalBars === 4 ? 2 : 0;
    const volumeStartBar = totalBars === 4 ? 3 : 1;
    const sourceVolume = sourceDeckId === 'A' ? volumeA : volumeB;
    const sourceFilter = sourceDeckId === 'A' ? filterA : filterB;

    clearAutoTransitionTimers();
    setAutoTransitionActive(true);

    try {
      if (sourceBeatBpm) audioPlayerRef.current.setPlaybackRate(sourceDeckId, transitionMasterBpm / sourceBeatBpm);
      if (targetBeatBpm) audioPlayerRef.current.setPlaybackRate(targetDeckId, transitionMasterBpm / targetBeatBpm);

      handleFilterChange(targetDeckId, 0.5);
      handleVolumeChange(targetDeckId, 0.8);
      const started = await decks.startDeck(targetDeckId, 0, { restart: false, quantized: false });

      if (!started) {
        throw new Error(`Deck ${targetDeckId} could not start`);
      }

      rampCrossfaderToCenter(crossfader, 450);
      triggerAutoSwitchGlow();

      scheduleAutoTimeout(() => {
        rampDeckControl(sourceDeckId, 'filter', sourceFilter, 1, barMs);
      }, filterStartBar * barMs);

      scheduleAutoTimeout(() => {
        rampDeckControl(sourceDeckId, 'volume', sourceVolume, 0.5, barMs);
      }, volumeStartBar * barMs);

      scheduleAutoTimeout(() => {
        clearAutoTransitionTimers();
        handleVolumeChange(sourceDeckId, 0);
        handleFilterChange(sourceDeckId, 0.5);
        decks.stopDeck(sourceDeckId);
        setAutoTransitionActive(false);
        setStatus(`SWICH ${totalBars} BAR COMPLETE`);
      }, totalBars * barMs);

      setStatus(`SWICH ${totalBars} BAR ${sourceDeckId} -> ${targetDeckId}`);
    } catch (err) {
      clearAutoTransitionTimers();
      setAutoTransitionActive(false);
      setStatus('SWICH FAILED');
      console.error('Auto transition failed:', err);
    }
  };

  // --- Guard wrapper for deck/mixer actions ---
  const guard = (fn) => (...args) => {
    if (!isSystemReady) return undefined;
    return fn(...args);
  };

  const guardLoad = (fn) => (...args) => {
    if (!isSystemReady) return undefined;
    if (isAutoTransitioningRef.current) {
      setStatus('LOAD LOCKED DURING SWICH');
      return undefined;
    }
    return fn(...args);
  };

  const handleHeadphoneSettingClick = async () => {
    if (isHeadphoneMenuOpen) {
      setIsHeadphoneMenuOpen(false);
      return;
    }

    const result = await handleRefreshHeadphoneOutputs();
    const outputs = Array.isArray(result) ? result : (result?.outputs || []);
    setIsHeadphoneMenuOpen(!result?.output && outputs.length > 0);
  };

  const handleHeadphoneMenuSelect = async (deviceId) => {
    setIsHeadphoneMenuOpen(false);
    await handleSelectHeadphoneOutput(deviceId);
  };

  const handleFullscreenToggle = async () => {
    const fullscreenElement = document.fullscreenElement || document.webkitFullscreenElement;
    const fullscreenEnabled = document.fullscreenEnabled || document.webkitFullscreenEnabled;

    if (!fullscreenEnabled) {
      setStatus('FULLSCREEN UNSUPPORTED');
      return;
    }

    try {
      if (isFullscreen || fullscreenElement) {
        if (fullscreenElement) {
          const exitFullscreen = document.exitFullscreen || document.webkitExitFullscreen;
          await exitFullscreen.call(document);
        }

        setIsFullscreen(false);
        setIsHeadphoneMenuOpen(false);
      } else {
        setIsHeadphoneMenuOpen(false);
        const requestFullscreen = document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen;
        await requestFullscreen.call(document.documentElement, { navigationUI: 'hide' });
        setIsFullscreen(Boolean(document.fullscreenElement || document.webkitFullscreenElement));
      }
    } catch (err) {
      console.error('Fullscreen toggle failed:', err);
      setStatus('FULLSCREEN ERROR');
    }
  };

  const isProblemStatus = status === 'OFFLINE' || status.startsWith('ERROR') || status.includes('UNSUPPORTED');
  const statusBarStyle = isProblemStatus ? {
    color: 'var(--neon-pink)',
    borderColor: 'var(--neon-pink)',
    background: 'rgba(255, 0, 85, 0.12)',
  } : undefined;

  // --- Render ---
  return (
    <div className="app-container">
      <div className={`auto-switch-glow ${autoSwitchGlow ? 'active' : ''}`} aria-hidden="true" />
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
            onLoadToDeck={guardLoad(decks.loadTrackFromLibrary)}
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
              <div className="topbar-brand">
                <a href="https://jiinn-hhhh.github.io/homepage/" target="_blank" rel="noopener noreferrer">
                  <h1 className="pixel-font">Simple DJ</h1>
                </a>
                <div className="status-bar" style={statusBarStyle}>
                  {status}
                </div>
              </div>
              <div className="topbar-actions">
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
                <div className="topbar-headphone-control">
                  <button
                    type="button"
                    onClick={guard(handleHeadphoneSettingClick)}
                    className="topbar-btn topbar-hp-btn pixel-font"
                    title="Choose headphone output device"
                  >
                    HP SETTING
                  </button>
                  {isHeadphoneMenuOpen && (
                    <div className="topbar-hp-menu">
                      {headphoneOutputs.map((output) => (
                        <button
                          key={output.deviceId}
                          type="button"
                          className="topbar-hp-option"
                          onClick={() => guard(handleHeadphoneMenuSelect)(output.deviceId)}
                        >
                          {output.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {recorder.videoStatusMessage && (
                  <div
                    className="status-bar"
                    style={{
                      color: 'var(--neon-pink)',
                      borderColor: 'var(--neon-pink)',
                      background: 'rgba(255, 0, 85, 0.12)',
                    }}
                  >
                    {recorder.videoStatusMessage}
                  </div>
                )}
                <button
                  onClick={handleFullscreenToggle}
                  className={`topbar-btn fullscreen-btn pixel-font ${isFullscreen ? 'active' : ''}`}
                  title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                >
                  {isFullscreen ? 'EXIT' : 'FULL'}
                </button>
                <button onClick={() => setShowHelp(true)} className="topbar-btn help-topbar-btn pixel-font" title="Help & Shortcuts">?</button>
                <button onClick={signOut} className="topbar-btn logout-btn pixel-font">LOGOUT</button>
              </div>
            </div>

            {showHelp && (
              <div className="help-modal-overlay" onClick={() => setShowHelp(false)}>
                <div className="help-modal" onClick={e => e.stopPropagation()}>
                  <div className="help-modal-header">
                    <span className="help-modal-title pixel-font">SHORTCUTS</span>
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
                        <div>HP Only: remove a deck from master output while headphones monitor all decks</div>
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
                playbackRate={getPlaybackRate(decks.trackA, masterBpm, halfTimeByDeck.A)}
                effectiveKey={keyLockA ? decks.trackA?.key : getShiftedKey(decks.trackA?.key, decks.trackA?.bpm, masterBpm, halfTimeByDeck.A)}
                onPlayPause={() => guard(decks.togglePlay)('A')}
                onLoadFromLibrary={guardLoad(decks.loadTrackFromLibrary)}
                onLoadFile={guardLoad(decks.loadTrack)}
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
                visualizerNode={decks.analyserNodeA}
                loadingTrack={decks.loadingFileA}
                hotCues={hotCues.hotCuesA}
                onSetHotCue={(idx) => guard(hotCues.setHotCue)('A', idx, deckBeatBpms.A, decks.trackA)}
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
                onStartLoopRoll={(beats) => guard(loopRoll.startLoopRoll)('A', beats, deckBeatBpms.A, masterBpm)}
                onEndLoopRoll={() => guard(loopRoll.endLoopRoll)('A')}
                onChangeLoopRollSize={(beats) => guard(loopRoll.changeLoopRollSize)('A', beats, deckBeatBpms.A, masterBpm)}
                halfTimeEnabled={halfTimeByDeck.A}
                onToggleHalfTime={(deckId) => {
                  if (!isSystemReady) return;
                  handleToggleHalfTime(deckId);
                }}
                onAutoTransition={(deckId, bars) => {
                  if (!isSystemReady) return;
                  handleAutoTransition(deckId, bars);
                }}
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
                onBpmChange={guard(handleSafeMasterBpmChange)}
                bpmLocked={isAutoTransitioning}
                masterVolume={masterVolume}
                effectVolume={effectVolume}
                headphoneOnlyA={headphoneOnlyA}
                headphoneOnlyB={headphoneOnlyB}
                headphoneVolume={headphoneVolume}
                onMasterVolumeChange={guard(handleMasterVolumeChange)}
                onEffectVolumeChange={guard(handleEffectVolumeChange)}
                onToggleHeadphoneOnly={guard(handleHeadphoneOnlyToggle)}
                onHeadphoneVolumeChange={guard(handleHeadphoneVolumeChange)}
                onMasterEffect={guard(handleMasterEffect)}
                onTriggerSampler={guard(triggerSampler)}
                quantizeEnabled={isQuantizeEnabled}
                onToggleQuantize={() => setIsQuantizeEnabled(prev => !prev)}
              />

              <Deck
                deckId="B"
                track={decks.trackB}
                isPlaying={decks.isPlayingB}
                playbackRate={getPlaybackRate(decks.trackB, masterBpm, halfTimeByDeck.B)}
                effectiveKey={keyLockB ? decks.trackB?.key : getShiftedKey(decks.trackB?.key, decks.trackB?.bpm, masterBpm, halfTimeByDeck.B)}
                onPlayPause={() => guard(decks.togglePlay)('B')}
                onLoadFromLibrary={guardLoad(decks.loadTrackFromLibrary)}
                onLoadFile={guardLoad(decks.loadTrack)}
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
                visualizerNode={decks.analyserNodeB}
                loadingTrack={decks.loadingFileB}
                hotCues={hotCues.hotCuesB}
                onSetHotCue={(idx) => guard(hotCues.setHotCue)('B', idx, deckBeatBpms.B, decks.trackB)}
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
                onStartLoopRoll={(beats) => guard(loopRoll.startLoopRoll)('B', beats, deckBeatBpms.B, masterBpm)}
                onEndLoopRoll={() => guard(loopRoll.endLoopRoll)('B')}
                onChangeLoopRollSize={(beats) => guard(loopRoll.changeLoopRollSize)('B', beats, deckBeatBpms.B, masterBpm)}
                halfTimeEnabled={halfTimeByDeck.B}
                onToggleHalfTime={(deckId) => {
                  if (!isSystemReady) return;
                  handleToggleHalfTime(deckId);
                }}
                onAutoTransition={(deckId, bars) => {
                  if (!isSystemReady) return;
                  handleAutoTransition(deckId, bars);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
