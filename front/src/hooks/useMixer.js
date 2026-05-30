// hooks/useMixer.js — Mixer, crossfader, EQ, filter, BPM, effects

import { useState, useCallback, useEffect } from 'react';

export default function useMixer(audioPlayerRef, trackA, trackB, externalMasterBpm = null, externalSetMasterBpm = null, setStatus = null, deckBeatBpms = {}) {
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
  const [headphoneOutputs, setHeadphoneOutputs] = useState([]);
  const [headphoneOutputId, setHeadphoneOutputId] = useState('');
  const [headphoneOutputLabel, setHeadphoneOutputLabel] = useState('');
  const [headphoneOutputMessage, setHeadphoneOutputMessage] = useState('SELECT HP OUT');

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

  const handleRefreshHeadphoneOutputs = useCallback(async () => {
    try {
      setHeadphoneOutputMessage('CHOOSE OUTPUT...');
      const { output, outputs } = await audioPlayerRef.current.chooseHeadphoneOutputDevice();
      setHeadphoneOutputs(outputs);
      if (output) {
        setHeadphoneOutputId(output.deviceId);
        setHeadphoneOutputReady(true);
        setHeadphoneOutputLabel(output.label || 'HEADPHONES');
        setHeadphoneOutputMessage('HP LINE READY');
      } else {
        setHeadphoneOutputMessage(outputs.length ? 'CHOOSE HP LINE' : 'NO OUTPUTS FOUND');
        if (!outputs.length) reportStatus('NO HEADPHONE OUTPUTS FOUND');
      }
      return { output, outputs };
    } catch (err) {
      console.warn('Headphone output selection failed:', err);
      if (err?.name !== 'NotAllowedError') {
        setHeadphoneOutputs([]);
        setHeadphoneOutputReady(false);
      }

      if (err?.code === 'OUTPUT_LIST_REQUIRES_MIC') {
        setHeadphoneOutputMessage('ALLOW MIC');
        reportStatus('ALLOW MICROPHONE TO LIST OUTPUTS');
      } else if (err?.name === 'NotAllowedError') {
        setHeadphoneOutputMessage('OUTPUT PICKER CANCELED');
        reportStatus('HEADPHONE OUTPUT CANCELED');
      } else {
        setHeadphoneOutputMessage('OUTPUT PICKER UNSUPPORTED');
        reportStatus('HEADPHONE OUTPUT UNSUPPORTED');
      }
      return { output: null, outputs: [] };
    }
  }, [audioPlayerRef, reportStatus]);

  const handleSelectHeadphoneOutput = useCallback(async (deviceId) => {
    const selected = headphoneOutputs.find(output => output.deviceId === deviceId);

    try {
      const output = await audioPlayerRef.current.setHeadphoneOutputDevice(
        deviceId,
        selected?.label || 'HEADPHONES',
      );
      setHeadphoneOutputId(output.deviceId);
      setHeadphoneOutputReady(true);
      setHeadphoneOutputLabel(output.label || selected?.label || 'HEADPHONES');
      setHeadphoneOutputMessage('HP LINE READY');
      return output;
    } catch (err) {
      console.warn('Headphone output selection failed:', err);
      setHeadphoneOutputReady(false);
      setHeadphoneOutputMessage('HP LINE FAILED');
      reportStatus('HEADPHONE OUTPUT FAILED');
      return null;
    }
  }, [audioPlayerRef, headphoneOutputs, reportStatus]);

  const handleHeadphoneVolumeChange = useCallback((val) => {
    const next = Math.max(0, Math.min(1, val));
    setHeadphoneVolume(next);
    audioPlayerRef.current.setHeadphoneVolume(next);
  }, [audioPlayerRef]);

  const handleHeadphoneOnlyToggle = useCallback(async (deckId) => {
    const isCurrentlyOn = deckId === 'A' ? headphoneOnlyA : headphoneOnlyB;
    const next = !isCurrentlyOn;

    if (next && headphoneOutputReady) {
      const started = await audioPlayerRef.current.startHeadphoneOutput().then(() => true).catch(() => false);
      if (!started) {
        setHeadphoneOutputMessage('HP LINE FAILED');
        reportStatus('HEADPHONE OUTPUT FAILED');
        return;
      }
    } else if (next && !headphoneOutputReady) {
      setHeadphoneOutputMessage('SELECT HP OUT');
      reportStatus('HP ONLY ON - SELECT HEADPHONE OUTPUT FOR CUE');
    }

    if (deckId === 'A') setHeadphoneOnlyA(next);
    else setHeadphoneOnlyB(next);

    audioPlayerRef.current.setHeadphoneOnly(deckId, next);
    reportStatus(`${deckId} HEADPHONE ONLY ${next ? 'ON' : 'OFF'}`);
  }, [audioPlayerRef, headphoneOnlyA, headphoneOnlyB, headphoneOutputReady, reportStatus]);

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
    const beatBpmA = deckBeatBpms.A || trackA?.bpm;
    const beatBpmB = deckBeatBpms.B || trackB?.bpm;
    if (beatBpmA) audioPlayerRef.current.setPlaybackRate('A', val / beatBpmA);
    if (beatBpmB) audioPlayerRef.current.setPlaybackRate('B', val / beatBpmB);
  }, [audioPlayerRef, trackA, trackB, setMasterBpm, deckBeatBpms]);

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
    headphoneOnlyA, headphoneOnlyB, headphoneVolume, headphoneOutputReady,
    headphoneOutputs, headphoneOutputId, headphoneOutputLabel, headphoneOutputMessage,
    setCrossfader,
    handleVolumeChange, handleCrossfaderChange, handleMasterVolumeChange,
    handleEffectVolumeChange, handleHeadphoneOnlyToggle, handleHeadphoneVolumeChange,
    handleRefreshHeadphoneOutputs, handleSelectHeadphoneOutput,
    handleEqChange, handleFilterChange, handleMasterBpmChange,
    handleMasterEffect, triggerSampler,
    keyLockA, keyLockB, toggleKeyLock,
  };
}
