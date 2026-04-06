// hooks/useDecks.js — Dual deck state, track loading, separation, playback

import { useState, useCallback } from 'react';
import { analyzeTrack, startSeparation, pollJobStatus } from '../lib/api';

const STEMS_OFF = { drums: false, bass: false, vocals: false, other: false };
const STEMS_ON = { drums: true, bass: true, vocals: true, other: true };

export default function useDecks(audioPlayerRef, masterBpm, setMasterBpm, hfSpaceUrl, setStatus, getStemUrls) {
  const [trackA, setTrackA] = useState(null);
  const [trackB, setTrackB] = useState(null);
  const [isPlayingA, setIsPlayingA] = useState(false);
  const [isPlayingB, setIsPlayingB] = useState(false);
  const [stemsA, setStemsA] = useState(STEMS_OFF);
  const [stemsB, setStemsB] = useState(STEMS_OFF);
  const [isSeparatingA, setIsSeparatingA] = useState(false);
  const [isSeparatingB, setIsSeparatingB] = useState(false);
  const [separationProgressA, setSeparationProgressA] = useState(0);
  const [separationProgressB, setSeparationProgressB] = useState(0);
  const [loadingFileA, setLoadingFileA] = useState(null);
  const [loadingFileB, setLoadingFileB] = useState(null);

  // --- helpers to pick A/B setters ---
  const deckState = useCallback((deckId) => ({
    track: deckId === 'A' ? trackA : trackB,
    otherTrack: deckId === 'A' ? trackB : trackA,
    setTrack: deckId === 'A' ? setTrackA : setTrackB,
    setStems: deckId === 'A' ? setStemsA : setStemsB,
    setPlaying: deckId === 'A' ? setIsPlayingA : setIsPlayingB,
    isPlaying: deckId === 'A' ? isPlayingA : isPlayingB,
    stems: deckId === 'A' ? stemsA : stemsB,
    setIsSeparating: deckId === 'A' ? setIsSeparatingA : setIsSeparatingB,
    setSeparationProgress: deckId === 'A' ? setSeparationProgressA : setSeparationProgressB,
    setLoadingFile: deckId === 'A' ? setLoadingFileA : setLoadingFileB,
  }), [trackA, trackB, isPlayingA, isPlayingB, stemsA, stemsB]);

  // --- Sync BPM across both decks ---
  const syncBpm = useCallback((targetBpm, deckId, trackBpm) => {
    setMasterBpm(targetBpm);
    const ap = audioPlayerRef.current;
    ap.setPlaybackRate(deckId, targetBpm / trackBpm);
    const other = deckId === 'A' ? trackB : trackA;
    if (other?.bpm) {
      ap.setPlaybackRate(deckId === 'A' ? 'B' : 'A', targetBpm / other.bpm);
    }
  }, [audioPlayerRef, trackA, trackB, setMasterBpm]);

  // --- Load track from file (analyze → play → separate) ---
  const loadTrack = useCallback(async (deckId, file) => {
    const ds = deckState(deckId);
    setStatus(`LOADING ${file.name.toUpperCase()}...`);
    ds.setLoadingFile(file.name);

    try {
      setStatus('ANALYZING...');
      const analysis = await analyzeTrack(file);

      const trackData = {
        id: 'local_' + Date.now(),
        file, filename: file.name,
        bpm: analysis.bpm || 128,
        key: analysis.key || 'C major',
        duration: analysis.duration || 0,
        separated: false, stems: {},
      };

      ds.setTrack(trackData);
      ds.setStems(STEMS_OFF);

      const objectUrl = URL.createObjectURL(file);
      await audioPlayerRef.current.loadAudio(deckId, 'full', objectUrl);

      if (analysis.bpm) syncBpm(analysis.bpm, deckId, analysis.bpm);

      setStatus('SEPARATING...');
      await separateTrack(deckId, file, trackData, analysis.bpm || masterBpm);
    } catch (err) {
      console.error(err);
      setStatus('ERROR: ' + err.message);
    } finally {
      ds.setLoadingFile(null);
    }
  }, [deckState, audioPlayerRef, masterBpm, syncBpm, setStatus]);

  // --- Separate track into stems ---
  const separateTrack = useCallback(async (deckId, file, trackData, bpmToUse) => {
    const ds = deckState(deckId);
    ds.setIsSeparating(true);
    ds.setSeparationProgress(0);

    try {
      const data = await startSeparation(file);
      const jobId = data.job_id;
      const pollUrl = data.hf_space_url || hfSpaceUrl || null;

      setStatus(`SEPARATING... (Job: ${jobId.slice(0, 8)})`);
      ds.setSeparationProgress(10);

      const progressInterval = setInterval(() => {
        ds.setSeparationProgress(prev => Math.min(prev + 5, 90));
      }, 3000);

      let jobResult;
      try {
        jobResult = await pollJobStatus(jobId, pollUrl);
      } finally {
        clearInterval(progressInterval);
      }

      ds.setSeparationProgress(95);

      // Load stems
      const ap = audioPlayerRef.current;
      ap.audioBuffers[deckId] = {};

      const stemNames = Object.keys(jobResult.stems || {});
      await Promise.all(stemNames.map(async (stemName) => {
        let url = jobResult.stems[stemName].download_url;
        if (url.startsWith('/')) {
          url = `${pollUrl || hfSpaceUrl || jobResult.hf_space_url}${url}`;
        }
        await ap.loadAudio(deckId, stemName, url);
        if (trackData.bpm) ap.setPlaybackRate(deckId, bpmToUse / trackData.bpm);
      }));

      ds.setSeparationProgress(100);
      ds.setStems(STEMS_OFF);
      stemNames.forEach(s => ap.muteStem(deckId, s, true));
      ds.setTrack(prev => ({ ...prev, separated: true, jobId }));
      setStatus('READY');
    } catch (err) {
      setStatus('ERROR: ' + err.message);
      console.error('Separation error:', err);
    } finally {
      ds.setIsSeparating(false);
      ds.setSeparationProgress(0);
    }
  }, [deckState, audioPlayerRef, hfSpaceUrl, setStatus]);

  // --- Load from library (pre-processed stems) ---
  const loadTrackFromLibrary = useCallback(async (deckId, libraryTrack) => {
    setStatus(`LOADING ${libraryTrack.title.toUpperCase()}...`);
    try {
      const stemUrls = await getStemUrls(libraryTrack);
      if (!stemUrls) throw new Error('Failed to get stem URLs');

      const ds = deckState(deckId);
      ds.setTrack({
        id: libraryTrack.id,
        filename: libraryTrack.original_filename,
        bpm: libraryTrack.bpm || 128,
        key: libraryTrack.key || 'C major',
        duration: libraryTrack.duration || 0,
        separated: true, stems: stemUrls,
      });

      const ap = audioPlayerRef.current;
      ap.audioBuffers[deckId] = {};
      const stemNames = Object.keys(stemUrls);
      await Promise.all(stemNames.map(s => ap.loadAudio(deckId, s, stemUrls[s])));

      if (libraryTrack.bpm) syncBpm(libraryTrack.bpm, deckId, libraryTrack.bpm);

      ds.setStems(STEMS_ON);
      stemNames.forEach(s => ap.muteStem(deckId, s, false));
      setStatus('READY');
    } catch (err) {
      console.error('Library load error:', err);
      setStatus('ERROR: ' + err.message);
    }
  }, [deckState, audioPlayerRef, syncBpm, getStemUrls, setStatus]);

  // --- Playback ---
  const togglePlay = useCallback(async (deckId) => {
    const ds = deckState(deckId);
    if (ds.isPlaying) {
      audioPlayerRef.current.stop(deckId);
      ds.setPlaying(false);
    } else {
      if (ds.track?.bpm) audioPlayerRef.current.setPlaybackRate(deckId, masterBpm / ds.track.bpm);
      await audioPlayerRef.current.play(deckId);
      ds.setPlaying(true);
    }
  }, [deckState, audioPlayerRef, masterBpm]);

  // --- Stems ---
  const toggleStem = useCallback((deckId, stemName) => {
    const ds = deckState(deckId);
    const newVal = !ds.stems[stemName];
    ds.setStems(prev => ({ ...prev, [stemName]: newVal }));
    audioPlayerRef.current.muteStem(deckId, stemName, !newVal);
  }, [deckState, audioPlayerRef]);

  // --- Loop ---
  const handleLoopIn = useCallback((deckId) => {
    const t = deckId === 'A' ? trackA : trackB;
    if (t?.bpm) audioPlayerRef.current.setLoopIn(deckId, t.bpm);
  }, [trackA, trackB, audioPlayerRef]);

  const handleLoopOut = useCallback((deckId) => {
    const t = deckId === 'A' ? trackA : trackB;
    if (t?.bpm) audioPlayerRef.current.setLoopOut(deckId, t.bpm);
  }, [trackA, trackB, audioPlayerRef]);

  const handleExitLoop = useCallback((deckId) => {
    audioPlayerRef.current.exitLoop(deckId);
  }, [audioPlayerRef]);

  // --- Seek ---
  const handleSeek = useCallback((deckId, percent) => {
    audioPlayerRef.current.seek(deckId, percent);
  }, [audioPlayerRef]);

  return {
    trackA, trackB, isPlayingA, isPlayingB,
    stemsA, stemsB,
    isSeparatingA, isSeparatingB,
    separationProgressA, separationProgressB,
    loadingFileA, loadingFileB,
    loadTrack, loadTrackFromLibrary,
    togglePlay, toggleStem,
    handleLoopIn, handleLoopOut, handleExitLoop, handleSeek,
  };
}
