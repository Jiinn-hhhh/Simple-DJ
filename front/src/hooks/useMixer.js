// hooks/useMixer.js — Mixer, crossfader, EQ, filter, BPM, effects

import { useState, useCallback, useEffect } from 'react';

export default function useMixer(audioPlayerRef, trackA, trackB, externalMasterBpm = null, externalSetMasterBpm = null, setStatus = null) {
  const [volumeA, setVolumeA] = useState(1.0);
  const [volumeB, setVolumeB] = useState(1.0);
  const [crossfader, setCrossfader] = useState(0.5);
  const [filterA, setFilterA] = useState(0.5);
  const [filterB, setFilterB] = useState(0.5);
  const [eqA, setEqA] = useState({ high: 100, mid: 100, low: 100 });
  const [eqB, setEqB] = useState({ high: 100, mid: 100, low: 100 });
  const [masterVolume, setMasterVolume] = useState(1.0);
  const [effectVolume, setEffectVolume] = useState(1.0);
  const [internalMasterBpm, setInternalMasterBpm] = useState(128);
  const [keyLockA, setKeyLockA] = useState(false);
  const [keyLockB, setKeyLockB] = useState(false);
  const [headphoneOnlyA, setHeadphoneOnlyA] = useState(false);
  const [headphoneOnlyB, setHeadphoneOnlyB] = useState(false);
  const [headphoneVolume, setHeadphoneVolume] = useState(0.85);
  const [headphoneOutputReady, setHeadphoneOutputReady] = useState(false);
  const [headphoneOutputLabel, setHeadphoneOutputLabel] = useState('');

  const masterBpm = externalMasterBpm ?? internalMasterBpm;
  const setMasterBpm = externalSetMasterBpm ?? setInternalMasterBpm;
  const reportStatus = useCallback((message) => {
    if (setStatus) setStatus(message);
  }, [setStatus]);

  // --- Volume math with crossfader curve ---
  const applyVolumes = useCallback((volA, volB, xf, masterVol) => {
    let gainA = volA * masterVol;
    let gainB = volB * masterVol;
    gainA *= Math.cos(xf * Math.PI / 2);
    gainB *= Math.sin(xf * Math.PI / 2);
    audioPlayerRef.current.setVolume('A', gainA);
    audioPlayerRef.current.setVolume('B', gainB);
  }, [audioPlayerRef]);

  const handleVolumeChange = useCallback((deckId, val) => {
    if (deckId === 'A') setVolumeA(val); else setVolumeB(val);
    applyVolumes(deckId === 'A' ? val : volumeA, deckId === 'B' ? val : volumeB, crossfader, masterVolume);
  }, [volumeA, volumeB, crossfader, masterVolume, applyVolumes]);

  const handleCrossfaderChange = useCallback((val) => {
    setCrossfader(val);
    applyVolumes(volumeA, volumeB, val, masterVolume);
  }, [volumeA, volumeB, masterVolume, applyVolumes]);

  const handleMasterVolumeChange = useCallback((val) => {
    setMasterVolume(val);
    applyVolumes(volumeA, volumeB, crossfader, val);
  }, [volumeA, volumeB, crossfader, applyVolumes]);

  const handleEffectVolumeChange = useCallback((val) => {
    const next = Math.max(0, Math.min(1, val));
    setEffectVolume(next);
    audioPlayerRef.current.setSamplerVolume?.(next);
  }, [audioPlayerRef]);

  const handleSelectHeadphoneOutput = useCallback(async () => {
    try {
      const output = await audioPlayerRef.current.selectHeadphoneOutput();
      setHeadphoneOutputReady(true);
      setHeadphoneOutputLabel(output?.label || 'HEADPHONES');
      reportStatus('HEADPHONE OUTPUT READY');
      return output;
    } catch (err) {
      console.warn('Headphone output selection failed:', err);
      const cancelled = err?.name === 'NotAllowedError' || err?.name === 'AbortError';
      reportStatus(cancelled ? 'HEADPHONE DEVICE NOT SELECTED' : 'HEADPHONE OUTPUT UNSUPPORTED');
      return null;
    }
  }, [audioPlayerRef, reportStatus]);

  const handleHeadphoneVolumeChange = useCallback((val) => {
    const next = Math.max(0, Math.min(1, val));
    setHeadphoneVolume(next);
    audioPlayerRef.current.setHeadphoneVolume(next);
  }, [audioPlayerRef]);

  const handleHeadphoneOnlyToggle = useCallback(async (deckId) => {
    const isCurrentlyOn = deckId === 'A' ? headphoneOnlyA : headphoneOnlyB;
    const next = !isCurrentlyOn;

    if (next) {
      const output = headphoneOutputReady
        ? await audioPlayerRef.current.startHeadphoneOutput().then(() => ({ ready: true })).catch(() => null)
        : await handleSelectHeadphoneOutput();

      if (!output) return;
    }

    if (deckId === 'A') setHeadphoneOnlyA(next);
    else setHeadphoneOnlyB(next);

    audioPlayerRef.current.setHeadphoneOnly(deckId, next);
    reportStatus(`${deckId} HEADPHONE ONLY ${next ? 'ON' : 'OFF'}`);
  }, [audioPlayerRef, headphoneOnlyA, headphoneOnlyB, headphoneOutputReady, handleSelectHeadphoneOutput, reportStatus]);

  // --- EQ ---
  const handleEqChange = useCallback((deckId, band, val) => {
    if (deckId === 'A') setEqA(prev => ({ ...prev, [band]: val }));
    else setEqB(prev => ({ ...prev, [band]: val }));
    audioPlayerRef.current.setEq(deckId, band, val / 100);
  }, [audioPlayerRef]);

  // --- Filter ---
  const handleFilterChange = useCallback((deckId, val) => {
    if (deckId === 'A') setFilterA(val); else setFilterB(val);
    audioPlayerRef.current.setFilter(deckId, val);
  }, [audioPlayerRef]);

  // --- Master BPM ---
  const handleMasterBpmChange = useCallback((val) => {
    setMasterBpm(val);
    if (trackA?.bpm) audioPlayerRef.current.setPlaybackRate('A', val / trackA.bpm);
    if (trackB?.bpm) audioPlayerRef.current.setPlaybackRate('B', val / trackB.bpm);
  }, [audioPlayerRef, trackA, trackB, setMasterBpm]);

  // --- Key Lock ---
  const toggleKeyLock = useCallback((deckId) => {
    const ap = audioPlayerRef.current;
    if (deckId === 'A') {
      setKeyLockA(prev => {
        ap.setKeyLock('A', !prev);
        return !prev;
      });
    } else {
      setKeyLockB(prev => {
        ap.setKeyLock('B', !prev);
        return !prev;
      });
    }
  }, [audioPlayerRef]);

  // --- Effects & Sampler ---
  const handleMasterEffect = useCallback((x, y) => {
    audioPlayerRef.current.setMasterEffect(x, y);
  }, [audioPlayerRef]);

  const triggerSampler = useCallback((type) => {
    audioPlayerRef.current.setSamplerVolume?.(effectVolume);
    if (type === 'airhorn') audioPlayerRef.current.playAirHorn();
    if (type === 'siren') audioPlayerRef.current.playSiren();
    if (type === 'reload') audioPlayerRef.current.playReload();
    if (type === 'gunshot') audioPlayerRef.current.playGunshot();
    if (type === 'down') audioPlayerRef.current.playDown();
    if (type === 'yea') audioPlayerRef.current.playYea();
  }, [audioPlayerRef, effectVolume]);

  useEffect(() => {
    applyVolumes(volumeA, volumeB, crossfader, masterVolume);
  }, [volumeA, volumeB, crossfader, masterVolume, trackA?.id, trackB?.id, applyVolumes]);

  return {
    volumeA, volumeB, crossfader, filterA, filterB,
    eqA, eqB, masterVolume, effectVolume, masterBpm, setMasterBpm,
    headphoneOnlyA, headphoneOnlyB, headphoneVolume, headphoneOutputReady, headphoneOutputLabel,
    setCrossfader,
    handleVolumeChange, handleCrossfaderChange, handleMasterVolumeChange,
    handleEffectVolumeChange, handleHeadphoneOnlyToggle, handleHeadphoneVolumeChange, handleSelectHeadphoneOutput,
    handleEqChange, handleFilterChange, handleMasterBpmChange,
    handleMasterEffect, triggerSampler,
    keyLockA, keyLockB, toggleKeyLock,
  };
}
