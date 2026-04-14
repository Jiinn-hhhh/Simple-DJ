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
  const [videoStatusMessage, setVideoStatusMessage] = useState(null);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);
  const audioCaptureRef = useRef(null);
  const pcmBuffersRef = useRef([]);
  const countdownTimerRef = useRef(null);
  const videoScreenStreamRef = useRef(null);
  const pendingScreenStreamRef = useRef(null);
  const combinedVideoStreamRef = useRef(null);
  const videoMimeTypeRef = useRef('video/webm');
  const videoFileExtRef = useRef('webm');
  const videoStartedAtRef = useRef(0);
  const videoPickerInProgressRef = useRef(false);
  const videoStopPromiseRef = useRef(null);
  const videoStopResolveRef = useRef(null);
  const videoStateRef = useRef('idle');
  const videoStartTimeoutRef = useRef(null);
  const videoDidStartRef = useRef(false);
  const videoStopReasonRef = useRef(null);

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

  const clearVideoStartWatchdog = useCallback(() => {
    if (!videoStartTimeoutRef.current) return;
    clearTimeout(videoStartTimeoutRef.current);
    videoStartTimeoutRef.current = null;
  }, []);

  const ensureAudioEngine = useCallback(async () => {
    const ap = audioPlayerRef.current;
    if (!ap) return null;
    await ap.init();
    ap.initMasterBus();
    return ap;
  }, [audioPlayerRef]);

  const createVideoStopPromise = useCallback(() => {
    if (videoStopPromiseRef.current) return videoStopPromiseRef.current;
    videoStopPromiseRef.current = new Promise((resolve) => {
      videoStopResolveRef.current = resolve;
    });
    return videoStopPromiseRef.current;
  }, []);

  const resolveVideoStopPromise = useCallback(() => {
    if (!videoStopResolveRef.current) return;
    const resolve = videoStopResolveRef.current;
    videoStopResolveRef.current = null;
    videoStopPromiseRef.current = null;
    resolve();
  }, []);

  const cleanupVideoSession = useCallback(({
    stopPending = true,
    stopScreen = true,
    stopCombined = true,
    resetStatusMessage = false,
  } = {}) => {
    const recorder = mediaRecorderRef.current;
    const pendingStream = pendingScreenStreamRef.current;
    const screenStream = videoScreenStreamRef.current;
    const combinedStream = combinedVideoStreamRef.current;

    clearVideoStartWatchdog();
    pendingStream?.getVideoTracks().forEach((track) => {
      track.onended = null;
    });
    screenStream?.getVideoTracks().forEach((track) => {
      track.onended = null;
    });
    if (pendingStream) pendingStream.oninactive = null;
    if (screenStream) screenStream.oninactive = null;

    if (recorder) {
      recorder.onstart = null;
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
    }

    if (stopPending) pendingStream?.getTracks().forEach((track) => track.stop());
    if (stopScreen) screenStream?.getTracks().forEach((track) => track.stop());
    if (stopCombined) combinedStream?.getTracks().forEach((track) => track.stop());

    chunksRef.current = [];
    mediaRecorderRef.current = null;
    pendingScreenStreamRef.current = null;
    videoScreenStreamRef.current = null;
    combinedVideoStreamRef.current = null;
    videoStartedAtRef.current = 0;
    videoMimeTypeRef.current = 'video/webm';
    videoFileExtRef.current = 'webm';
    videoPickerInProgressRef.current = false;
    videoStateRef.current = 'idle';
    videoDidStartRef.current = false;
    videoStopReasonRef.current = null;
    setIsRecordingVideo(false);
    if (resetStatusMessage) setVideoStatusMessage(null);
    stopTimer();
    resolveVideoStopPromise();
  }, [clearVideoStartWatchdog, resolveVideoStopPromise]);

  const failVideoRecording = useCallback((message, {
    clearPendingCountdown = false,
    stopPending = true,
    stopScreen = true,
    stopCombined = true,
  } = {}) => {
    if (clearPendingCountdown) {
      clearCountdown();
    }
    videoStopReasonRef.current = 'failed';
    setVideoStatusMessage(message);
    cleanupVideoSession({
      stopPending,
      stopScreen,
      stopCombined,
      resetStatusMessage: false,
    });
  }, [clearCountdown, cleanupVideoSession]);

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
    const screenStream = pendingScreenStreamRef.current;
    if (!screenStream || videoStateRef.current !== 'countdown') return;

    try {
      await ensureAudioEngine();
      const videoTrack = screenStream.getVideoTracks()[0];
      if (!videoTrack || videoTrack.readyState !== 'live') {
        cleanupVideoSession({ stopPending: true, stopScreen: false, stopCombined: false });
        return;
      }

      // Combine screen video + DJ audio
      const audioStream = audioPlayerRef.current?.getOutputStream();
      const tracks = [...screenStream.getVideoTracks()];
      if (audioStream) {
        audioStream.getAudioTracks().forEach((track) => {
          tracks.push(typeof track.clone === 'function' ? track.clone() : track);
        });
      }

      if (tracks.length === 0) {
        failVideoRecording('VIDEO REC FAILED', {
          stopPending: false,
          stopScreen: true,
          stopCombined: true,
        });
        return;
      }

      const combinedStream = new MediaStream(tracks);
      combinedVideoStreamRef.current = combinedStream;
      chunksRef.current = [];

      // Chromium is more reliable with WebM; prefer MP4 only on Safari.
      const isSafari = /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(window.navigator.userAgent);
      const mimeCandidates = isSafari
        ? ['video/mp4', 'video/webm;codecs=h264,opus', 'video/webm']
        : ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm;codecs=h264,opus', 'video/webm', 'video/mp4'];

      let mimeType = '';
      for (const candidate of mimeCandidates) {
        if (MediaRecorder.isTypeSupported(candidate)) {
          mimeType = candidate;
          break;
        }
      }
      const fileExt = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';

      const recorder = new MediaRecorder(combinedStream, mimeType ? { mimeType } : undefined);
      videoMimeTypeRef.current = mimeType || recorder.mimeType || 'video/webm';
      videoFileExtRef.current = fileExt;
      videoScreenStreamRef.current = screenStream;
      pendingScreenStreamRef.current = null;
      mediaRecorderRef.current = recorder;
      videoStateRef.current = 'starting';
      videoDidStartRef.current = false;
      videoStopReasonRef.current = null;
      createVideoStopPromise();

      recorder.onstart = () => {
        clearVideoStartWatchdog();
        videoStartedAtRef.current = Date.now();
        videoStateRef.current = 'recording';
        videoDidStartRef.current = true;
        setVideoStatusMessage(null);
        setIsRecordingVideo(true);
        startTimer();
      };

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        clearVideoStartWatchdog();
        const totalBytes = chunksRef.current.reduce((sum, chunk) => sum + chunk.size, 0);
        const elapsedMs = videoStartedAtRef.current ? Date.now() - videoStartedAtRef.current : 0;
        const didStart = videoDidStartRef.current;
        const stopReason = videoStopReasonRef.current;

        if (didStart && totalBytes > 2048 && elapsedMs > 300) {
          const blob = new Blob(chunksRef.current, { type: videoMimeTypeRef.current });
          const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
          download(blob, `SimpleDJ-session-${timestamp}.${videoFileExtRef.current}`);
        } else if (stopReason === 'screen-ended') {
          setVideoStatusMessage('SCREEN SHARE ENDED');
        } else if (!didStart || stopReason === 'failed') {
          setVideoStatusMessage('VIDEO REC FAILED');
        }
        cleanupVideoSession({
          stopPending: false,
          stopScreen: true,
          stopCombined: true,
          resetStatusMessage: didStart && stopReason !== 'screen-ended' && stopReason !== 'failed',
        });
      };

      recorder.onerror = (event) => {
        console.error('Video recorder error:', event.error || event);
        videoStopReasonRef.current = 'failed';
        if (recorder.state !== 'inactive') {
          videoStateRef.current = 'stopping';
          recorder.stop();
        } else {
          failVideoRecording('VIDEO REC FAILED', {
            stopPending: false,
            stopScreen: true,
            stopCombined: true,
          });
        }
      };

      recorder.start(100);
      clearVideoStartWatchdog();
      videoStartTimeoutRef.current = window.setTimeout(() => {
        if (videoStateRef.current !== 'starting' || videoDidStartRef.current) return;

        console.error('Video recorder start watchdog timed out');
        videoStopReasonRef.current = 'failed';
        const activeRecorder = mediaRecorderRef.current;
        if (activeRecorder && activeRecorder.state !== 'inactive') {
          videoStateRef.current = 'stopping';
          activeRecorder.stop();
        } else {
          failVideoRecording('VIDEO REC FAILED', {
            stopPending: false,
            stopScreen: true,
            stopCombined: true,
          });
        }
      }, 700);
    } catch (err) {
      console.error('Screen recording error:', err);
      failVideoRecording('VIDEO REC FAILED', {
        stopPending: true,
        stopScreen: true,
        stopCombined: true,
      });
    }
  }, [audioPlayerRef, cleanupVideoSession, createVideoStopPromise, ensureAudioEngine, clearVideoStartWatchdog, failVideoRecording]);

  const startVideoRecording = useCallback(async () => {
    if (
      isRecordingVideo ||
      countdown != null ||
      videoStateRef.current !== 'idle' ||
      mediaRecorderRef.current?.state === 'recording' ||
      pendingScreenStreamRef.current ||
      videoStopPromiseRef.current ||
      videoPickerInProgressRef.current
    ) {
      return;
    }

    setVideoStatusMessage(null);
    videoStateRef.current = 'picking';
    videoPickerInProgressRef.current = true;

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'browser' },
        audio: false,
      });

      const videoTrack = screenStream.getVideoTracks()[0];
      if (!videoTrack || videoTrack.readyState !== 'live') {
        cleanupVideoSession({ stopPending: false, stopScreen: true, stopCombined: false });
        return;
      }

      const handleScreenEnded = () => {
        clearVideoStartWatchdog();
        if (pendingScreenStreamRef.current === screenStream || videoStateRef.current === 'countdown' || videoStateRef.current === 'starting') {
          failVideoRecording('SCREEN SHARE ENDED', {
            clearPendingCountdown: true,
            stopPending: false,
            stopScreen: false,
            stopCombined: false,
          });
          return;
        }

        const recorder = mediaRecorderRef.current;
        if (recorder && recorder.state !== 'inactive') {
          videoStopReasonRef.current = 'screen-ended';
          videoStateRef.current = 'stopping';
          createVideoStopPromise();
          recorder.stop();
          return;
        }

        cleanupVideoSession({
          stopPending: false,
          stopScreen: false,
          stopCombined: true,
          resetStatusMessage: false,
        });
      };
      videoTrack.onended = handleScreenEnded;
      screenStream.oninactive = handleScreenEnded;

      pendingScreenStreamRef.current = screenStream;
      await ensureAudioEngine();
      videoStateRef.current = 'countdown';
      runCountdown(_startVideoRecordingImpl);
    } catch (err) {
      console.error('Screen selection error:', err);
      const wasUserCanceled = err?.name === 'NotAllowedError' || err?.name === 'AbortError';
      if (wasUserCanceled) {
        setVideoStatusMessage(null);
        cleanupVideoSession({
          stopPending: true,
          stopScreen: true,
          stopCombined: false,
          resetStatusMessage: true,
        });
      } else {
        failVideoRecording('VIDEO REC FAILED', {
          stopPending: true,
          stopScreen: true,
          stopCombined: false,
        });
      }
    } finally {
      videoPickerInProgressRef.current = false;
    }
  }, [isRecordingVideo, countdown, runCountdown, _startVideoRecordingImpl, ensureAudioEngine, cleanupVideoSession, createVideoStopPromise, clearVideoStartWatchdog, failVideoRecording]);

  const stopVideoRecording = useCallback(() => {
    if (clearCountdown()) {
      setVideoStatusMessage(null);
      cleanupVideoSession({ stopPending: true, stopScreen: false, stopCombined: false, resetStatusMessage: true });
      return;
    }

    if (mediaRecorderRef.current?.state === 'recording' || mediaRecorderRef.current?.state === 'paused') {
      videoStopReasonRef.current = 'manual';
      videoStateRef.current = 'stopping';
      createVideoStopPromise();
      mediaRecorderRef.current.stop();
    } else {
      setVideoStatusMessage(null);
      cleanupVideoSession({ stopPending: true, stopScreen: true, stopCombined: true, resetStatusMessage: true });
    }
  }, [clearCountdown, cleanupVideoSession, createVideoStopPromise]);

  const cancelRecordingCountdown = useCallback(() => {
    if (clearCountdown()) {
      setVideoStatusMessage(null);
      cleanupVideoSession({ stopPending: true, stopScreen: false, stopCombined: false, resetStatusMessage: true });
    }
  }, [clearCountdown, cleanupVideoSession]);

  return {
    isRecordingAudio, isRecordingVideo, recordingTime, countdown,
    videoStatusMessage,
    startAudioRecording, stopAudioRecording,
    startVideoRecording, stopVideoRecording,
    cancelRecordingCountdown,
  };
}
