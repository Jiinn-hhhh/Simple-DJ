// hooks/usePlaybackPosition.js — ~60fps playback position polling

import { useState, useRef, useCallback, useEffect } from 'react';

export default function usePlaybackPosition(audioPlayerRef, isPlayingA, isPlayingB) {
  const [positionA, setPositionA] = useState(0); // 0-1 normalized
  const [positionB, setPositionB] = useState(0);
  const rafRef = useRef(null);

  const update = useCallback(() => {
    const ap = audioPlayerRef.current;
    if (!ap) return;

    if (isPlayingA) {
      const dur = ap.getTrackDuration('A');
      if (dur > 0) {
        setPositionA(Math.min(1, Math.max(0, ap.getCurrentPosition('A') / dur)));
      }
    }

    if (isPlayingB) {
      const dur = ap.getTrackDuration('B');
      if (dur > 0) {
        setPositionB(Math.min(1, Math.max(0, ap.getCurrentPosition('B') / dur)));
      }
    }

    rafRef.current = requestAnimationFrame(update);
  }, [audioPlayerRef, isPlayingA, isPlayingB]);

  useEffect(() => {
    if (isPlayingA || isPlayingB) {
      rafRef.current = requestAnimationFrame(update);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlayingA, isPlayingB, update]);

  // Immediate position update after seek (even when paused)
  const seekPosition = useCallback((deckId, percent) => {
    if (deckId === 'A') setPositionA(Math.min(1, Math.max(0, percent)));
    else setPositionB(Math.min(1, Math.max(0, percent)));
  }, []);

  return { positionA, positionB, seekPosition };
}
