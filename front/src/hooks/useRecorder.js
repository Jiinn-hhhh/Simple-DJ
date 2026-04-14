// hooks/useRecorder.js — Audio (WAV) & Video (MP4/WebM) recording with countdown

import { useState, useRef, useCallback } from 'react';

function encodeWav(samples, sampleRate, numChannels) {
  const bytesPerSample = 2; // 16-bit
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // Convert Float32 to Int16
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function useRecorder(audioPlayerRef) {
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [countdown, setCountdown] = useState(null); // 3, 2, 1, null

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);
  const audioCaptureRef = useRef(null);
  const pcmBuffersRef = useRef([]);
  const countdownTimerRef = useRef(null);
  const videoScreenStreamRef = useRef(null);
  const videoMimeTypeRef = useRef('video/webm');
  const videoFileExtRef = useRef('webm');
  const videoStartedAtRef = useRef(0);

  const startTimer = () => {
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setRecordingTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 500);
  };

  const stopTimer = () => {
    clearInterval(timerRef.current);
    timerRef.current = null;
    setRecordingTime(0);
  };

  const clearCountdown = useCallback(() => {
    if (!countdownTimerRef.current) return false;
    clearInterval(countdownTimerRef.current);
    countdownTimerRef.current = null;
    setCountdown(null);
    return true;
  }, []);

  const ensureAudioEngine = useCallback(async () => {
    const ap = audioPlayerRef.current;
    if (!ap) return null;
    await ap.init();
    ap.initMasterBus();
    return ap;
  }, [audioPlayerRef]);

  // --- Countdown helper ---
  const runCountdown = useCallback((onComplete) => {
    let count = 3;
    setCountdown(count);
    countdownTimerRef.current = setInterval(() => {
      count--;
      if (count <= 0) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
        setCountdown(null);
        Promise.resolve(onComplete()).catch((err) => {
          console.error('Recording start error:', err);
        });
      } else {
        setCountdown(count);
      }
    }, 1000);
  }, []);

  // --- Audio Recording (WAV) ---
  const _startAudioRecordingImpl = useCallback(async () => {
    const ap = await ensureAudioEngine();
    if (!ap?.audioContext || !ap?.masterNodes) {
      console.warn('Audio engine not ready');
      return;
    }

    // Prevent double-start
    if (audioCaptureRef.current) return;

    const ctx = ap.audioContext;
    const bufferSize = 4096;
    const scriptNode = ctx.createScriptProcessor(bufferSize, 2, 2);
    const silentSink = ctx.createGain();
    silentSink.gain.value = 0;
    pcmBuffersRef.current = [];

    scriptNode.onaudioprocess = (e) => {
      const left = e.inputBuffer.getChannelData(0);
      const right = e.inputBuffer.getChannelData(1);
      // Interleave L/R
      const interleaved = new Float32Array(left.length * 2);
      for (let i = 0; i < left.length; i++) {
        interleaved[i * 2] = left[i];
        interleaved[i * 2 + 1] = right[i];
      }
      pcmBuffersRef.current.push(interleaved);
    };

    // Tap from the master stream destination (no double-output)
    const streamDest = ap.masterNodes.streamDest;
    let mediaSource = null;
    if (streamDest) {
      const mediaStream = streamDest.stream;
      mediaSource = ctx.createMediaStreamSource(mediaStream);
      mediaSource.connect(scriptNode);
    } else {
      // Fallback: direct tap (may cause double output)
      ap.masterNodes.filter.connect(scriptNode);
    }

    // Keep the processor alive without audible output.
    scriptNode.connect(silentSink);
    silentSink.connect(ctx.destination);
    audioCaptureRef.current = { scriptNode, mediaSource, silentSink };

    setIsRecordingAudio(true);
    startTimer();
  }, [ensureAudioEngine]);

  const startAudioRecording = useCallback(() => {
    // Guard: already recording or countdown in progress
    if (isRecordingAudio || countdown != null) return;
    void ensureAudioEngine().catch((err) => {
      console.error('Audio engine init failed:', err);
    });
    runCountdown(_startAudioRecordingImpl);
  }, [isRecordingAudio, countdown, runCountdown, _startAudioRecordingImpl, ensureAudioEngine]);

  const stopAudioRecording = useCallback(() => {
    // Cancel countdown if in progress
    if (clearCountdown()) {
      return;
    }

    if (!audioCaptureRef.current) return;

    const ap = audioPlayerRef.current;
    try {
      if (audioCaptureRef.current.mediaSource) {
        audioCaptureRef.current.mediaSource.disconnect();
      }
      audioCaptureRef.current.scriptNode.disconnect();
      audioCaptureRef.current.silentSink.disconnect();
    } catch {}
    audioCaptureRef.current = null;

    // Only encode/download if we actually recorded data
    if (pcmBuffersRef.current.length === 0) {
      setIsRecordingAudio(false);
      stopTimer();
      return;
    }

    // Merge all PCM chunks and encode WAV
    const totalLength = pcmBuffersRef.current.reduce((sum, b) => sum + b.length, 0);
    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const buf of pcmBuffersRef.current) {
      merged.set(buf, offset);
      offset += buf.length;
    }
    pcmBuffersRef.current = [];

    const sampleRate = ap?.audioContext?.sampleRate || 44100;
    const wavBlob = encodeWav(merged, sampleRate, 2);
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    download(wavBlob, `SimpleDJ-mix-${timestamp}.wav`);

    setIsRecordingAudio(false);
    stopTimer();
  }, [audioPlayerRef, clearCountdown]);

  // --- Video Recording (MP4/WebM) ---
  const _startVideoRecordingImpl = useCallback(async () => {
    try {
      await ensureAudioEngine();

      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'browser' },
        audio: false,
      });
      const videoTrack = screenStream.getVideoTracks()[0];
      if (!videoTrack) {
        screenStream.getTracks().forEach((t) => t.stop());
        return;
      }

      // Combine screen video + DJ audio
      const audioStream = audioPlayerRef.current?.getOutputStream();
      const tracks = [...screenStream.getVideoTracks()];
      if (audioStream) {
        audioStream.getAudioTracks().forEach(t => tracks.push(t));
      }

      const combinedStream = new MediaStream(tracks);
      chunksRef.current = [];

      // Try MP4 first (Safari), fall back to WebM
      let mimeType = 'video/webm;codecs=vp9,opus';
      let fileExt = 'webm';
      if (MediaRecorder.isTypeSupported('video/mp4')) {
        mimeType = 'video/mp4';
      } else if (MediaRecorder.isTypeSupported('video/webm;codecs=h264,opus')) {
        mimeType = 'video/webm;codecs=h264,opus';
      } else if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm';
      }

      if (mimeType === 'video/mp4') {
        fileExt = 'mp4';
      }

      const recorder = new MediaRecorder(combinedStream, mimeType ? { mimeType } : undefined);
      videoMimeTypeRef.current = mimeType || recorder.mimeType || 'video/webm';
      videoFileExtRef.current = fileExt;
      videoScreenStreamRef.current = screenStream;
      videoStartedAtRef.current = Date.now();
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const totalBytes = chunksRef.current.reduce((sum, chunk) => sum + chunk.size, 0);
        const elapsedMs = videoStartedAtRef.current ? Date.now() - videoStartedAtRef.current : 0;

        if (totalBytes > 2048 && elapsedMs > 300) {
          const blob = new Blob(chunksRef.current, { type: videoMimeTypeRef.current });
          const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
          download(blob, `SimpleDJ-session-${timestamp}.${videoFileExtRef.current}`);
        }

        chunksRef.current = [];
        videoStartedAtRef.current = 0;
        videoScreenStreamRef.current?.getTracks().forEach((t) => t.stop());
        videoScreenStreamRef.current = null;
        mediaRecorderRef.current = null;
        setIsRecordingVideo(false);
        stopTimer();
      };

      videoTrack.onended = () => {
        if (mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      };

      recorder.start(100);
      setIsRecordingVideo(true);
      startTimer();
    } catch (err) {
      console.error('Screen recording error:', err);
      setIsRecordingVideo(false);
      stopTimer();
    }
  }, [audioPlayerRef, ensureAudioEngine, stopTimer]);

  const startVideoRecording = useCallback(() => {
    if (isRecordingVideo || countdown != null) return;
    void ensureAudioEngine().catch((err) => {
      console.error('Audio engine init failed:', err);
    });
    runCountdown(_startVideoRecordingImpl);
  }, [isRecordingVideo, countdown, runCountdown, _startVideoRecordingImpl, ensureAudioEngine]);

  const stopVideoRecording = useCallback(() => {
    if (clearCountdown()) {
      return;
    }

    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    } else {
      videoScreenStreamRef.current?.getTracks().forEach((t) => t.stop());
      videoScreenStreamRef.current = null;
      mediaRecorderRef.current = null;
      setIsRecordingVideo(false);
      stopTimer();
    }
  }, [clearCountdown]);

  const cancelRecordingCountdown = useCallback(() => {
    clearCountdown();
  }, [clearCountdown]);

  return {
    isRecordingAudio, isRecordingVideo, recordingTime, countdown,
    startAudioRecording, stopAudioRecording,
    startVideoRecording, stopVideoRecording,
    cancelRecordingCountdown,
  };
}
