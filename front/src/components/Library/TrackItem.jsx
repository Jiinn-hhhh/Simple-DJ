export default function TrackItem({ track, onDelete, onLoadToDeck }) {
  const formatDuration = (seconds) => {
    if (!seconds) return '--:--';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="track-item">
      <div className="track-item-title">{track.title}</div>
      <div className="track-item-meta">
        {track.bpm && <span>{Math.round(track.bpm)} BPM</span>}
        {track.key && <span>{track.key}</span>}
        {track.duration && <span>{formatDuration(track.duration)}</span>}
      </div>
      {track.status === 'error' && (
        <div className="track-item-error">{track.error_message || 'Processing failed'}</div>
      )}
      <div className="track-item-actions">
        {track.status === 'ready' && (
          <>
            <button className="track-deck-btn" onClick={() => onLoadToDeck('A', track)}>A</button>
            <button className="track-deck-btn" onClick={() => onLoadToDeck('B', track)}>B</button>
          </>
        )}
        <button className="track-delete-btn" onClick={() => onDelete(track.id)}>DEL</button>
      </div>
    </div>
  );
}
