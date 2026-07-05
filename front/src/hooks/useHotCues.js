// hooks/useHotCues.js - Hot cue state management with local library persistence

import { useState, useCallback } from 'react';
import { getTrack, patchTrack } from '../lib/localLibraryDb';

const EMPTY_CUES = new Array(8).fill(null);

async function loadCuesFromLocalLibrary(trackId) {
  if (!trackId) return [...EMPTY_CUES];
  try {
    const track = await getTrack(trackId);
    if (!track?.hot_cues) return [...EMPTY_CUES];
    const cues = [...track.hot_cues];
    while (cues.length < 8) cues.push(null);
    return cues.slice(0, 8);
  } catch {
    return [...EMPTY_CUES];
  }
}

async function saveCuesToLocalLibrary(trackId, cues) {
  if (!trackId) return;
  try {
    await patchTrack(trackId, { hot_cues: cues });
  } catch (e) {
    console.warn('[HotCues] Save error:', e);
  }
}

export default function useHotCues(audioPlayerRef) {
  const [hotCuesA, setHotCuesA] = useState([...EMPTY_CUES]);
  const [hotCuesB, setHotCuesB] = useState([...EMPTY_CUES]);

  const loadCuesForTrack = useCallback(async (deckId, track) => {
    if (!track) {
      if (deckId === 'A') setHotCuesA([...EMPTY_CUES]);
      else setHotCuesB([...EMPTY_CUES]);
      const ap = audioPlayerRef.current;
      ap.hotCues[deckId] = new Array(8).fill(null);
      return;
    }

    const saved = await loadCuesFromLocalLibrary(track.id);
    if (deckId === 'A') setHotCuesA(saved);
    else setHotCuesB(saved);
    const ap = audioPlayerRef.current;
    ap.hotCues[deckId] = [...saved];
  }, [audioPlayerRef]);

  const setHotCue = useCallback((deckId, index, bpm, track) => {
    const ap = audioPlayerRef.current;
    const cue = ap.setHotCue(deckId, index, bpm);
    if (!cue) return;

    const setter = deckId === 'A' ? setHotCuesA : setHotCuesB;
    setter(prev => {
      const next = [...prev];
      next[index] = cue;
      if (track?.id) saveCuesToLocalLibrary(track.id, next);
      return next;
    });
  }, [audioPlayerRef]);

  const jumpToHotCue = useCallback((deckId, index, masterBpm = null) => {
    return audioPlayerRef.current.jumpToHotCue(deckId, index, masterBpm);
  }, [audioPlayerRef]);

  const deleteHotCue = useCallback((deckId, index, track) => {
    audioPlayerRef.current.deleteHotCue(deckId, index);
    const setter = deckId === 'A' ? setHotCuesA : setHotCuesB;
    setter(prev => {
      const next = [...prev];
      next[index] = null;
      if (track?.id) saveCuesToLocalLibrary(track.id, next);
      return next;
    });
  }, [audioPlayerRef]);

  return {
    hotCuesA, hotCuesB,
    loadCuesForTrack,
    setHotCue, jumpToHotCue, deleteHotCue,
  };
}
