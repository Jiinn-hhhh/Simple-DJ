// utils/music.js — Music theory utilities

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTE_ALIASES = {
  Db: 'C#',
  Eb: 'D#',
  Gb: 'F#',
  Ab: 'G#',
  Bb: 'A#',
};

function parseKeyName(keyName) {
  const parts = String(keyName).trim().split(/\s+/);
  let root = parts[0] || '';
  const modeToken = (parts[1] || '').toLowerCase();
  let mode = '';

  if (/^[A-G](?:#|b)?m$/.test(root)) {
    root = root.slice(0, -1);
    mode = 'minor';
  } else if (['minor', 'min', 'm'].includes(modeToken)) {
    mode = 'minor';
  } else if (['major', 'maj'].includes(modeToken)) {
    mode = 'major';
  }

  return {
    root: NOTE_ALIASES[root] || root,
    mode,
  };
}

export function getShiftedKey(originalKey, originalBpm, masterBpm, halfTime = false) {
  if (!originalKey || !originalBpm || !masterBpm) return null;

  const { root, mode } = parseKeyName(originalKey);

  const rootIndex = NOTE_NAMES.indexOf(root);
  if (rootIndex === -1) return originalKey;

  const beatBpm = halfTime ? originalBpm / 2 : originalBpm;
  const rate = masterBpm / beatBpm;
  const shiftInt = Math.round(12 * Math.log2(rate));

  let newIndex = (rootIndex + shiftInt) % 12;
  if (newIndex < 0) newIndex += 12;

  const newRoot = NOTE_NAMES[newIndex];
  const suffix = mode === 'major' ? ' Maj' : (mode === 'minor' ? 'm' : '');

  return `${newRoot}${suffix} (${shiftInt > 0 ? '+' : ''}${shiftInt})`;
}

export function getPlaybackRate(track, masterBpm, halfTime = false) {
  if (!track?.bpm) return 0;
  const beatBpm = halfTime ? track.bpm / 2 : track.bpm;
  return masterBpm / beatBpm;
}
