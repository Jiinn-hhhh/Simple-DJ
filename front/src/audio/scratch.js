// audio/scratch.js — Vinyl scratch system

export function startScratch(deckId) {
  this._scratchState = this._scratchState || {};
  const pos = this.getCurrentPosition(deckId);
  const savedRate = this.playbackRates[deckId] || 1.0;

  this.stop(deckId);

  this._scratchState[deckId] = {
    active: true,
    position: pos,
    savedRate,
    direction: 'forward',
  };

  this._startScratchSources(deckId, pos, 'forward');
}

export function _stopScratchSources(deckId) {
  if (this._scratchSources?.[deckId]) {
    Object.values(this._scratchSources[deckId]).forEach(s => {
      try { s.stop(); } catch {}
    });
    this._scratchSources[deckId] = {};
  }
}

export function _startScratchSources(deckId, offset, direction) {
  this._stopScratchSources(deckId);
  if (!this.audioBuffers[deckId] || !this.audioContext) return;
  this.setupTrackGraph(deckId);

  this._scratchSources = this._scratchSources || {};
  this._scratchSources[deckId] = {};

  const buffers = direction === 'forward'
    ? this.audioBuffers[deckId]
    : (this.reversedBuffers[deckId] || this.audioBuffers[deckId]);

  Object.entries(buffers).forEach(([stemName, buffer]) => {
    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = 0.001;

    const stemGain = this.audioContext.createGain();
    const isMuted = this.stemMuteStates[deckId]?.[stemName];
    stemGain.gain.value = isMuted ? 0 : 1;
    source.connect(stemGain);
    stemGain.connect(this.trackGainNodes[deckId]);

    let safeOffset;
    if (direction === 'reverse') {
      safeOffset = Math.max(0, Math.min(buffer.duration - 0.01, buffer.duration - offset));
    } else {
      safeOffset = Math.max(0, Math.min(buffer.duration - 0.01, offset));
    }
    source.start(0, safeOffset);
    this._scratchSources[deckId][stemName] = source;
  });
}

export function updateScratch(deckId, angleDelta) {
  if (!this._scratchState?.[deckId]?.active) return;
  const state = this._scratchState[deckId];

  const rawRate = angleDelta * 25;
  const absRate = Math.min(8, Math.abs(rawRate));
  const newDirection = rawRate >= 0 ? 'forward' : 'reverse';

  if (newDirection !== state.direction) {
    state.direction = newDirection;
    this._startScratchSources(deckId, state.position, newDirection);
  }

  const finalRate = absRate < 0.05 ? 0.001 : absRate;
  if (this._scratchSources?.[deckId]) {
    Object.values(this._scratchSources[deckId]).forEach(source => {
      try { source.playbackRate.setValueAtTime(finalRate, this.audioContext.currentTime); } catch {}
    });
  }

  const duration = this.getTrackDuration(deckId);
  const posDelta = (angleDelta / (2 * Math.PI)) * 2.0;
  state.position = Math.max(0, Math.min(duration, state.position + posDelta));
}

export function endScratch(deckId, bpm) {
  if (!this._scratchState?.[deckId]?.active) return;
  const state = this._scratchState[deckId];
  state.active = false;

  this._stopScratchSources(deckId);

  if (this.slipMode[deckId]) {
    this.slipReturn(deckId);
    return;
  }

  let resumePos = state.position;
  if (bpm && bpm > 0) {
    const beatLength = 60 / bpm;
    resumePos = Math.round(resumePos / beatLength) * beatLength;
    const duration = this.getTrackDuration(deckId);
    resumePos = Math.max(0, Math.min(duration, resumePos));
  }

  this.pauseOffsets[deckId] = resumePos;
  this._resumePlayback(deckId, resumePos);
}
