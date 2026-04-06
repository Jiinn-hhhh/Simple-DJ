// utils/music.js — Music theory utilities

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function getShiftedKey(originalKey, originalBpm, masterBpm) {
  if (!originalKey || !originalBpm || !masterBpm) return null;

  let root = originalKey.split(' ')[0];
  if (root.length > 1 && root[1] === 'm') root = root[0];

  const rootIndex = NOTE_NAMES.indexOf(root);
  if (rootIndex === -1) return originalKey;

  const rate = masterBpm / originalBpm;
  const shiftInt = Math.round(12 * Math.log2(rate));

  let newIndex = (rootIndex + shiftInt) % 12;
  if (newIndex < 0) newIndex += 12;

  const newRoot = NOTE_NAMES[newIndex];
  const suffix = originalKey.includes('Major') || originalKey.includes('Maj')
    ? ' Maj'
    : (originalKey.includes('m') || originalKey.includes('Minor') ? 'm' : '');

  return `${newRoot}${suffix} (${shiftInt > 0 ? '+' : ''}${shiftInt})`;
}

export function getPlaybackRate(track, masterBpm) {
  if (!track?.bpm) return 0;
  return masterBpm / track.bpm;
}
