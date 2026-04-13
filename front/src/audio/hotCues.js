// audio/hotCues.js — Hot cue pad management

const PAD_COLORS = [
  '#ff0000', '#ff8800', '#ffff00', '#00cc00',
  '#00ccff', '#0066ff', '#9900ff', '#ff00aa'
];

export function setHotCue(deckId, index, bpm) {
  if (!this.hotCues[deckId]) {
    this.hotCues[deckId] = new Array(8).fill(null);
  }
  if (this.hotCues[deckId][index]) return; // already set

  let position = this.getCurrentPosition(deckId);
  if (this.quantizeEnabled[deckId] && bpm) {
    position = this.quantizeToBeat(position, bpm, 'nearest');
  }

  this.hotCues[deckId][index] = {
    position,
    color: PAD_COLORS[index],
  };
}

export function jumpToHotCue(deckId, index) {
  if (!this.hotCues[deckId]?.[index]) return;
  const cue = this.hotCues[deckId][index];
  this.seek(deckId, cue.position / this.getTrackDuration(deckId));
}

export function deleteHotCue(deckId, index) {
  if (!this.hotCues[deckId]) return;
  this.hotCues[deckId][index] = null;
}

export function getHotCues(deckId) {
  return this.hotCues[deckId] || new Array(8).fill(null);
}
