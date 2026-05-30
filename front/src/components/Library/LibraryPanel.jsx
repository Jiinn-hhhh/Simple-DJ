import { useMemo, useState } from 'react';
import TrackItem from './TrackItem';
import UploadArea from './UploadArea';
import ProcessingQueue from './ProcessingQueue';
import ConfirmDialog from './ConfirmDialog';
import './LibraryPanel.css';

export default function LibraryPanel({
  isOpen, onClose, tracks, loading, onUpload, onDelete, onLoadToDeck,
  uploadQueueInfo, onCancelProcessing, onClearQueue
}) {
  const [panelDragging, setPanelDragging] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null); // { type, id, title }
  const [searchQuery, setSearchQuery] = useState('');

  const readyTracks = tracks.filter(t => t.status === 'ready');
  const processingTracks = tracks.filter(t => ['uploading', 'analyzing', 'separating', 'converting'].includes(t.status));
  const errorTracks = tracks.filter(t => t.status === 'error');
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const visibleReadyTracks = useMemo(() => {
    if (!normalizedSearch) return readyTracks;

    return readyTracks.filter((track) => {
      const searchable = [
        track.title,
        track.original_filename,
        track.artist,
        track.key,
        track.bpm ? `${Math.round(track.bpm)} bpm` : '',
        track.duration ? `${Math.floor(track.duration / 60)}:${Math.floor(track.duration % 60).toString().padStart(2, '0')}` : '',
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchable.includes(normalizedSearch);
    });
  }, [readyTracks, normalizedSearch]);

  const queuePending = uploadQueueInfo?.pending || 0;
  const lastError = uploadQueueInfo?.lastError;

  const handlePanelDragOver = (e) => {
    e.preventDefault();
    setPanelDragging(true);
  };
  const handlePanelDragLeave = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setPanelDragging(false);
  };
  const handlePanelDrop = (e) => {
    e.preventDefault();
    setPanelDragging(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('audio/'));
    files.forEach(f => onUpload(f));
  };

  // Confirm dialog handlers
  const handleCancelRequest = (trackId, title) => {
    setConfirmAction({ type: 'cancel', id: trackId, title });
  };
  const handleDeleteRequest = (trackId, title) => {
    setConfirmAction({ type: 'delete', id: trackId, title });
  };
  const handleConfirm = () => {
    if (!confirmAction) return;
    if (confirmAction.type === 'cancel') {
      onCancelProcessing(confirmAction.id);
    } else if (confirmAction.type === 'delete') {
      onDelete(confirmAction.id);
    }
    setConfirmAction(null);
  };
  const handleConfirmCancel = () => setConfirmAction(null);

  return (
    <div
      className={`library-panel ${isOpen ? 'open' : ''} ${panelDragging ? 'panel-dragging' : ''}`}
      onDragOver={handlePanelDragOver}
      onDragLeave={handlePanelDragLeave}
      onDrop={handlePanelDrop}
    >
      {confirmAction && (
        <ConfirmDialog
          message={confirmAction.type === 'cancel'
            ? `Cancel processing "${confirmAction.title}"?`
            : `Delete "${confirmAction.title}"?`}
          confirmLabel={confirmAction.type === 'cancel' ? 'CANCEL IT' : 'DELETE'}
          cancelLabel="KEEP"
          onConfirm={handleConfirm}
          onCancel={handleConfirmCancel}
        />
      )}

      <div className="library-header">
        <h2 className="library-title pixel-font">TRACK LIBRARY</h2>
        <button className="library-close" onClick={onClose}>&times;</button>
      </div>

      <div className="library-search">
        <input
          className="library-search-input"
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="SEARCH TRACKS"
          aria-label="Search tracks"
          autoComplete="off"
        />
        {searchQuery && (
          <button
            className="library-search-clear"
            type="button"
            onClick={() => setSearchQuery('')}
            aria-label="Clear search"
          >
            &times;
          </button>
        )}
      </div>

      <UploadArea onUpload={onUpload} />

      {queuePending > 1 && (
        <div className="upload-queue-status">
          <span className="processing-spinner">&#9654;</span>
          {' '}Queued: {queuePending - 1} waiting
          {onClearQueue && (
            <button className="clear-queue-btn" onClick={onClearQueue}>CLEAR</button>
          )}
        </div>
      )}

      {lastError && (
        <div className="upload-error-toast">{lastError}</div>
      )}

      {processingTracks.length > 0 && (
        <ProcessingQueue tracks={processingTracks} onCancel={handleCancelRequest} />
      )}

      {errorTracks.length > 0 && (
        <div className="library-section">
          <div className="library-section-label">ERRORS</div>
          {errorTracks.map(track => (
            <TrackItem key={track.id} track={track} onDelete={handleDeleteRequest} onLoadToDeck={onLoadToDeck} />
          ))}
        </div>
      )}

      <div className="library-tracks">
        {loading ? (
          <div className="library-empty pixel-font">LOADING...</div>
        ) : readyTracks.length === 0 ? (
          <div className="library-empty">No tracks yet. Upload some music!</div>
        ) : visibleReadyTracks.length === 0 ? (
          <div className="library-empty">No matching tracks.</div>
        ) : (
          visibleReadyTracks.map(track => (
            <TrackItem key={track.id} track={track} onDelete={handleDeleteRequest} onLoadToDeck={onLoadToDeck} />
          ))
        )}
      </div>
    </div>
  );
}
