// hooks/useHotCues.js — Hot cue state management with Supabase persistence

import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const EMPTY_CUES = new Array(8).fill(null);

async function loadCuesFromSupabase(trackId) {
  if (!trackId) return [...EMPTY_CUES];
  try {
    const { data, error } = await supabase
      .from('tracks')
      .select('hot_cues')
      .eq('id', trackId)
      .single();
    if (error || !data?.hot_cues) return [...EMPTY_CUES];
    // Copy before mutating to avoid corrupting Supabase cache
    const cues = [...data.hot_cues];
    while (cues.length < 8) cues.push(null);
    return cues.slice(0, 8);
  } catch {
    return [...EMPTY_CUES];
  }
}

async function saveCuesToSupabase(trackId, cues) {
  if (!trackId) return;
  try {
    const { error } = await supabase
      .from('tracks')
      .update({ hot_cues: cues })
      .eq('id', trackId);
    if (error) console.warn('[HotCues] Save failed:', error.message);
  } catch (e) {
    console.warn('[HotCues] Save error:', e);
  }
}

export default function useHotCues(audioPlayerRef) {
  const [hotCuesA, setHotCuesA] = useState([...EMPTY_CUES]);
  const [hotCuesB, setHotCuesB] = useState([...EMPTY_CUES]);

  // Load cues when track changes
  const loadCuesForTrack = useCallback(async (deckId, track) => {
    if (!track) {
      if (deckId === 'A') setHotCuesA([...EMPTY_CUES]);
      else setHotCuesB([...EMPTY_CUES]);
      // Clear audioPlayer cues
      const ap = audioPlayerRef.current;
      ap.hotCues[deckId] = new Array(8).fill(null);
      return;
    }
    const saved = await loadCuesFromSupabase(track.id);
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
      // Persist to Supabase
      if (track?.id) {
        saveCuesToSupabase(track.id, next);
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
      if (track?.id) {
        saveCuesToSupabase(track.id, next);
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
