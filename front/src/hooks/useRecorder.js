// hooks/useRecorder.js — Audio & screen recording

import { useState, useRef, useCallback } from 'react';

export default function useRecorder(audioPlayerRef) {
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);

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

  const download = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // --- Audio Recording ---
  const startAudioRecording = useCallback(() => {
    const audioStream = audioPlayerRef.current?.getOutputStream();
    if (!audioStream) {
      console.warn('No audio stream available');
      return;
    }

    chunksRef.current = [];
    const recorder = new MediaRecorder(audioStream, {
      mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm',
    });

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      download(blob, `SimpleDJ-mix-${timestamp}.webm`);
      chunksRef.current = [];
    };

    recorder.start(100);
    mediaRecorderRef.current = recorder;
    setIsRecordingAudio(true);
    startTimer();
  }, [audioPlayerRef]);

  const stopAudioRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    setIsRecordingAudio(false);
    stopTimer();
  }, []);

  // --- Video (Screen + Audio) Recording ---
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

      const recorder = new MediaRecorder(combinedStream, {
        mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
          ? 'video/webm;codecs=vp9,opus'
          : 'video/webm',
      });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        download(blob, `SimpleDJ-session-${timestamp}.webm`);
        chunksRef.current = [];
        // Stop screen capture tracks
        screenStream.getTracks().forEach(t => t.stop());
      };

      // If user stops screen share via browser UI
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
