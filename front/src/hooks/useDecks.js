// hooks/useDecks.js — Dual deck state, track loading, separation, playback

import { useState, useCallback, useEffect } from 'react';
import { analyzeTrack, startSeparation, pollJobStatus } from '../lib/api';
import { analyzeWaveform } from '../lib/waveformAnalyzer';

const STEMS_OFF = { drums: false, bass: false, vocals: false, other: false };
const STEMS_ON = { drums: true, bass: true, vocals: true, other: true };

export default function useDecks(audioPlayerRef, masterBpm, setMasterBpm, hfSpaceUrl, setStatus, getStemUrls, quantizeEnabled, halfTimeByDeck = {}) {
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
  const [beatJumpSizeA, setBeatJumpSizeA] = useState(1);
  const [beatJumpSizeB, setBeatJumpSizeB] = useState(1);
  const [slipModeA, setSlipModeA] = useState(false);
  const [slipModeB, setSlipModeB] = useState(false);
  const [waveformDataA, setWaveformDataA] = useState(null);
  const [waveformDataB, setWaveformDataB] = useState(null);
  const [analyserNodeA, setAnalyserNodeA] = useState(null);
  const [analyserNodeB, setAnalyserNodeB] = useState(null);

  const getDeckBeatBpm = useCallback((deckId, bpm) => {
    if (!bpm) return 0;
    return halfTimeByDeck[deckId] ? bpm / 2 : bpm;
  }, [halfTimeByDeck]);

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

  // --- Apply BPM when a track is loaded ---
  const applyLoadBpm = useCallback((deckId, trackBpm) => {
    if (!trackBpm) return masterBpm;

    const beatBpm = getDeckBeatBpm(deckId, trackBpm);
    const targetBpm = !trackA && !trackB ? beatBpm : masterBpm;

    if (!trackA && !trackB) {
      setMasterBpm(targetBpm);
    }

    const ap = audioPlayerRef.current;
    ap.setPlaybackRate(deckId, targetBpm / beatBpm);

    return targetBpm;
  }, [audioPlayerRef, masterBpm, trackA, trackB, setMasterBpm, getDeckBeatBpm]);

  const resetDeckPlaybackState = useCallback((deckId) => {
    const ds = deckState(deckId);
    const ap = audioPlayerRef.current;

    ap.stop(deckId);
    ap.pauseOffsets[deckId] = 0;
    ap.startTimes[deckId] = null;
    ds.setPlaying(false);
  }, [audioPlayerRef, deckState]);

  // --- Waveform / analyser refresh ---
  const analyzeWaveformForDeck = useCallback((deckId) => {
    const ap = audioPlayerRef.current;
    const buffers = ap.audioBuffers[deckId];
    if (!buffers) return;

    const buffer = buffers.full || Object.values(buffers)[0];
    if (!buffer) return;

    ap.setupTrackGraph(deckId);
    const data = analyzeWaveform(buffer);
    const analyserNode = ap.getAnalyser(deckId);

    if (deckId === 'A') {
      setWaveformDataA(data);
      setAnalyserNodeA(analyserNode);
    } else {
      setWaveformDataB(data);
      setAnalyserNodeB(analyserNode);
    }
  }, [audioPlayerRef]);

  // --- Separate track into stems ---
  const separateTrack = useCallback(async (deckId, file, trackData, bpmToUse) => {
    const ds = deckState(deckId);
    let stoppedDuringStemSwap = false;
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

      const ap = audioPlayerRef.current;
      const wasPlaying = ap.getIsPlaying(deckId);
      const resumeOffset = wasPlaying ? ap.getCurrentPosition(deckId) : (ap.pauseOffsets[deckId] || 0);
      if (wasPlaying) {
        ap.stop(deckId);
        stoppedDuringStemSwap = true;
      }
      ap.audioBuffers[deckId] = {};
      ap.reversedBuffers[deckId] = {};

      const stemNames = Object.keys(jobResult.stems || {});
      if (stemNames.length === 0) {
        throw new Error('No stems returned from separation job');
      }
      await Promise.all(stemNames.map(async (stemName) => {
        let url = jobResult.stems[stemName].download_url;
        if (url.startsWith('/')) {
          url = `${pollUrl || hfSpaceUrl || jobResult.hf_space_url}${url}`;
        }
        await ap.loadAudio(deckId, stemName, url);
        const beatBpm = getDeckBeatBpm(deckId, trackData.bpm);
        if (beatBpm) ap.setPlaybackRate(deckId, bpmToUse / beatBpm);
      }));

      analyzeWaveformForDeck(deckId);
      ds.setSeparationProgress(100);
      ds.setStems(STEMS_ON);
      stemNames.forEach(s => ap.muteStem(deckId, s, false));
      ds.setTrack(prev => ({ ...prev, separated: true, jobId }));
      if (wasPlaying) {
        await ap.play(deckId, resumeOffset);
        ds.setPlaying(true);
      } else {
        ap.pauseOffsets[deckId] = resumeOffset;
      }
      setStatus('READY');
    } catch (err) {
      if (stoppedDuringStemSwap) {
        ds.setPlaying(false);
      }
      setStatus('ERROR: ' + err.message);
      console.error('Separation error:', err);
    } finally {
      ds.setIsSeparating(false);
      ds.setSeparationProgress(0);
    }
  }, [deckState, audioPlayerRef, hfSpaceUrl, setStatus, analyzeWaveformForDeck, getDeckBeatBpm]);

  // --- Load track from file (analyze → play → separate) ---
  const loadTrack = useCallback(async (deckId, file) => {
    const ds = deckState(deckId);
    setStatus(`LOADING ${file.name.toUpperCase()}...`);
    ds.setLoadingFile(file.name);
    resetDeckPlaybackState(deckId);

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
      audioPlayerRef.current.setTrackBpm(deckId, trackData.bpm);
      try {
        await audioPlayerRef.current.loadAudio(deckId, 'full', objectUrl);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
      analyzeWaveformForDeck(deckId);

      const bpmToUse = applyLoadBpm(deckId, trackData.bpm);

      setStatus('SEPARATING...');
      await separateTrack(deckId, file, trackData, bpmToUse);
    } catch (err) {
      console.error(err);
      setStatus('ERROR: ' + err.message);
    } finally {
      ds.setLoadingFile(null);
    }
  }, [deckState, audioPlayerRef, applyLoadBpm, setStatus, resetDeckPlaybackState, analyzeWaveformForDeck, separateTrack]);

  // --- Load from library (pre-processed stems) ---
  const loadTrackFromLibrary = useCallback(async (deckId, libraryTrack) => {
    // Block loading the same track on both decks
    const otherTrack = deckId === 'A' ? trackB : trackA;
    if (otherTrack?.id && otherTrack.id === libraryTrack.id) return;

    const ds = deckState(deckId);
    const loadingLabel = libraryTrack.original_filename || libraryTrack.title || 'TRACK';
    const statusTitle = libraryTrack.title || libraryTrack.original_filename || 'TRACK';
    setStatus(`LOADING ${statusTitle.toUpperCase()}...`);
    ds.setLoadingFile(loadingLabel);
    resetDeckPlaybackState(deckId);
    try {
      const stemUrls = await getStemUrls(libraryTrack);
      if (!stemUrls) throw new Error('Failed to get stem URLs');

      ds.setTrack({
        id: libraryTrack.id,
        filename: libraryTrack.original_filename,
        bpm: libraryTrack.bpm || 128,
        key: libraryTrack.key || 'C major',
        duration: libraryTrack.duration || 0,
        separated: true, stems: stemUrls,
      });

      const ap = audioPlayerRef.current;
      ap.setTrackBpm(deckId, libraryTrack.bpm || 128);
      ap.audioBuffers[deckId] = {};
      ap.reversedBuffers[deckId] = {};
      const stemNames = Object.keys(stemUrls);
      await Promise.all(stemNames.map(s => ap.loadAudio(deckId, s, stemUrls[s])));
      analyzeWaveformForDeck(deckId);

      applyLoadBpm(deckId, libraryTrack.bpm || 128);

      ds.setStems(STEMS_ON);
      stemNames.forEach(s => ap.muteStem(deckId, s, false));
      setStatus('READY');
    } catch (err) {
      console.error('Library load error:', err);
      setStatus('ERROR: ' + err.message);
    } finally {
      ds.setLoadingFile(null);
    }
  }, [deckState, audioPlayerRef, applyLoadBpm, getStemUrls, setStatus, resetDeckPlaybackState, analyzeWaveformForDeck, trackA, trackB]);

  // --- Playback ---
  const togglePlay = useCallback(async (deckId) => {
    const ds = deckState(deckId);
    const ap = audioPlayerRef.current;
    if (ds.isPlaying) {
      // Save current position before stopping so resume works
      const pos = ap.getCurrentPosition(deckId);
      ap.stop(deckId);
      ap.pauseOffsets[deckId] = pos;
      ds.setPlaying(false);
    } else {
      if (ap.hasScheduledAction(deckId)) {
        ap.clearScheduledAction(deckId);
        return;
      }
      const beatBpm = getDeckBeatBpm(deckId, ds.track?.bpm);
      if (beatBpm) ap.setPlaybackRate(deckId, masterBpm / beatBpm);
      const offset = ap.pauseOffsets[deckId] || 0;
      if (quantizeEnabled) await ap.playQuantized(deckId, offset, masterBpm);
      else await ap.play(deckId, offset);
      ds.setPlaying(true);
    }
  }, [deckState, audioPlayerRef, masterBpm, quantizeEnabled, getDeckBeatBpm]);

  const startDeck = useCallback(async (deckId, offset = 0, { restart = false, quantized = false } = {}) => {
    const ds = deckState(deckId);
    const ap = audioPlayerRef.current;
    if (!ds.track) return false;

    const beatBpm = getDeckBeatBpm(deckId, ds.track.bpm);
    if (beatBpm) ap.setPlaybackRate(deckId, masterBpm / beatBpm);

    if (ds.isPlaying && !restart) return true;

    const startOffset = restart ? offset : (ap.pauseOffsets[deckId] || offset);
    if (quantized && quantizeEnabled) await ap.playQuantized(deckId, startOffset, masterBpm);
    else await ap.play(deckId, startOffset);
    ds.setPlaying(true);
    return true;
  }, [audioPlayerRef, deckState, getDeckBeatBpm, masterBpm, quantizeEnabled]);

  const stopDeck = useCallback((deckId, { resetPosition = false } = {}) => {
    const ds = deckState(deckId);
    const ap = audioPlayerRef.current;
    const pos = resetPosition ? 0 : ap.getCurrentPosition(deckId);
    ap.stop(deckId);
    ap.pauseOffsets[deckId] = pos;
    ap.startTimes[deckId] = null;
    ds.setPlaying(false);
  }, [audioPlayerRef, deckState]);

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
    const beatBpm = getDeckBeatBpm(deckId, t?.bpm);
    if (beatBpm) audioPlayerRef.current.setLoopIn(deckId, beatBpm);
  }, [trackA, trackB, audioPlayerRef, getDeckBeatBpm]);

  const handleLoopOut = useCallback((deckId) => {
    const t = deckId === 'A' ? trackA : trackB;
    const beatBpm = getDeckBeatBpm(deckId, t?.bpm);
    if (beatBpm) audioPlayerRef.current.setLoopOut(deckId, beatBpm);
  }, [trackA, trackB, audioPlayerRef, getDeckBeatBpm]);

  const handleExitLoop = useCallback((deckId) => {
    audioPlayerRef.current.exitLoop(deckId);
  }, [audioPlayerRef]);

  // --- Seek ---
  const handleSeek = useCallback((deckId, percent) => {
    audioPlayerRef.current.seek(deckId, percent);
  }, [audioPlayerRef]);

  // --- Beat Jump ---
  const setBeatJumpSize = useCallback((deckId, size) => {
    if (deckId === 'A') setBeatJumpSizeA(size);
    else setBeatJumpSizeB(size);
  }, []);

  const handleBeatJump = useCallback(async (deckId, direction) => {
    const t = deckId === 'A' ? trackA : trackB;
    const size = deckId === 'A' ? beatJumpSizeA : beatJumpSizeB;
    const beatBpm = getDeckBeatBpm(deckId, t?.bpm);
    if (!beatBpm) return;
    await audioPlayerRef.current.beatJump(deckId, direction * size, beatBpm, quantizeEnabled ? masterBpm : null);
  }, [audioPlayerRef, trackA, trackB, beatJumpSizeA, beatJumpSizeB, masterBpm, quantizeEnabled, getDeckBeatBpm]);

  // --- Slip Mode ---
  const toggleSlipMode = useCallback((deckId) => {
    const ap = audioPlayerRef.current;
    if (deckId === 'A') {
      setSlipModeA(prev => {
        ap.setSlipMode('A', !prev);
        return !prev;
      });
    } else {
      setSlipModeB(prev => {
        ap.setSlipMode('B', !prev);
        return !prev;
      });
    }
  }, [audioPlayerRef]);

  useEffect(() => {
    const ap = audioPlayerRef.current;
    const beatBpmA = getDeckBeatBpm('A', trackA?.bpm);
    const beatBpmB = getDeckBeatBpm('B', trackB?.bpm);
    if (beatBpmA) ap.setPlaybackRate('A', masterBpm / beatBpmA);
    if (beatBpmB) ap.setPlaybackRate('B', masterBpm / beatBpmB);
  }, [audioPlayerRef, masterBpm, trackA?.id, trackA?.bpm, trackB?.id, trackB?.bpm, getDeckBeatBpm]);

  return {
    trackA, trackB, isPlayingA, isPlayingB,
    stemsA, stemsB,
    isSeparatingA, isSeparatingB,
    separationProgressA, separationProgressB,
    loadingFileA, loadingFileB,
    loadTrack, loadTrackFromLibrary,
    togglePlay, startDeck, stopDeck, toggleStem,
    handleLoopIn, handleLoopOut, handleExitLoop, handleSeek,
    beatJumpSizeA, beatJumpSizeB, setBeatJumpSize, handleBeatJump,
    slipModeA, slipModeB, toggleSlipMode,
    waveformDataA, waveformDataB,
    analyserNodeA, analyserNodeB,
    getDeckBeatBpm,
  };
}
