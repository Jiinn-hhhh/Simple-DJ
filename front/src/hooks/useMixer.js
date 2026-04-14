// hooks/useMixer.js — Mixer, crossfader, EQ, filter, BPM, effects

import { useState, useCallback } from 'react';

export default function useMixer(audioPlayerRef, trackA, trackB) {
  const [volumeA, setVolumeA] = useState(1.0);
  const [volumeB, setVolumeB] = useState(1.0);
  const [crossfader, setCrossfader] = useState(0.5);
  const [filterA, setFilterA] = useState(0.5);
  const [filterB, setFilterB] = useState(0.5);
  const [eqA, setEqA] = useState({ high: 100, mid: 100, low: 100 });
  const [eqB, setEqB] = useState({ high: 100, mid: 100, low: 100 });
  const [masterVolume, setMasterVolume] = useState(1.0);
  const [masterBpm, setMasterBpm] = useState(128);
  const [keyLockA, setKeyLockA] = useState(false);
  const [keyLockB, setKeyLockB] = useState(false);

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
  }, [audioPlayerRef, trackA, trackB]);

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
    if (type === 'airhorn') audioPlayerRef.current.playAirHorn();
    if (type === 'siren') audioPlayerRef.current.playSiren();
    if (type === 'reload') audioPlayerRef.current.playReload();
    if (type === 'gunshot') audioPlayerRef.current.playGunshot();
    if (type === 'down') audioPlayerRef.current.playDown();
    if (type === 'yea') audioPlayerRef.current.playYea();
  }, [audioPlayerRef]);

  return {
    volumeA, volumeB, crossfader, filterA, filterB,
    eqA, eqB, masterVolume, masterBpm, setMasterBpm,
    setCrossfader,
    handleVolumeChange, handleCrossfaderChange, handleMasterVolumeChange,
    handleEqChange, handleFilterChange, handleMasterBpmChange,
    handleMasterEffect, triggerSampler,
    keyLockA, keyLockB, toggleKeyLock,
  };
}
