export default function ProcessingQueue({ tracks }) {
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
        </div>
      ))}
    </div>
  );
}
