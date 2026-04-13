export default function ProcessingQueue({ tracks, onCancel }) {
  const statusLabels = {
    uploading: 'Uploading',
    analyzing: 'Analyzing',
    separating: 'Separating',
    converting: 'Converting',
  };

  return (
    <div className="processing-queue">
      {tracks.map(track => (
        <div key={track.id} className="processing-item">
          <span className={`processing-status ${track.status}`}>
            <span className="processing-spinner">&#9654;</span> {statusLabels[track.status] || track.status}...
          </span>
          <span className="processing-title">{track.title}</span>
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
  );
}
