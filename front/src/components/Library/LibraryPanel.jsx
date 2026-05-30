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
  const [processingCollapsed, setProcessingCollapsed] = useState(true);
  const [sortKey, setSortKey] = useState('artist');
  const [sortDirection, setSortDirection] = useState('asc');

  const readyTracks = tracks.filter(t => t.status === 'ready');
  const processingTracks = tracks.filter(t => ['uploading', 'analyzing', 'separating', 'converting'].includes(t.status));
  const errorTracks = tracks.filter(t => t.status === 'error');
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const sortedReadyTracks = useMemo(() => {
    const filteredTracks = normalizedSearch ? readyTracks.filter((track) => {
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
    }) : readyTracks;

    const direction = sortDirection === 'asc' ? 1 : -1;

    return [...filteredTracks].sort((a, b) => {
      if (sortKey === 'bpm') {
        const bpmA = a.bpm !== null && a.bpm !== undefined && Number.isFinite(Number(a.bpm)) ? Number(a.bpm) : null;
        const bpmB = b.bpm !== null && b.bpm !== undefined && Number.isFinite(Number(b.bpm)) ? Number(b.bpm) : null;

        if (bpmA === null && bpmB !== null) return 1;
        if (bpmA !== null && bpmB === null) return -1;
        if (bpmA !== null && bpmB !== null && bpmA !== bpmB) {
          return (bpmA - bpmB) * direction;
        }
      } else {
        const valueA = (sortKey === 'artist' ? a.artist : a.title) || '';
        const valueB = (sortKey === 'artist' ? b.artist : b.title) || '';
        const compared = valueA.localeCompare(valueB, undefined, {
          numeric: true,
          sensitivity: 'base',
        });
        if (compared !== 0) return compared * direction;
      }

      const artistCompared = (a.artist || '').localeCompare(b.artist || '', undefined, {
        numeric: true,
        sensitivity: 'base',
      });
      if (artistCompared !== 0) return artistCompared;

      return (a.title || a.original_filename || '').localeCompare(
        b.title || b.original_filename || '',
        undefined,
        { numeric: true, sensitivity: 'base' }
      );
    });
  }, [readyTracks, normalizedSearch, sortKey, sortDirection]);

  const handleSortClick = (key) => {
    if (sortKey === key) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
      return;
    }

    setSortKey(key);
    setSortDirection('asc');
  };

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

      <div className="library-sort" role="group" aria-label="Sort tracks">
        {[
          ['artist', 'ARTIST'],
          ['title', 'TITLE'],
          ['bpm', 'BPM'],
        ].map(([key, label]) => (
          <button
            key={key}
            className={`library-sort-btn ${sortKey === key ? 'active' : ''}`}
            type="button"
            onClick={() => handleSortClick(key)}
            aria-pressed={sortKey === key}
          >
            <span>{label}</span>
            {sortKey === key && (
              <span className="library-sort-direction">
                {sortDirection === 'asc' ? 'UP' : 'DN'}
              </span>
            )}
          </button>
        ))}
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
        <ProcessingQueue
          tracks={processingTracks}
          collapsed={processingCollapsed}
          onToggle={() => setProcessingCollapsed(prev => !prev)}
          onCancel={handleCancelRequest}
        />
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
        ) : sortedReadyTracks.length === 0 ? (
          <div className="library-empty">No matching tracks.</div>
        ) : (
          sortedReadyTracks.map(track => (
            <TrackItem key={track.id} track={track} onDelete={handleDeleteRequest} onLoadToDeck={onLoadToDeck} />
          ))
        )}
      </div>
    </div>
  );
}
