// audio/slipMode.js — Slip mode: virtual position tracking

export function setSlipMode(deckId, enabled) {
  this.slipMode[deckId] = enabled;
  if (!enabled) {
    this.slipActive[deckId] = false;
    delete this.slipVirtualStart[deckId];
    delete this.slipVirtualOffset[deckId];
    delete this.slipSavedRate[deckId];
  }
}

export function beginSlipSession(deckId) {
  if (!this.slipMode[deckId] || !this.isPlaying[deckId] || !this.audioContext) return;

  this.slipActive[deckId] = true;
  this.slipVirtualStart[deckId] = this.audioContext.currentTime;
  this.slipVirtualOffset[deckId] = this.getCurrentPosition(deckId);
  this.slipSavedRate[deckId] = this.playbackRates[deckId] || 1.0;
}

export function isSlipActive(deckId) {
  return Boolean(this.slipMode[deckId] && this.slipActive[deckId] && this.slipVirtualStart[deckId] != null);
}

export function getVirtualPosition(deckId) {
  if (!this.isSlipActive(deckId)) {
    return this.getCurrentPosition(deckId);
  }
  const elapsed = this.audioContext.currentTime - this.slipVirtualStart[deckId];
  const rate = this.slipSavedRate[deckId] || 1.0;
  const pos = (this.slipVirtualOffset[deckId] || 0) + elapsed * rate;
  const duration = this.getTrackDuration(deckId);
  return Math.max(0, Math.min(duration, pos));
}

export function slipReturn(deckId) {
  if (!this.isSlipActive(deckId)) return;
  const virtualPos = this.getVirtualPosition(deckId);
  this.slipActive[deckId] = false;
  delete this.slipVirtualStart[deckId];
  delete this.slipVirtualOffset[deckId];
  delete this.slipSavedRate[deckId];
  this.pauseOffsets[deckId] = virtualPos;
  this._resumePlayback(deckId, virtualPos);
}
