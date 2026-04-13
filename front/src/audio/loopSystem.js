// audio/loopSystem.js — Loop in/out, loop roll

export function startLoopRoll(deckId, beats, bpm) {
  if (!bpm || bpm <= 0) return;

  if (!this.slipMode[deckId]) {
    this.setSlipMode(deckId, true);
    this._slipAutoEnabled = this._slipAutoEnabled || {};
    this._slipAutoEnabled[deckId] = true;
  }
  this.loopRollActive[deckId] = true;

  const beatDuration = 60 / bpm;
  const currentPos = this.getCurrentPosition(deckId);
  const loopStart = this.quantizeToBeat(currentPos, bpm, 'floor');
  const loopEnd = loopStart + (beats * beatDuration);

  if (!this.loopPoints[deckId]) this.loopPoints[deckId] = {};
  this.loopPoints[deckId].start = loopStart;

  if (this.sourceNodes[deckId]) {
    Object.values(this.sourceNodes[deckId]).forEach(source => {
      if (!source || !source.buffer) return;
      const safeStart = Math.max(0, loopStart);
      const safeEnd = Math.min(source.buffer.duration, loopEnd);
      if (safeEnd <= safeStart) return;
      source.loopStart = safeStart;
      source.loopEnd = safeEnd;
      source.loop = true;
    });
  }
  this.loopPoints[deckId].active = true;
}

export function endLoopRoll(deckId) {
  if (!this.loopRollActive[deckId]) return;

  this._forEachSource(deckId, source => { if (source) source.loop = false; });
  if (this.loopPoints[deckId]) {
    delete this.loopPoints[deckId];
  }

  this.slipReturn(deckId);

  this.loopRollActive[deckId] = false;
  if (this._slipAutoEnabled?.[deckId]) {
    this.slipMode[deckId] = false;
    this._slipAutoEnabled[deckId] = false;
  }
}

export function setLoopIn(deckId, trackBpm) {
  if (!this.sourceNodes?.[deckId]) return;
  if (this.startTimes[deckId] === null) return;

  const position = this.getCurrentPosition(deckId);
  const quantized = this.quantizeToBeat(position, trackBpm, 'nearest');

  if (!this.loopPoints) this.loopPoints = {};
  if (!this.loopPoints[deckId]) this.loopPoints[deckId] = {};
  this.loopPoints[deckId].start = quantized;
}

export function setLoopOut(deckId, trackBpm) {
  if (!this.sourceNodes?.[deckId] || !this.loopPoints?.[deckId]) return;

  const position = this.getCurrentPosition(deckId);
  let quantized = this.quantizeToBeat(position, trackBpm, 'nearest');

  const start = this.loopPoints[deckId].start;
  if (quantized <= start) {
    quantized = start + (60 / trackBpm); // at least 1 beat
  }

  Object.values(this.sourceNodes[deckId]).forEach(source => {
    if (!source || !source.buffer) return;
    const safeStart = Math.max(0, start);
    const safeEnd = Math.min(source.buffer.duration, quantized);
    if (safeEnd <= safeStart) return;
    source.loopStart = safeStart;
    source.loopEnd = safeEnd;
    source.loop = true;
  });

  this.loopPoints[deckId].active = true;
}

export function exitLoop(deckId) {
  if (!this.sourceNodes?.[deckId]) return;

  const loopInfo = this.loopPoints?.[deckId];
  if (loopInfo && loopInfo.active) {
    const source = Object.values(this.sourceNodes[deckId])[0];
    if (source && source.loop) {
      const loopStart = source.loopStart;
      const loopEnd = source.loopEnd;
      const loopDuration = loopEnd - loopStart;

      const rate = this.playbackRates?.[deckId] || 1.0;
      const elapsed = this.audioContext.currentTime - this.startTimes[deckId];
      const bufferLinearTime = (this.pauseOffsets[deckId] || 0) + (elapsed * rate);

      let actualPosition = bufferLinearTime;
      if (bufferLinearTime > loopStart) {
        actualPosition = loopStart + ((bufferLinearTime - loopStart) % loopDuration);
      }

      this.pauseOffsets[deckId] = actualPosition;
      this.startTimes[deckId] = this.audioContext.currentTime;
    }
  }

  this._forEachSource(deckId, source => { if (source) source.loop = false; });

  if (this.loopPoints?.[deckId]) {
    delete this.loopPoints[deckId];
  }

  if (this.slipMode[deckId] && !this.loopRollActive[deckId]) {
    this.slipReturn(deckId);
  }
}
