import { useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function TrackItem({ track, onDelete, onLoadToDeck }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(track.title);

  const formatDuration = (seconds) => {
    if (!seconds) return '--:--';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleTitleSave = async () => {
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== track.title) {
      await supabase.from('tracks').update({ title: trimmed }).eq('id', track.id);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleTitleSave();
    if (e.key === 'Escape') { setEditTitle(track.title); setIsEditing(false); }
  };

  const handleDragStart = (e) => {
    if (track.status !== 'ready') { e.preventDefault(); return; }
    e.dataTransfer.setData('application/x-library-track', JSON.stringify(track));
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div
      className={`track-item ${track.status === 'ready' ? 'draggable' : ''}`}
      draggable={track.status === 'ready'}
      onDragStart={handleDragStart}
    >
      <div className="track-item-row">
        {isEditing ? (
          <input
            className="track-item-title-input"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={handleTitleSave}
            onKeyDown={handleKeyDown}
            autoFocus
          />
        ) : (
          <div className="track-item-title" onDoubleClick={() => setIsEditing(true)}>
            {track.title}
          </div>
        )}
        <button className="track-x-btn" onClick={() => onDelete(track.id, track.title)} title="Delete">&times;</button>
      </div>
      <div className="track-item-meta">
        {track.bpm && <span>{Math.round(track.bpm)} BPM</span>}
        {track.key && <span>{track.key}</span>}
        {track.duration && <span>{formatDuration(track.duration)}</span>}
      </div>
      {track.status === 'error' && (
        <div className="track-item-error">{track.error_message || 'Processing failed'}</div>
      )}
      {track.status === 'ready' && (
        <div className="track-deck-btns">
          <button className="track-deck-btn" onClick={() => onLoadToDeck('A', track)}>DECK A</button>
          <button className="track-deck-btn" onClick={() => onLoadToDeck('B', track)}>DECK B</button>
        </div>
      )}
    </div>
  );
}
