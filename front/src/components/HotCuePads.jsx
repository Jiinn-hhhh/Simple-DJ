// components/HotCuePads.jsx — 2x4 hot cue pad grid

import React, { useRef } from 'react';

const PAD_COLORS = [
  '#ff0000', '#ff8800', '#ffff00', '#00cc00',
  '#00ccff', '#0066ff', '#9900ff', '#ff00aa'
];

const LONG_PRESS_MS = 500;

const HotCuePads = ({ hotCues, currentCueIndex, onSetCue, onJumpCue, onDeleteCue }) => {
  const longPressRef = useRef({});

  const handleClick = (index) => {
    if (longPressRef.current[index]) return; // was long press
    if (hotCues[index]) {
      onJumpCue(index);
    } else {
      onSetCue(index);
    }
  };

  const handleContextMenu = (e, index) => {
    e.preventDefault();
    if (hotCues[index]) {
      onDeleteCue(index);
    }
  };

  const handleMouseDown = (index) => {
    longPressRef.current[index] = false;
    longPressRef.current[`timer_${index}`] = setTimeout(() => {
      if (hotCues[index]) {
        longPressRef.current[index] = true;
        onDeleteCue(index);
      }
    }, LONG_PRESS_MS);
  };

  const handleMouseUp = (index) => {
    clearTimeout(longPressRef.current[`timer_${index}`]);
  };

  const handleMouseLeave = (index) => {
    clearTimeout(longPressRef.current[`timer_${index}`]);
  };

  return (
    <div className="hotcue-pads">
      {hotCues.slice(0, 4).map((cue, i) => (
        <button
          key={i}
          className={`hotcue-pad ${cue ? 'active' : ''} ${currentCueIndex === i ? 'current-active' : ''}`}
          style={{
            '--pad-color': cue ? cue.color : PAD_COLORS[i],
            borderColor: cue ? cue.color : '#333',
            background: cue ? `${cue.color}22` : 'rgba(255,255,255,0.03)',
          }}
          onClick={() => handleClick(i)}
          onContextMenu={(e) => handleContextMenu(e, i)}
          onMouseDown={() => handleMouseDown(i)}
          onMouseUp={() => handleMouseUp(i)}
          onMouseLeave={() => handleMouseLeave(i)}
          title={cue ? `Cue ${i + 1}: ${cue.position.toFixed(2)}s (hold or right-click to delete)` : `Set Cue ${i + 1}`}
        >
          {i + 1}
        </button>
      ))}
    </div>
  );
};

export default HotCuePads;
