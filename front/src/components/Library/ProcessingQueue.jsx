export default function ProcessingQueue({ tracks, collapsed = false, onToggle, onCancel }) {
  const statusLabels = {
    uploading: 'Uploading',
    analyzing: 'Analyzing',
    separating: 'Separating',
    converting: 'Converting',
  };

  const counts = tracks.reduce((acc, track) => {
    acc[track.status] = (acc[track.status] || 0) + 1;
    return acc;
  }, {});
  const activeTrack = tracks.find(track => track.status !== 'uploading') || tracks[0];
  const activeLabel = activeTrack
    ? statusLabels[activeTrack.status] || activeTrack.status
    : 'Processing';
  const activeTitle = activeTrack
    ? [activeTrack.artist, activeTrack.title].filter(Boolean).join(' - ')
    : '';
  const waitingCount = counts.uploading || 0;

  return (
    <div className={`processing-queue ${collapsed ? 'collapsed' : ''}`}>
      <button
        className="processing-queue-header"
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
      >
        <span className={`processing-status ${activeTrack?.status || 'uploading'}`}>
          <span className="processing-spinner">&#9654;</span> {activeLabel}...
        </span>
        <span className="processing-summary">
          <span className="processing-summary-title">{activeTitle}</span>
          <span className="processing-summary-meta">
            {tracks.length} processing
            {waitingCount > 0 ? ` / ${waitingCount} waiting` : ''}
          </span>
        </span>
        <span className="processing-toggle-icon" aria-hidden="true">
          {collapsed ? '+' : '-'}
        </span>
      </button>

      {!collapsed && (
        <div className="processing-queue-list">
          {tracks.map(track => (
            <div key={track.id} className="processing-item">
              <span className={`processing-status ${track.status}`}>
                <span className="processing-spinner">&#9654;</span> {statusLabels[track.status] || track.status}...
              </span>
              <span className="processing-title">
                {track.title}
                {track.artist && <span className="processing-artist">{track.artist}</span>}
              </span>
              {onCancel && (
                <button
                  className="processing-cancel-btn"
                  onClick={() => onCancel(track.id, track.title)}
                  title="Cancel"
                >
                  &times;
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
