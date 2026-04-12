// components/HotCuePads.jsx — 2x4 hot cue pad grid

import React from 'react';

const PAD_COLORS = [
  '#ff0000', '#ff8800', '#ffff00', '#00cc00',
  '#00ccff', '#0066ff', '#9900ff', '#ff00aa'
];

const HotCuePads = ({ hotCues, onSetCue, onJumpCue, onDeleteCue }) => {
  const handleClick = (index) => {
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

  return (
    <div className="hotcue-pads">
      {hotCues.map((cue, i) => (
        <button
          key={i}
          className={`hotcue-pad ${cue ? 'active' : ''}`}
          style={{
            '--pad-color': cue ? cue.color : PAD_COLORS[i],
            borderColor: cue ? cue.color : '#333',
            background: cue ? `${cue.color}22` : 'rgba(255,255,255,0.03)',
          }}
          onClick={() => handleClick(i)}
          onContextMenu={(e) => handleContextMenu(e, i)}
          title={cue ? `Cue ${i + 1}: ${cue.position.toFixed(2)}s (right-click to delete)` : `Set Cue ${i + 1}`}
        >
          {i + 1}
        </button>
      ))}
    </div>
  );
};

export default HotCuePads;
