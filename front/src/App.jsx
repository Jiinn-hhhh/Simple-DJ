import { useState, useEffect, useRef, useCallback } from "react";
import AudioPlayer from "./audioPlayer";
import Deck from "./components/Deck";
import Mixer from "./components/Mixer";
import "./App.css";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

// Polling configuration
const POLL_INTERVAL_MS = 2000; // Poll every 2 seconds
const MAX_POLL_ATTEMPTS = 300; // Max 10 minutes (300 * 2s)

function App() {
  console.log("App Component Rendering...");
  const [status, setStatus] = useState("INSERT COIN");
  const [isSystemReady, setIsSystemReady] = useState(false);
  const [hfSpaceUrl, setHfSpaceUrl] = useState("");

  // Track State
  const [trackA, setTrackA] = useState(null);
  const [trackB, setTrackB] = useState(null);

  // Playback State
  const [isPlayingA, setIsPlayingA] = useState(false);
  const [isPlayingB, setIsPlayingB] = useState(false);

  // Mixer State
  const [volumeA, setVolumeA] = useState(1.0);
  const [volumeB, setVolumeB] = useState(1.0);
  const [crossfader, setCrossfader] = useState(0.5);
  const [filterA, setFilterA] = useState(0.5);
  const [filterB, setFilterB] = useState(0.5);
  const [eqA, setEqA] = useState({ high: 100, mid: 100, low: 100 });
  const [eqB, setEqB] = useState({ high: 100, mid: 100, low: 100 });
  const [masterVolume, setMasterVolume] = useState(1.0);

  // Unified BPM State
  const [masterBpm, setMasterBpm] = useState(128);

  // Stem State
  const [stemsA, setStemsA] = useState({ drums: false, bass: false, vocals: false, other: false });
  const [stemsB, setStemsB] = useState({ drums: false, bass: false, vocals: false, other: false });

  // Loading States
  const [isSeparatingA, setIsSeparatingA] = useState(false);
  const [isSeparatingB, setIsSeparatingB] = useState(false);
  const [separationProgressA, setSeparationProgressA] = useState(0);
  const [separationProgressB, setSeparationProgressB] = useState(0);
  const [loadingFileA, setLoadingFileA] = useState(null);
  const [loadingFileB, setLoadingFileB] = useState(null);

  const audioPlayerRef = useRef(new AudioPlayer());

  useEffect(() => {
    // Check backend status and get config
    const initializeSystem = async () => {
      try {
        // Ping backend
        const pingRes = await fetch(`${API_BASE}/ping`);
        if (!pingRes.ok) throw new Error("Backend not responding");

        // Get configuration (includes HF Space URL)
        const configRes = await fetch(`${API_BASE}/config`);
        if (configRes.ok) {
          const config = await configRes.json();
          if (config.hf_space_url) {
            setHfSpaceUrl(config.hf_space_url);
            console.log("[App] HF Space URL:", config.hf_space_url);
          }
        }

        setStatus("SYSTEM READY");
        setIsSystemReady(true);
      } catch (err) {
        console.error("System init error:", err);
        setStatus("OFFLINE");
        setIsSystemReady(false);
      }
    };

    initializeSystem();

    return () => {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.cleanup();
      }
    };
  }, []);

  // Keyboard Controls
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (!isSystemReady) return;

      switch (e.key.toLowerCase()) {
        case 's':
          togglePlay('A');
          break;
        case 'l':
          togglePlay('B');
          break;
        case 'arrowleft':
          setCrossfader(prev => Math.max(0, prev - 0.1));
          break;
        case 'arrowright':
          setCrossfader(prev => Math.min(1, prev + 0.1));
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlayingA, isPlayingB, trackA, trackB, isSystemReady]);


  // === Polling-based Job Status Check ===
  const pollJobStatus = useCallback(async (jobId, baseUrl) => {
    const url = baseUrl ? `${baseUrl}/job/${jobId}` : `${API_BASE}/job/${jobId}`;

    let attempts = 0;

    return new Promise((resolve, reject) => {
      const poll = async () => {
        attempts++;

        if (attempts > MAX_POLL_ATTEMPTS) {
          reject(new Error("Separation timed out. Please try again."));
          return;
        }

        try {
          const res = await fetch(url);
          if (!res.ok) {
            if (res.status === 404) {
              reject(new Error("Job not found"));
              return;
            }
            throw new Error(`Status check failed: ${res.status}`);
          }

          const data = await res.json();

          if (data.status === "completed") {
            resolve(data);
            return;
          }

          if (data.status === "failed") {
            reject(new Error(data.error || "Separation failed"));
            return;
          }

          // Still processing - continue polling
          setTimeout(poll, POLL_INTERVAL_MS);

        } catch (err) {
          // Network error - retry a few times
          if (attempts < 3) {
            setTimeout(poll, POLL_INTERVAL_MS * 2);
          } else {
            reject(err);
          }
        }
      };

      poll();
    });
  }, []);


  // === Audio Logic ===
  const loadTrack = async (deckId, file) => {
    if (!isSystemReady) {
      console.warn("System not ready, ignoring track load");
      return;
    }

    setStatus(`LOADING ${file.name.toUpperCase()}...`);
    if (deckId === 'A') setLoadingFileA(file.name);
    else setLoadingFileB(file.name);

    try {
      // Analyze on server
      setStatus(`ANALYZING...`);
      const formData = new FormData();
      formData.append("file", file);
      const analyzeRes = await fetch(`${API_BASE}/analyze`, { method: "POST", body: formData });

      if (!analyzeRes.ok) {
        let errorMessage = "Analysis failed";
        try {
          const errorData = await analyzeRes.json();
          errorMessage = errorData.detail || errorData.error || errorMessage;
        } catch (e) {
          errorMessage = `Analysis failed with status ${analyzeRes.status}`;
        }
        throw new Error(errorMessage);
      }

      const analysisData = await analyzeRes.json();

      if (!analysisData || typeof analysisData.bpm !== 'number' || !analysisData.key) {
        throw new Error("Invalid analysis response: missing required fields");
      }

      const trackData = {
        id: "local_" + Date.now(),
        file: file,
        filename: file.name,
        bpm: analysisData.bpm || 128,
        key: analysisData.key || "C major",
        duration: analysisData.duration || 0,
        separated: false,
        stems: {}
      };

      if (deckId === 'A') {
        setTrackA(trackData);
        setStemsA({ drums: false, bass: false, vocals: false, other: false });

        const objectUrl = URL.createObjectURL(file);
        await audioPlayerRef.current.loadAudio('A', 'full', objectUrl);

        const targetBpm = analysisData.bpm || masterBpm;
        if (analysisData.bpm) {
          setMasterBpm(targetBpm);
          audioPlayerRef.current.setPlaybackRate('A', targetBpm / analysisData.bpm);
          if (trackB && trackB.bpm) {
            audioPlayerRef.current.setPlaybackRate('B', targetBpm / trackB.bpm);
          }
        }

        setStatus("SEPARATING...");
        console.log("[loadTrack] Starting separation for deck A");
        await separateTrack('A', file, trackData, targetBpm);
        console.log("[loadTrack] Separation completed for deck A");
      } else {
        setTrackB(trackData);
        setStemsB({ drums: false, bass: false, vocals: false, other: false });

        const objectUrl = URL.createObjectURL(file);
        await audioPlayerRef.current.loadAudio('B', 'full', objectUrl);

        const targetBpm = analysisData.bpm || masterBpm;
        if (analysisData.bpm) {
          setMasterBpm(targetBpm);
          audioPlayerRef.current.setPlaybackRate('B', targetBpm / analysisData.bpm);
          if (trackA && trackA.bpm) {
            audioPlayerRef.current.setPlaybackRate('A', targetBpm / trackA.bpm);
          }
        }

        setStatus("SEPARATING...");
        console.log("[loadTrack] Starting separation for deck B");
        await separateTrack('B', file, trackData, targetBpm);
        console.log("[loadTrack] Separation completed for deck B");
      }

    } catch (err) {
      console.error(err);
      setStatus("ERROR: " + err.message);
    } finally {
      if (deckId === 'A') setLoadingFileA(null);
      else setLoadingFileB(null);
    }
  };

  const separateTrack = async (deckId, file, trackData, bpmToUse) => {
    console.log(`[separateTrack] Starting separation for deck ${deckId}`);
    const setIsSeparating = deckId === 'A' ? setIsSeparatingA : setIsSeparatingB;
    const setSeparationProgress = deckId === 'A' ? setSeparationProgressA : setSeparationProgressB;
    const setTrack = deckId === 'A' ? setTrackA : setTrackB;

    setIsSeparating(true);
    setSeparationProgress(0);

    try {
      // Start separation job
      const formData = new FormData();
      formData.append("file", file);

      console.log(`[separateTrack] Sending separation request for deck ${deckId}`);
      const res = await fetch(`${API_BASE}/separate`, { method: "POST", body: formData });

      if (!res.ok) {
        let errorText = "Separation failed";
        try {
          const errorJson = await res.json();
          errorText = errorJson.detail || errorJson.error || errorText;
        } catch (e) {
          try {
            errorText = await res.text();
          } catch (ignore) { }
        }
        console.error(`[separateTrack] Separation request failed: ${res.status} - ${errorText}`);
        throw new Error(errorText);
      }

      const data = await res.json();

      if (data.error) {
        throw new Error(data.error);
      }

      const jobId = data.job_id;
      const pollUrl = data.hf_space_url || hfSpaceUrl || null;

      console.log(`[separateTrack] Job started: ${jobId}, polling from: ${pollUrl || API_BASE}`);
      setStatus(`SEPARATING... (Job: ${jobId.slice(0, 8)})`);
      setSeparationProgress(10);

      // Poll for completion
      const progressInterval = setInterval(() => {
        setSeparationProgress(prev => Math.min(prev + 5, 90));
      }, 3000);

      let jobResult;
      try {
        jobResult = await pollJobStatus(jobId, pollUrl);
      } finally {
        clearInterval(progressInterval);
      }

      setSeparationProgress(95);
      console.log(`[separateTrack] Job completed, loading stems`);

      // Load stems
      audioPlayerRef.current.audioBuffers[deckId] = {};

      const stemNames = Object.keys(jobResult.stems || {});
      console.log(`[separateTrack] Loading ${stemNames.length} stems for deck ${deckId}:`, stemNames);

      const loadPromises = stemNames.map(async (stemName) => {
        const stemInfo = jobResult.stems[stemName];
        const url = stemInfo.download_url;
        console.log(`[separateTrack] Loading stem ${stemName} from ${url}`);
        await audioPlayerRef.current.loadAudio(deckId, stemName, url);

        if (trackData.bpm) {
          audioPlayerRef.current.setPlaybackRate(deckId, bpmToUse / trackData.bpm);
        }
        console.log(`[separateTrack] Stem ${stemName} loaded successfully`);
      });

      await Promise.all(loadPromises);
      console.log(`[separateTrack] All stems loaded for deck ${deckId}`);

      setSeparationProgress(100);

      // Default Stems to OFF
      const defaultStems = { drums: false, bass: false, vocals: false, other: false };
      const setStems = deckId === 'A' ? setStemsA : setStemsB;
      setStems(defaultStems);

      Object.keys(defaultStems).forEach(stemName => {
        audioPlayerRef.current.muteStem(deckId, stemName, true);
      });

      setTrack(prev => ({
        ...prev,
        separated: true,
        jobId: jobId
      }));

      setStatus("READY");

    } catch (err) {
      setStatus("ERROR: " + err.message);
      console.error("Separation error:", err);
    } finally {
      setIsSeparating(false);
      setSeparationProgress(0);
    }
  };

  const togglePlay = async (deckId) => {
    if (!isSystemReady) {
      console.warn("System not ready, ignoring play/pause");
      return;
    }

    const isPlaying = deckId === 'A' ? isPlayingA : isPlayingB;
    const setPlaying = deckId === 'A' ? setIsPlayingA : setIsPlayingB;
    const track = deckId === 'A' ? trackA : trackB;

    if (isPlaying) {
      audioPlayerRef.current.stop(deckId);
      setPlaying(false);
    } else {
      if (track && track.bpm) {
        audioPlayerRef.current.setPlaybackRate(deckId, masterBpm / track.bpm);
      }
      await audioPlayerRef.current.play(deckId);
      setPlaying(true);
    }
  };

  const toggleStem = (deckId, stemName) => {
    if (!isSystemReady) return;

    const stems = deckId === 'A' ? stemsA : stemsB;
    const setStems = deckId === 'A' ? setStemsA : setStemsB;

    const newStems = { ...stems, [stemName]: !stems[stemName] };
    setStems(newStems);

    audioPlayerRef.current.muteStem(deckId, stemName, !newStems[stemName]);
  };

  const handleVolumeChange = (deckId, val) => {
    if (!isSystemReady) return;

    if (deckId === 'A') setVolumeA(val);
    else setVolumeB(val);

    updateVolumes(deckId === 'A' ? val : volumeA, deckId === 'B' ? val : volumeB, crossfader, masterVolume);
  };

  const handleCrossfaderChange = (val) => {
    if (!isSystemReady) return;

    setCrossfader(val);
    updateVolumes(volumeA, volumeB, val, masterVolume);
  };

  const handleMasterVolumeChange = (val) => {
    if (!isSystemReady) return;

    setMasterVolume(val);
    updateVolumes(volumeA, volumeB, crossfader, val);
  };

  const updateVolumes = (volA, volB, xf, masterVol = 1.0) => {
    let gainA = volA * masterVol;
    let gainB = volB * masterVol;

    if (xf < 0.5) {
      gainB *= (xf * 2);
    } else {
      gainA *= ((1 - xf) * 2);
    }

    audioPlayerRef.current.setVolume('A', gainA);
    audioPlayerRef.current.setVolume('B', gainB);
  };

  const handleEqChange = (deckId, band, val) => {
    if (!isSystemReady) return;

    const gain = val / 100;

    if (deckId === 'A') {
      setEqA(prev => ({ ...prev, [band]: val }));
    } else {
      setEqB(prev => ({ ...prev, [band]: val }));
    }
    audioPlayerRef.current.setEq(deckId, band, gain);
  };

  const handleFilterChange = (deckId, val) => {
    if (!isSystemReady) return;

    if (deckId === 'A') setFilterA(val);
    else setFilterB(val);

    audioPlayerRef.current.setFilter(deckId, val);
  };

  const handleMasterBpmChange = (val) => {
    if (!isSystemReady) return;

    setMasterBpm(val);

    if (trackA && trackA.bpm) {
      audioPlayerRef.current.setPlaybackRate('A', val / trackA.bpm);
    }
    if (trackB && trackB.bpm) {
      audioPlayerRef.current.setPlaybackRate('B', val / trackB.bpm);
    }
  };

  const handleLoopIn = (deckId) => {
    if (!isSystemReady) return;

    const track = deckId === 'A' ? trackA : trackB;
    if (track && track.bpm) {
      audioPlayerRef.current.setLoopIn(deckId, track.bpm);
    }
  };

  const handleLoopOut = (deckId) => {
    if (!isSystemReady) return;

    const track = deckId === 'A' ? trackA : trackB;
    if (track && track.bpm) {
      audioPlayerRef.current.setLoopOut(deckId, track.bpm);
    }
  };

  const handleExitLoop = (deckId) => {
    if (!isSystemReady) return;

    audioPlayerRef.current.exitLoop(deckId);
  };

  const handleSeek = (deckId, percent) => {
    if (!isSystemReady) return;

    audioPlayerRef.current.seek(deckId, percent);
  };

  const getPlaybackRate = (track) => {
    if (!track || !track.bpm) return 0;
    return masterBpm / track.bpm;
  };

  const handleMasterEffect = (x, y) => {
    if (!isSystemReady) return;

    audioPlayerRef.current.setMasterEffect(x, y);
  };

  const triggerSampler = (type) => {
    if (!isSystemReady) return;

    if (type === 'airhorn') audioPlayerRef.current.playAirHorn();
    if (type === 'siren') audioPlayerRef.current.playSiren();
  };

  return (
    <div className="app-container">
      {/* Loading Overlay */}
      {!isSystemReady && (
        <div className="loading-overlay">
          <div
            className="pixel-font"
            style={{
              fontSize: '1.5rem',
              color: status === 'OFFLINE' ? 'var(--neon-pink)' : 'var(--neon-green)',
              textAlign: 'center',
              marginBottom: '20px',
              textShadow: `0 0 10px ${status === 'OFFLINE' ? 'rgba(255, 0, 85, 0.8)' : 'rgba(0, 255, 157, 0.8)'}`
            }}
          >
            {status}
          </div>
          <div
            style={{
              fontSize: '0.9rem',
              color: 'var(--text-dim)',
              fontFamily: 'Rajdhani, sans-serif'
            }}
          >
            {status === 'OFFLINE'
              ? 'Backend server is offline. Please check your connection.'
              : 'Initializing system...'}
          </div>
        </div>
      )}

      <div className="top-bar">
        <h1 className="pixel-font">Simple DJ</h1>
        <div className="status-bar pixel-font">{status}</div>
      </div>

      <div className="console-layout" style={{ opacity: isSystemReady ? 1 : 0.3, pointerEvents: isSystemReady ? 'auto' : 'none' }}>
        <Deck
          deckId="A"
          track={trackA}
          isPlaying={isPlayingA}
          playbackRate={getPlaybackRate(trackA)}
          effectiveKey={getShiftedKey(trackA?.key, trackA?.bpm, masterBpm)}
          onPlayPause={() => togglePlay('A')}
          onLoadTrack={(file) => loadTrack('A', file)}
          volume={volumeA}
          onVolumeChange={(val) => handleVolumeChange('A', val)}
          filter={filterA}
          onFilterChange={(val) => handleFilterChange('A', val)}
          activeStems={stemsA}
          onToggleStem={(stem) => toggleStem('A', stem)}
          isSeparating={isSeparatingA}
          separationProgress={separationProgressA}
          onLoopIn={() => handleLoopIn('A')}
          onLoopOut={() => handleLoopOut('A')}
          onExitLoop={() => handleExitLoop('A')}
          onSeek={(p) => handleSeek('A', p)}
          visualizerNode={audioPlayerRef.current.getAnalyser('A')}
          loadingTrack={loadingFileA}
        />

        <Mixer
          crossfader={crossfader}
          onCrossfaderChange={handleCrossfaderChange}
          volumeA={volumeA}
          onVolumeAChange={(val) => handleVolumeChange('A', val)}
          volumeB={volumeB}
          onVolumeBChange={(val) => handleVolumeChange('B', val)}
          filterA={filterA}
          onFilterAChange={(val) => handleFilterChange('A', val)}
          filterB={filterB}
          onFilterBChange={(val) => handleFilterChange('B', val)}
          eqA={eqA}
          eqB={eqB}
          onEqChange={handleEqChange}
          masterBpm={masterBpm}
          onBpmChange={handleMasterBpmChange}
          masterVolume={masterVolume}
          onMasterVolumeChange={handleMasterVolumeChange}
          onMasterEffect={handleMasterEffect}
          onTriggerSampler={triggerSampler}
        />

        <Deck
          deckId="B"
          track={trackB}
          isPlaying={isPlayingB}
          playbackRate={getPlaybackRate(trackB)}
          effectiveKey={getShiftedKey(trackB?.key, trackB?.bpm, masterBpm)}
          onPlayPause={() => togglePlay('B')}
          onLoadTrack={(file) => loadTrack('B', file)}
          volume={volumeB}
          onVolumeChange={(val) => handleVolumeChange('B', val)}
          filter={filterB}
          onFilterChange={(val) => handleFilterChange('B', val)}
          activeStems={stemsB}
          onToggleStem={(stem) => toggleStem('B', stem)}
          isSeparating={isSeparatingB}
          separationProgress={separationProgressB}
          onLoopIn={() => handleLoopIn('B')}
          onLoopOut={() => handleLoopOut('B')}
          onExitLoop={() => handleExitLoop('B')}
          onSeek={(p) => handleSeek('B', p)}
          visualizerNode={audioPlayerRef.current.getAnalyser('B')}
          loadingTrack={loadingFileB}
        />
      </div>
    </div>
  );
}

// Helper: Calculate Shifted Key
function getShiftedKey(originalKey, originalBpm, masterBpm) {
  if (!originalKey || !originalBpm || !masterBpm) return null;

  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  let root = originalKey.split(' ')[0];
  let minor = originalKey.includes('m') && !root.includes('m');

  if (root.length > 1 && root[1] === 'm') root = root[0];

  let rootIndex = NOTE_NAMES.indexOf(root);
  if (rootIndex === -1) return originalKey;

  const rate = masterBpm / originalBpm;
  const semitoneShift = 12 * Math.log2(rate);

  const shiftInt = Math.round(semitoneShift);

  let newIndex = (rootIndex + shiftInt) % 12;
  if (newIndex < 0) newIndex += 12;

  const newRoot = NOTE_NAMES[newIndex];
  const suffix = originalKey.includes('Major') || originalKey.includes('Maj') ? ' Maj' : (originalKey.includes('m') || originalKey.includes('Minor') ? 'm' : '');

  return `${newRoot}${suffix} (${shiftInt > 0 ? '+' : ''}${shiftInt})`;
}

export default App;
