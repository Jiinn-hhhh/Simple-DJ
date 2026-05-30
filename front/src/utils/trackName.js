export function parseTrackNameFromFilename(filename = '') {
  const baseName = filename
    .split(/[\\/]/)
    .pop()
    .replace(/\.[^.]+$/, '')
    .trim();

  const match = baseName.match(/^(.+?)\s+-\s+(.+)$/);
  if (!match) {
    return { artist: null, title: baseName || 'Untitled Track' };
  }

  const artist = match[1].trim();
  const title = match[2].trim();

  return {
    artist: artist || null,
    title: title || baseName || 'Untitled Track',
  };
}

export function getTrackDisplayName(track) {
  if (!track) return 'TRACK';

  const title = (track.title || '').trim();
  const artist = (track.artist || '').trim();

  if (artist && title) return `${artist} - ${title}`;
  return title || track.original_filename || 'TRACK';
}
