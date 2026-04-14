// hooks/usePlaybackPosition.js — ~60fps playback position polling

import { useState, useRef, useCallback, useEffect } from 'react';

export default function usePlaybackPosition(audioPlayerRef, isPlayingA, isPlayingB) {
  const [positionA, setPositionA] = useState(0); // 0-1 normalized
  const [positionB, setPositionB] = useState(0);
  const [slipPositionA, setSlipPositionA] = useState(null);
  const [slipPositionB, setSlipPositionB] = useState(null);
  const rafRef = useRef(null);

  const updateDeckPosition = useCallback((deckId) => {
    const ap = audioPlayerRef.current;
    if (!ap) return;

    const duration = ap.getTrackDuration(deckId);
    const setPosition = deckId === 'A' ? setPositionA : setPositionB;
    const setSlipPosition = deckId === 'A' ? setSlipPositionA : setSlipPositionB;

    if (duration <= 0) {
      setPosition(0);
      setSlipPosition(null);
      return;
    }

    const audible = ap.getAudiblePosition ? ap.getAudiblePosition(deckId) : ap.getCurrentPosition(deckId);
    setPosition(Math.min(1, Math.max(0, audible / duration)));

    const slipActive = ap.isSlipActive?.(deckId);
    if (!slipActive || !ap.getVirtualPosition) {
      setSlipPosition(null);
      return;
    }

    const virtual = ap.getVirtualPosition(deckId);
    if (Math.abs(virtual - audible) < 0.01) {
      setSlipPosition(null);
      return;
    }

    setSlipPosition(Math.min(1, Math.max(0, virtual / duration)));
  }, [audioPlayerRef]);

  useEffect(() => {
    if (!(isPlayingA || isPlayingB)) {
      return undefined;
    }

    const tick = () => {
      if (isPlayingA) updateDeckPosition('A');
      if (isPlayingB) updateDeckPosition('B');
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlayingA, isPlayingB, updateDeckPosition]);

  // Immediate position update after seek (even when paused)
  const seekPosition = useCallback((deckId, percent) => {
    if (deckId === 'A') {
      setPositionA(Math.min(1, Math.max(0, percent)));
      setSlipPositionA(null);
    } else {
      setPositionB(Math.min(1, Math.max(0, percent)));
      setSlipPositionB(null);
    }
  }, []);

  const syncPosition = useCallback((deckId) => {
    updateDeckPosition(deckId);
  }, [updateDeckPosition]);

  return {
    positionA,
    positionB,
    slipPositionA,
    slipPositionB,
    seekPosition,
    syncPosition,
  };
}
