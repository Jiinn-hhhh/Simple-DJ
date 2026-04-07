import './RecordBar.css';

export default function RecordBar({
  isRecordingAudio, isRecordingVideo, recordingTime,
  onStartAudio, onStopAudio,
  onStartVideo, onStopVideo,
}) {
  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const isRecording = isRecordingAudio || isRecordingVideo;

  return (
    <div className="record-bar">
      {isRecording && (
        <div className="record-indicator">
          <span className="record-dot" />
          <span className="record-time">{formatTime(recordingTime)}</span>
        </div>
      )}

      {!isRecording ? (
        <>
          <button className="record-btn audio" onClick={onStartAudio} title="Record audio mix">
            REC
          </button>
          <button className="record-btn video" onClick={onStartVideo} title="Record screen + audio">
            SCREEN
          </button>
        </>
      ) : (
        <button className="record-btn stop" onClick={isRecordingAudio ? onStopAudio : onStopVideo}>
          STOP
        </button>
      )}
    </div>
  );
}
