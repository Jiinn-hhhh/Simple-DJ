import TrackItem from './TrackItem';
import UploadArea from './UploadArea';
import ProcessingQueue from './ProcessingQueue';
import './LibraryPanel.css';

export default function LibraryPanel({ isOpen, onClose, tracks, loading, onUpload, onDelete, onLoadToDeck }) {
  // Filter tracks by status
  const readyTracks = tracks.filter(t => t.status === 'ready');
  const processingTracks = tracks.filter(t => ['uploading', 'analyzing', 'separating', 'converting'].includes(t.status));
  const errorTracks = tracks.filter(t => t.status === 'error');

  return (
    <div className={`library-panel ${isOpen ? 'open' : ''}`}>
      <div className="library-header">
        <h2 className="library-title pixel-font">TRACK LIBRARY</h2>
        <button className="library-close" onClick={onClose}>&times;</button>
      </div>

      <UploadArea onUpload={onUpload} />

      {processingTracks.length > 0 && (
        <ProcessingQueue tracks={processingTracks} />
      )}

      {errorTracks.length > 0 && (
        <div className="library-section">
          <div className="library-section-label">ERRORS</div>
          {errorTracks.map(track => (
            <TrackItem key={track.id} track={track} onDelete={onDelete} onLoadToDeck={onLoadToDeck} />
          ))}
        </div>
      )}

      <div className="library-tracks">
        {loading ? (
          <div className="library-empty pixel-font">LOADING...</div>
        ) : readyTracks.length === 0 ? (
          <div className="library-empty">No tracks yet. Upload some music!</div>
        ) : (
          readyTracks.map(track => (
            <TrackItem key={track.id} track={track} onDelete={onDelete} onLoadToDeck={onLoadToDeck} />
          ))
        )}
      </div>
    </div>
  );
}
