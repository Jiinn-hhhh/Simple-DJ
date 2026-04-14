import './RecordBar.css';

export default function RecordBar({
  isRecordingAudio, isRecordingVideo, recordingTime, countdown,
  onStartAudio, onStopAudio,
  onStartVideo, onStopVideo,
  onCancel,
}) {
  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const isRecording = isRecordingAudio || isRecordingVideo;
  const isCountingDown = countdown != null;

  return (
    <div className="record-bar">
      {/* Inline countdown */}
      {isCountingDown && (
        <span className="record-countdown">{countdown}</span>
      )}

      {isRecording && (
        <div className="record-indicator">
          <span className="record-dot" />
          <span className="record-time">{formatTime(recordingTime)}</span>
        </div>
      )}

      {!isRecording && !isCountingDown ? (
        <>
          <button className="record-btn audio" onClick={onStartAudio} title="Mix audio recording (.wav)">
            AUDIO REC
          </button>
          <button className="record-btn video" onClick={onStartVideo} title="Screen + audio recording (.mp4)">
            VIDEO REC
          </button>
        </>
      ) : (
        <button className="record-btn stop" onClick={isCountingDown ? onCancel : (isRecordingAudio ? onStopAudio : onStopVideo)}>
          {isCountingDown ? 'CANCEL' : 'STOP'}
        </button>
      )}
    </div>
  );
}
