// components/LoopRollPads.jsx — 2x4 loop roll pad grid (hold-to-activate)

import React from 'react';

const ROLL_SIZES = [1/32, 1/16, 1/8, 1/4, 1/2, 1, 2, 4];

const formatSize = (size) => {
  if (size === 1/32) return '1/32';
  if (size === 1/16) return '1/16';
  if (size === 1/8) return '1/8';
  if (size === 1/4) return '1/4';
  if (size === 1/2) return '1/2';
  return String(size);
};

const LoopRollPads = ({ activeRoll, onStart, onEnd }) => {
  return (
    <div className="looproll-pads">
      {ROLL_SIZES.map((size) => (
        <button
          key={size}
          className={`looproll-pad ${activeRoll === size ? 'active' : ''}`}
          onMouseDown={() => onStart(size)}
          onMouseUp={() => onEnd()}
          onMouseLeave={() => { if (activeRoll === size) onEnd(); }}
          onTouchStart={(e) => { e.preventDefault(); onStart(size); }}
          onTouchEnd={() => onEnd()}
        >
          {formatSize(size)}
        </button>
      ))}
    </div>
  );
};

export default LoopRollPads;
