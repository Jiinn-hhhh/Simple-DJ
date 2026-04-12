// components/BeatJumpControls.jsx — Beat jump controls with size selection

import React from 'react';

const BEAT_SIZES = [0.25, 0.5, 1, 2, 4, 8, 16, 32];

const formatSize = (size) => {
  if (size === 0.25) return '1/4';
  if (size === 0.5) return '1/2';
  return String(size);
};

const BeatJumpControls = ({ beatJumpSize, onSetSize, onJump }) => {
  const cycleSize = (direction) => {
    const idx = BEAT_SIZES.indexOf(beatJumpSize);
    if (direction > 0 && idx < BEAT_SIZES.length - 1) onSetSize(BEAT_SIZES[idx + 1]);
    else if (direction < 0 && idx > 0) onSetSize(BEAT_SIZES[idx - 1]);
  };

  return (
    <div className="beat-jump-controls">
      <button className="beat-jump-btn" onClick={() => onJump(-1)} title="Jump backward">
        ◀
      </button>
      <div className="beat-jump-size">
        <button className="beat-jump-size-arrow" onClick={() => cycleSize(-1)}>‹</button>
        <span className="beat-jump-size-value">{formatSize(beatJumpSize)}</span>
        <button className="beat-jump-size-arrow" onClick={() => cycleSize(1)}>›</button>
      </div>
      <button className="beat-jump-btn" onClick={() => onJump(1)} title="Jump forward">
        ▶
      </button>
    </div>
  );
};

export default BeatJumpControls;
