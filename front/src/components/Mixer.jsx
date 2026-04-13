import React from 'react';
import XYPad from './XYPad';

const Mixer = ({
  crossfader,
  onCrossfaderChange,
  volumeA,
  onVolumeAChange,
  volumeB,
  onVolumeBChange,
  filterA,
  onFilterAChange,
  filterB,
  onFilterBChange,
  eqA,
  eqB,
  onEqChange,
  masterBpm,
  onBpmChange,
  masterVolume,
  onMasterVolumeChange,
  onMasterEffect,
  onTriggerSampler
}) => {

  // Helper to visualize filter value
  const getFilterDisplay = (val) => {
    if (val < 0.45) return 'LPF';
    if (val > 0.55) return 'HPF';
    return 'FLAT';
  };

  // Helper for EQ visual value
  const getEqDisplay = (val) => {
    if (val === 0) return "KILL";
    if (val === 100) return "FLAT";
    if (val === 200) return "MAX";
    if (val < 100) return "CUT";
    return "BOOST";
  };

  return (
    <div className="mixer-container">

      {/* 1. HEADER: MASTER BPM & VOLUME */}
      <div className="mixer-header-column">
        <div className="bpm-display-large">
          <span className="bpm-label-top">MASTER BPM</span>
          <input
            type="number"
            value={Math.round(masterBpm)}
            onChange={(e) => onBpmChange(parseInt(e.target.value) || 128)}
            className="bpm-input-large pixel-font"
          />
          <input
            type="range"
            min="60" max="180" step="1"
            value={Math.round(masterBpm)}
            onChange={(e) => onBpmChange(parseInt(e.target.value))}
            className="bpm-slider"
            title={`BPM: ${Math.round(masterBpm)}`}
          />
        </div>

        {/* Master Volume */}
        <div className="master-vol-container">
          <label className="mixer-label tiny">MASTER VOL</label>
          <input
            type="range"
            min="0" max="1" step="0.01"
            value={masterVolume}
            onChange={(e) => onMasterVolumeChange(parseFloat(e.target.value))}
            className="master-vol-slider"
            title={`Master Volume: ${Math.round(masterVolume * 100)}%`}
          />
        </div>
      </div>

      {/* 2. BODY: SPLIT A / B CONTROLS */}
      <div className="mixer-body">

        {/* LEFT COLUMN: DECK A CONTROLS */}
        <div className="mixer-column">
          {/* EQ Controls Section */}
          <div style={{ display: 'flex', flexDirection: 'column', width: '100%', alignItems: 'center', marginBottom: '10px' }}>
            <EqControl label="HI" value={eqA.high} onChange={(v) => onEqChange('A', 'high', v)} />
            <EqControl label="MID" value={eqA.mid} onChange={(v) => onEqChange('A', 'mid', v)} />
            <EqControl label="LO" value={eqA.low} onChange={(v) => onEqChange('A', 'low', v)} />
          </div>

          {/* Filter A */}
          <div className="control-group">
            <label className="mixer-label">FILTER</label>
            <div className="filter-display">{getFilterDisplay(filterA)}</div>
            <input
              type="range"
              min="0" max="1" step="0.01"
              value={filterA}
              onChange={(e) => onFilterAChange(parseFloat(e.target.value))}
              className="knob-slider-horizontal"
            />
          </div>

          {/* Volume A */}
          <div className="control-group fader-group">
            <div className="fader-track-new">
              <input
                type="range"
                min="0" max="1" step="0.01"
                value={volumeA}
                onChange={(e) => onVolumeAChange(parseFloat(e.target.value))}
                className="vertical-fader-new"
                title={`Volume A: ${Math.round(volumeA * 100)}%`}
              />
            </div>
            <span className="deck-label">A</span>
          </div>
        </div>

        {/* CENTER COLUMN: FX & SAMPLER */}
        <div className="mixer-column center-fx" style={{ flex: '0 0 240px', maxWidth: '240px', justifyContent: 'flex-end', paddingBottom: '0' }}>

          {/* SAMPLER BUTTONS */}
          <div style={{ display: 'flex', gap: '8px', width: '100%', marginBottom: '15px' }}>
            <button
              onClick={() => onTriggerSampler('airhorn')}
              className="sampler-btn"
              style={{
                flex: 1,
                height: '45px',
                background: '#333',
                border: '2px solid #555',
                borderRadius: '4px',
                color: '#aaa',
                fontSize: '1.2rem',
                cursor: 'pointer',
                boxShadow: '0 4px 0 #222',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.1s'
              }}
              onMouseDown={(e) => {
                e.currentTarget.style.transform = 'translateY(4px)';
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.color = '#fff';
                e.currentTarget.style.borderColor = '#888';
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 0 #222';
                e.currentTarget.style.color = '#aaa';
                e.currentTarget.style.borderColor = '#555';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 0 #222';
                e.currentTarget.style.color = '#aaa';
              }}
            >
              📣
            </button>
            <button
              onClick={() => onTriggerSampler('siren')}
              className="sampler-btn"
              style={{
                flex: 1,
                height: '45px',
                background: '#333',
                border: '2px solid #555',
                borderRadius: '4px',
                color: '#aaa',
                fontSize: '1.2rem',
                cursor: 'pointer',
                boxShadow: '0 4px 0 #222',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.1s'
              }}
              onMouseDown={(e) => {
                e.currentTarget.style.transform = 'translateY(4px)';
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.color = '#fff';
                e.currentTarget.style.borderColor = '#888';
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 0 #222';
                e.currentTarget.style.color = '#aaa';
                e.currentTarget.style.borderColor = '#555';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 0 #222';
                e.currentTarget.style.color = '#aaa';
              }}
            >
              🚨
            </button>
          </div>

          {/* BELOW: XY PAD */}
          <XYPad onEffectChange={onMasterEffect} />
        </div>

        {/* RIGHT COLUMN: DECK B CONTROLS */}
        <div className="mixer-column">
          {/* EQ Controls Section */}
          <div style={{ display: 'flex', flexDirection: 'column', width: '100%', alignItems: 'center', marginBottom: '10px' }}>
            <EqControl label="HI" value={eqB.high} onChange={(v) => onEqChange('B', 'high', v)} />
            <EqControl label="MID" value={eqB.mid} onChange={(v) => onEqChange('B', 'mid', v)} />
            <EqControl label="LO" value={eqB.low} onChange={(v) => onEqChange('B', 'low', v)} />
          </div>

          {/* Filter B */}
          <div className="control-group">
            <label className="mixer-label">FILTER</label>
            <div className="filter-display">{getFilterDisplay(filterB)}</div>
            <input
              type="range"
              min="0" max="1" step="0.01"
              value={filterB}
              onChange={(e) => onFilterBChange(parseFloat(e.target.value))}
              className="knob-slider-horizontal"
            />
          </div>

          {/* Volume B */}
          <div className="control-group fader-group">
            <div className="fader-track-new">
              <input
                type="range"
                min="0" max="1" step="0.01"
                value={volumeB}
                onChange={(e) => onVolumeBChange(parseFloat(e.target.value))}
                className="vertical-fader-new"
                title={`Volume B: ${Math.round(volumeB * 100)}%`}
              />
            </div>
            <span className="deck-label">B</span>
          </div>
        </div>

      </div>

      {/* 3. FOOTER: CROSSFADER */}
      < div className="mixer-footer" >
        <div className="crossfader-wrapper">
          <div className="xf-labels">
            <span>A</span>
            <div className="xf-icon">///</div>
            <span>B</span>
          </div>
          <input
            type="range"
            min="0" max="1" step="0.01"
            value={crossfader}
            onChange={(e) => onCrossfaderChange(parseFloat(e.target.value))}
            className="crossfader-new"
          />
          <div className="mixer-label tiny" style={{ marginTop: '4px', textAlign: 'center' }}>CROSSFADER</div>
        </div>
      </div >

    </div >
  );
};

// Common EQ Control Component (Defined outside Mixer to prevent re-renders losing focus)
const EqControl = ({ label, value, onChange }) => {
  // Helper for EQ visual value locally if needed, or pass from parent.
  // We can duplicate getEqDisplay logic or just move it out too.
  // Let's duplicate or move getEqDisplay out. moving out is better.
  const getEqDisplay = (val) => {
    if (val === 0) return "KILL";
    if (val === 100) return "FLAT";
    if (val === 200) return "MAX";
    if (val < 100) return "CUT";
    return "BOOST";
  };

  return (
    <div className="control-group" style={{ marginBottom: '5px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', padding: '0 2px' }}>
        <label className="mixer-label medium">{label}</label>
        <span className="mixer-label medium" style={{ color: 'var(--neon-blue)', fontSize: '0.8rem' }}>{getEqDisplay(value)}</span>
      </div>
      <input
        type="range"
        min="0" max="200" step="1"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="knob-slider-horizontal"
        style={{ height: '12px' }}
      />
    </div>
  );
};

export default Mixer;
