// hooks/useLoopRoll.js — Loop Roll state management

import { useState, useCallback } from 'react';

export default function useLoopRoll(audioPlayerRef) {
  const [activeRollA, setActiveRollA] = useState(null); // active beat size or null
  const [activeRollB, setActiveRollB] = useState(null);

  const startLoopRoll = useCallback((deckId, beats, bpm) => {
    if (!bpm) return;
    audioPlayerRef.current.startLoopRoll(deckId, beats, bpm);
    if (deckId === 'A') setActiveRollA(beats);
    else setActiveRollB(beats);
  }, [audioPlayerRef]);

  const endLoopRoll = useCallback((deckId) => {
    audioPlayerRef.current.endLoopRoll(deckId);
    if (deckId === 'A') setActiveRollA(null);
    else setActiveRollB(null);
  }, [audioPlayerRef]);

  return {
    activeRollA, activeRollB,
    startLoopRoll, endLoopRoll,
  };
}
