import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { getTrackDisplayName } from '../../utils/trackName';

export default function TrackItem({ track, onDelete, onLoadToDeck }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(track.title);
  const [editArtist, setEditArtist] = useState(track.artist || '');

  useEffect(() => {
    setEditTitle(track.title || '');
    setEditArtist(track.artist || '');
  }, [track.title, track.artist]);

  const formatDuration = (seconds) => {
    if (!seconds) return '--:--';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleTitleSave = async () => {
    const trimmedTitle = editTitle.trim();
    const trimmedArtist = editArtist.trim();
    const nextArtist = trimmedArtist || null;
    const titleChanged = trimmedTitle && trimmedTitle !== track.title;
    const artistChanged = nextArtist !== (track.artist || null);

    if (titleChanged || artistChanged) {
      await supabase
        .from('tracks')
        .update({
          ...(titleChanged ? { title: trimmedTitle } : {}),
          ...(artistChanged ? { artist: nextArtist } : {}),
        })
        .eq('id', track.id);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleTitleSave();
    if (e.key === 'Escape') {
      setEditTitle(track.title || '');
      setEditArtist(track.artist || '');
      setIsEditing(false);
    }
  };

  const handleEditBlur = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) handleTitleSave();
  };

  const handleDragStart = (e) => {
    if (track.status !== 'ready') { e.preventDefault(); return; }
    e.dataTransfer.setData('application/x-library-track', JSON.stringify(track));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const displayName = getTrackDisplayName(track);

  return (
    <div
      className={`track-item ${track.status === 'ready' ? 'draggable' : ''}`}
      draggable={track.status === 'ready'}
      onDragStart={handleDragStart}
    >
      <div className="track-info">
        <div className="track-item-row">
          {isEditing ? (
            <div className="track-edit-fields" onBlur={handleEditBlur}>
              <input
                className="track-item-title-input"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Title"
                autoFocus
              />
              <input
                className="track-item-artist-input"
                value={editArtist}
                onChange={(e) => setEditArtist(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Artist"
              />
            </div>
          ) : (
            <div className="track-title-stack" onDoubleClick={() => setIsEditing(true)}>
              <div className="track-item-title">{track.title}</div>
              {track.artist && <div className="track-item-artist">{track.artist}</div>}
            </div>
          )}
          <button className="track-x-btn" onClick={() => onDelete(track.id, displayName)} title="Delete">&times;</button>
        </div>
        <div className="track-item-meta">
          {track.bpm && <span>{Math.round(track.bpm)} BPM</span>}
          {track.key && <span>{track.key}</span>}
          {track.duration && <span>{formatDuration(track.duration)}</span>}
        </div>
        {track.status === 'error' && (
          <div className="track-item-error">{track.error_message || 'Processing failed'}</div>
        )}
      </div>
      {track.status === 'ready' && (
        <div className="track-deck-btns">
          <button className="track-deck-btn deck-btn-a" onClick={() => onLoadToDeck('A', track)}>A</button>
          <button className="track-deck-btn deck-btn-b" onClick={() => onLoadToDeck('B', track)}>B</button>
        </div>
      )}
    </div>
  );
}
