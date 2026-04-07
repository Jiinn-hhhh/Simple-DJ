// hooks/useRecorder.js — Audio (WAV) & Video (MP4/WebM) recording

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

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);
  const scriptNodeRef = useRef(null);
  const pcmBuffersRef = useRef([]);

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

  // --- Audio Recording (WAV) ---
  const startAudioRecording = useCallback(() => {
    const ap = audioPlayerRef.current;
    if (!ap?.audioContext || !ap?.masterNodes) {
      console.warn('Audio engine not ready');
      return;
    }

    const ctx = ap.audioContext;
    const bufferSize = 4096;
    const scriptNode = ctx.createScriptProcessor(bufferSize, 2, 2);
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

    // Connect: masterFilter → scriptNode → destination (passthrough)
    ap.masterNodes.filter.connect(scriptNode);
    scriptNode.connect(ctx.destination);
    scriptNodeRef.current = scriptNode;

    setIsRecordingAudio(true);
    startTimer();
  }, [audioPlayerRef]);

  const stopAudioRecording = useCallback(() => {
    const ap = audioPlayerRef.current;
    if (scriptNodeRef.current && ap?.masterNodes) {
      try {
        ap.masterNodes.filter.disconnect(scriptNodeRef.current);
        scriptNodeRef.current.disconnect();
      } catch {}
      scriptNodeRef.current = null;
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
  }, [audioPlayerRef]);

  // --- Video Recording (MP4/WebM) ---
  const startVideoRecording = useCallback(async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'browser' },
        audio: false,
      });

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
      let fileExt = 'mp4';
      if (MediaRecorder.isTypeSupported('video/mp4')) {
        mimeType = 'video/mp4';
      } else if (MediaRecorder.isTypeSupported('video/webm;codecs=h264,opus')) {
        mimeType = 'video/webm;codecs=h264,opus';
      }

      const recorder = new MediaRecorder(combinedStream, { mimeType });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        download(blob, `SimpleDJ-session-${timestamp}.${fileExt}`);
        chunksRef.current = [];
        screenStream.getTracks().forEach(t => t.stop());
      };

      screenStream.getVideoTracks()[0].onended = () => {
        if (mediaRecorderRef.current?.state === 'recording') {
          stopVideoRecording();
        }
      };

      recorder.start(100);
      mediaRecorderRef.current = recorder;
      setIsRecordingVideo(true);
      startTimer();
    } catch (err) {
      console.error('Screen recording error:', err);
    }
  }, [audioPlayerRef]);

  const stopVideoRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    setIsRecordingVideo(false);
    stopTimer();
  }, []);

  return {
    isRecordingAudio, isRecordingVideo, recordingTime,
    startAudioRecording, stopAudioRecording,
    startVideoRecording, stopVideoRecording,
  };
}
