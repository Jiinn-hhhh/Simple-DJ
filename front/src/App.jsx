import { useState, useEffect, useRef } from "react";
import AudioPlayer from "./audioPlayer";
import Deck from "./components/Deck";
import Mixer from "./components/Mixer";
import "./App.css";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

function App() {
  console.log("App Component Rendering...");
  const [status, setStatus] = useState("INSERT COIN");

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
  const [loadingFileA, setLoadingFileA] = useState(null);
  const [loadingFileB, setLoadingFileB] = useState(null);

  const audioPlayerRef = useRef(new AudioPlayer());

  useEffect(() => {
    // Check backend status
    fetch(`${API_BASE}/ping`)
      .then(res => res.json())
      .then(data => setStatus("SYSTEM READY"))
      .catch(err => setStatus("OFFLINE"));

    return () => {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.cleanup();
      }
    };
  }, []);

  // Keyboard Controls
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if typing in an input
      if (e.target.tagName === 'INPUT') return;

      switch (e.key.toLowerCase()) {
        case 's': // Deck A Play/Pause
          togglePlay('A');
          break;
        case 'l': // Deck B Play/Pause
          togglePlay('B');
          break;
        case 'arrowleft': // Crossfader Left
          setCrossfader(prev => Math.max(0, prev - 0.1));
          break;
        case 'arrowright': // Crossfader Right
          setCrossfader(prev => Math.min(1, prev + 0.1));
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlayingA, isPlayingB, trackA, trackB]); // Dependencies for togglePlay closure


  // --- Audio Logic ---

  const loadTrack = async (deckId, file) => {
    setStatus(`LOADING ${file.name.toUpperCase()}...`);
    if (deckId === 'A') setLoadingFileA(file.name);
    else setLoadingFileB(file.name);

    try {
      // Analyze on server (Hugging Face Spaces has 32GB RAM)
      setStatus(`ANALYZING...`);
      const formData = new FormData();
      formData.append("file", file);
      const analyzeRes = await fetch(`${API_BASE}/analyze`, { method: "POST", body: formData });
      
      if (!analyzeRes.ok) {
        let errorMessage = "Analysis failed";
        try {
          const errorData = await analyzeRes.json();
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          errorMessage = `Analysis failed with status ${analyzeRes.status}`;
        }
        throw new Error(errorMessage);
      }
      
      const analysisData = await analyzeRes.json();
      
      // Validate response data
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
        setStemsA({ drums: false, bass: false, vocals: false, other: false }); // Reset stems immediately
        // STRICT MASTER SYNC: New track must conform to current masterBpm immediately
        const objectUrl = URL.createObjectURL(file);
        await audioPlayerRef.current.loadAudio('A', 'full', objectUrl);

        const targetBpm = analysisData.bpm || masterBpm;
        if (analysisData.bpm) {
          setMasterBpm(targetBpm);
          // Update self
          audioPlayerRef.current.setPlaybackRate('A', targetBpm / analysisData.bpm);
          // Update other deck (B) if it exists so it stays in sync
          if (trackB && trackB.bpm) {
            audioPlayerRef.current.setPlaybackRate('B', targetBpm / trackB.bpm);
          }
        }

        // Start separation immediately after analysis
        setStatus("SEPARATING...");
        await separateTrack('A', file, trackData, targetBpm);
      } else {
        setTrackB(trackData);
        setStemsB({ drums: false, bass: false, vocals: false, other: false }); // Reset stems immediately
        // STRICT MASTER SYNC: New track must conform to current masterBpm immediately
        const objectUrl = URL.createObjectURL(file);
        await audioPlayerRef.current.loadAudio('B', 'full', objectUrl);

        const targetBpm = analysisData.bpm || masterBpm;
        if (analysisData.bpm) {
          setMasterBpm(targetBpm);
          // Update self
          audioPlayerRef.current.setPlaybackRate('B', targetBpm / analysisData.bpm);
          // Update other deck (A) if it exists so it stays in sync
          if (trackA && trackA.bpm) {
            audioPlayerRef.current.setPlaybackRate('A', targetBpm / trackA.bpm);
          }
        }

        // Start separation immediately after analysis
        setStatus("SEPARATING...");
        await separateTrack('B', file, trackData, targetBpm);
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
    const setIsSeparating = deckId === 'A' ? setIsSeparatingA : setIsSeparatingB;
    const setTrack = deckId === 'A' ? setTrackA : setTrackB;

    setIsSeparating(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`${API_BASE}/separate`, { method: "POST", body: formData });
      if (!res.ok) throw new Error("Separation failed");

      const data = await res.json();
      const jobId = data.job_id;

      audioPlayerRef.current.audioBuffers[deckId] = {};

      const loadPromises = Object.keys(data.sources).map(async (stemName) => {
        const url = `${API_BASE}/stems/${jobId}/${stemName}`;
        await audioPlayerRef.current.loadAudio(deckId, stemName, url);
        // Ensure stems also get the rate
        if (trackData.bpm) {
          // Re-apply rate just in case loadAudio resets it (depends on audioPlayer implementation)
          // Use bpmToUse to avoid stale closure state of masterBpm
          audioPlayerRef.current.setPlaybackRate(deckId, bpmToUse / trackData.bpm);
        }
      });

      await Promise.all(loadPromises);

      // Default Stems to OFF (User Request)
      const defaultStems = { drums: false, bass: false, vocals: false, other: false };
      const setStems = deckId === 'A' ? setStemsA : setStemsB;
      setStems(defaultStems);

      // Apply Mute to AudioPlayer
      Object.keys(defaultStems).forEach(stemName => {
        audioPlayerRef.current.muteStem(deckId, stemName, true);
      });

      setTrack(prev => ({
        ...prev,
        separated: true,
        jobId: jobId
      }));

      // Update status when separation completes
      setStatus("READY");

    } catch (err) {
      setStatus("ERROR: Separation failed");
      console.error("Separation error:", err);
    } finally {
      setIsSeparating(false);
    }
  };

  const togglePlay = async (deckId) => {
    const isPlaying = deckId === 'A' ? isPlayingA : isPlayingB;
    const setPlaying = deckId === 'A' ? setIsPlayingA : setIsPlayingB;
    const track = deckId === 'A' ? trackA : trackB;

    if (isPlaying) {
      audioPlayerRef.current.stop(deckId);
      setPlaying(false);
    } else {
      if (track && track.bpm) {
        // Enforce Sync on Play
        audioPlayerRef.current.setPlaybackRate(deckId, masterBpm / track.bpm);
      }
      await audioPlayerRef.current.play(deckId);
      setPlaying(true);
    }
  };

  const toggleStem = (deckId, stemName) => {
    const stems = deckId === 'A' ? stemsA : stemsB;
    const setStems = deckId === 'A' ? setStemsA : setStemsB;

    const newStems = { ...stems, [stemName]: !stems[stemName] };
    setStems(newStems);

    audioPlayerRef.current.muteStem(deckId, stemName, !newStems[stemName]);
  };

  const handleVolumeChange = (deckId, val) => {
    if (deckId === 'A') setVolumeA(val);
    else setVolumeB(val);

    updateVolumes(deckId === 'A' ? val : volumeA, deckId === 'B' ? val : volumeB, crossfader, masterVolume);
  };

  const handleCrossfaderChange = (val) => {
    setCrossfader(val);
    updateVolumes(volumeA, volumeB, val, masterVolume);
  };

  const handleMasterVolumeChange = (val) => {
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
    const gain = val / 100;

    if (deckId === 'A') {
      setEqA(prev => ({ ...prev, [band]: val }));
    } else {
      setEqB(prev => ({ ...prev, [band]: val }));
    }
    audioPlayerRef.current.setEq(deckId, band, gain);
  };

  const handleFilterChange = (deckId, val) => {
    if (deckId === 'A') setFilterA(val);
    else setFilterB(val);

    audioPlayerRef.current.setFilter(deckId, val);
  };

  const handleMasterBpmChange = (val) => {
    setMasterBpm(val);

    if (trackA && trackA.bpm) {
      audioPlayerRef.current.setPlaybackRate('A', val / trackA.bpm);
    }
    if (trackB && trackB.bpm) {
      audioPlayerRef.current.setPlaybackRate('B', val / trackB.bpm);
    }
  };

  const handleLoopIn = (deckId) => {
    const track = deckId === 'A' ? trackA : trackB;
    if (track && track.bpm) {
      audioPlayerRef.current.setLoopIn(deckId, track.bpm);
    }
  };

  const handleLoopOut = (deckId) => {
    const track = deckId === 'A' ? trackA : trackB;
    if (track && track.bpm) {
      audioPlayerRef.current.setLoopOut(deckId, track.bpm);
    }
  };

  const handleExitLoop = (deckId) => {
    audioPlayerRef.current.exitLoop(deckId);
  };

  const handleSeek = (deckId, percent) => {
    audioPlayerRef.current.seek(deckId, percent);
  };

  // Calculate generic playback rate for visuals
  const getPlaybackRate = (track) => {
    if (!track || !track.bpm) return 0;
    return masterBpm / track.bpm;
  };

  const handleMasterEffect = (x, y) => {
    // console.log("XY", x, y);
    audioPlayerRef.current.setMasterEffect(x, y);
  };

  const triggerSampler = (type) => {
    if (type === 'airhorn') audioPlayerRef.current.playAirHorn();
    if (type === 'siren') audioPlayerRef.current.playSiren();
  };

  return (
    <div className="app-container">
      <div className="top-bar">
        <h1 className="pixel-font">Simple DJ</h1>
        <div className="status-bar pixel-font">{status}</div>
      </div>

      <div className="console-layout">
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

  // Normalize key (e.g. "Am" -> "A", "C Major" -> "C")
  // Assuming analysis returns standard format
  // Simple parser: take first 1-2 chars that match note
  let root = originalKey.split(' ')[0];
  let minor = originalKey.includes('m') && !root.includes('m'); // rough check

  // Clean root
  if (root.length > 1 && root[1] === 'm') root = root[0]; // "Am" -> "A"

  let rootIndex = NOTE_NAMES.indexOf(root);
  if (rootIndex === -1) return originalKey; // Fallback

  // Calculate semitone shift from speed change
  // rate = master / original
  // semitones = 12 * log2(rate)
  const rate = masterBpm / originalBpm;
  const semitoneShift = 12 * Math.log2(rate);

  // Round to nearest semitone
  const shiftInt = Math.round(semitoneShift);

  let newIndex = (rootIndex + shiftInt) % 12;
  if (newIndex < 0) newIndex += 12;

  const newRoot = NOTE_NAMES[newIndex];
  // Retain minor/major suffix from original if detected (or just pass root)
  // Let's assume originalKey string is returned if we can't parse perfectly, 
  // but here we construct new one.
  const suffix = originalKey.includes('Major') || originalKey.includes('Maj') ? ' Maj' : (originalKey.includes('m') || originalKey.includes('Minor') ? 'm' : '');

  return `${newRoot}${suffix} (${shiftInt > 0 ? '+' : ''}${shiftInt})`;
}

export default App;
