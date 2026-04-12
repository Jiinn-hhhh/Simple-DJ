// hooks/useHotCues.js — Hot cue state management with localStorage persistence

import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'simple-dj-hotcues';
const EMPTY_CUES = new Array(8).fill(null);

function loadCuesFromStorage(trackId) {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return data[trackId] || [...EMPTY_CUES];
  } catch {
    return [...EMPTY_CUES];
  }
}

function saveCuesToStorage(trackId, cues) {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    data[trackId] = cues;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

export default function useHotCues(audioPlayerRef) {
  const [hotCuesA, setHotCuesA] = useState([...EMPTY_CUES]);
  const [hotCuesB, setHotCuesB] = useState([...EMPTY_CUES]);

  const getTrackId = useCallback((deckId) => {
    // We use deckId directly since the audioPlayer tracks by deck
    return deckId;
  }, []);

  // Load cues when track changes
  const loadCuesForTrack = useCallback((deckId, track) => {
    if (!track) {
      if (deckId === 'A') setHotCuesA([...EMPTY_CUES]);
      else setHotCuesB([...EMPTY_CUES]);
      // Clear audioPlayer cues
      const ap = audioPlayerRef.current;
      ap.hotCues[deckId] = new Array(8).fill(null);
      return;
    }
    const storageId = track.id || track.filename;
    const saved = loadCuesFromStorage(storageId);
    if (deckId === 'A') setHotCuesA(saved);
    else setHotCuesB(saved);
    // Sync to audioPlayer
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
      // Persist
      if (track) {
        const storageId = track.id || track.filename;
        saveCuesToStorage(storageId, next);
      }
      return next;
    });
  }, [audioPlayerRef]);

  const jumpToHotCue = useCallback((deckId, index) => {
    audioPlayerRef.current.jumpToHotCue(deckId, index);
  }, [audioPlayerRef]);

  const deleteHotCue = useCallback((deckId, index, track) => {
    audioPlayerRef.current.deleteHotCue(deckId, index);
    const setter = deckId === 'A' ? setHotCuesA : setHotCuesB;
    setter(prev => {
      const next = [...prev];
      next[index] = null;
      if (track) {
        const storageId = track.id || track.filename;
        saveCuesToStorage(storageId, next);
      }
      return next;
    });
  }, [audioPlayerRef]);

  return {
    hotCuesA, hotCuesB,
    loadCuesForTrack,
    setHotCue, jumpToHotCue, deleteHotCue,
  };
}
