// components/LoopRollPads.jsx — Horizontal loop roll pads with drag interaction

import React, { useRef } from 'react';

const ROLL_SIZES = [1/8, 1/4, 1/2, 1, 2, 4];

const formatSize = (size) => {
  if (size === 1/8) return '1/8';
  if (size === 1/4) return '1/4';
  if (size === 1/2) return '1/2';
  return String(size);
};

const LoopRollPads = ({ activeRoll, onStart, onEnd, onChangeSize }) => {
  const draggingRef = useRef(false);
  const currentSizeRef = useRef(null);

  const handleMouseDown = (size) => {
    draggingRef.current = true;
    currentSizeRef.current = size;
    onStart(size);
  };

  const handleMouseUp = () => {
    draggingRef.current = false;
    currentSizeRef.current = null;
    onEnd();
  };

  const handleMouseEnter = (size) => {
    // Drag: use refs (not React state) to avoid re-render timing issues
    if (draggingRef.current && currentSizeRef.current !== size) {
      currentSizeRef.current = size;
      if (onChangeSize) {
        onChangeSize(size);
      } else {
        onEnd();
        onStart(size);
      }
    }
  };

  return (
    <div
      className="looproll-pads"
      onMouseLeave={() => {
        if (draggingRef.current) {
          draggingRef.current = false;
          currentSizeRef.current = null;
          onEnd();
        }
      }}
    >
      {ROLL_SIZES.map((size) => (
        <button
          key={size}
          className={`looproll-pad ${activeRoll === size ? 'active' : ''}`}
          onMouseDown={() => handleMouseDown(size)}
          onMouseUp={handleMouseUp}
          onMouseEnter={() => handleMouseEnter(size)}
          onTouchStart={(e) => { e.preventDefault(); onStart(size); }}
          onTouchEnd={() => onEnd()}
          onTouchCancel={() => onEnd()}
        >
          {formatSize(size)}
        </button>
      ))}
    </div>
  );
};

export default LoopRollPads;
