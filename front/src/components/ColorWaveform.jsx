// components/ColorWaveform.jsx — Canvas-based color waveform visualization

import React, { useRef, useEffect, useCallback } from 'react';

const ColorWaveform = ({
  waveformData,   // { lowPeaks, midPeaks, highPeaks, peaks }
  position,       // 0-1 normalized playback position
  hotCues,        // array of { position, color } | null
  loopPoints,     // { start, end, active } or null (normalized 0-1)
  duration,       // track duration in seconds
  bpm,            // for beat markers
  deckId,         // 'A' or 'B' for color theming
  onSeek,         // click-to-seek callback
  slipPosition,   // 0-1 normalized slip virtual position (optional)
}) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;

    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = '#0a0a0e';
    ctx.fillRect(0, 0, width, height);

    if (!waveformData) {
      // No data — draw empty
      ctx.fillStyle = '#222';
      ctx.fillRect(0, height / 2 - 1, width, 2);
      return;
    }

    const { lowPeaks, midPeaks, highPeaks } = waveformData;
    const resolution = lowPeaks.length;
    const barWidth = width / resolution;
    const centerY = height / 2;

    // Draw waveform bars — layered: low (bottom), mid (middle), high (top)
    for (let i = 0; i < resolution; i++) {
      const x = i * barWidth;
      const isPast = (i / resolution) < position;

      // Low band — red/orange
      const lowH = lowPeaks[i] * centerY * 0.9;
      ctx.fillStyle = isPast ? '#ff4400' : '#661a00';
      ctx.fillRect(x, centerY - lowH, Math.max(1, barWidth - 0.5), lowH);
      ctx.fillRect(x, centerY, Math.max(1, barWidth - 0.5), lowH);

      // Mid band — green/yellow (on top of low)
      const midH = midPeaks[i] * centerY * 0.7;
      ctx.fillStyle = isPast ? '#44cc00' : '#1a5500';
      ctx.fillRect(x, centerY - midH, Math.max(1, barWidth - 0.5), midH);
      ctx.fillRect(x, centerY, Math.max(1, barWidth - 0.5), midH);

      // High band — blue/cyan (peaks)
      const highH = highPeaks[i] * centerY * 0.5;
      ctx.fillStyle = isPast ? '#00bbff' : '#004466';
      ctx.fillRect(x, centerY - highH, Math.max(1, barWidth - 0.5), highH);
      ctx.fillRect(x, centerY, Math.max(1, barWidth - 0.5), highH);
    }

    // Beat markers
    if (bpm && duration) {
      const beatDuration = 60 / bpm;
      const totalBeats = duration / beatDuration;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 0.5;
      for (let b = 0; b < totalBeats; b++) {
        const beatX = (b * beatDuration / duration) * width;
        if (b % 4 === 0) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
          ctx.lineWidth = 1;
        } else {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
          ctx.lineWidth = 0.5;
        }
        ctx.beginPath();
        ctx.moveTo(beatX, 0);
        ctx.lineTo(beatX, height);
        ctx.stroke();
      }
    }

    // Loop region overlay
    if (loopPoints && loopPoints.active && duration) {
      const loopStartX = (loopPoints.start / duration) * width;
      const loopEndX = (loopPoints.end / duration) * width;
      ctx.fillStyle = 'rgba(0, 229, 255, 0.12)';
      ctx.fillRect(loopStartX, 0, loopEndX - loopStartX, height);
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.6)';
      ctx.lineWidth = 1;
      ctx.strokeRect(loopStartX, 0, loopEndX - loopStartX, height);
    }

    // Hot cue markers
    if (hotCues && duration) {
      hotCues.forEach((cue) => {
        if (!cue) return;
        const cueX = (cue.position / duration) * width;
        ctx.strokeStyle = cue.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cueX, 0);
        ctx.lineTo(cueX, height);
        ctx.stroke();
        // Small triangle at top
        ctx.fillStyle = cue.color;
        ctx.beginPath();
        ctx.moveTo(cueX - 4, 0);
        ctx.lineTo(cueX + 4, 0);
        ctx.lineTo(cueX, 6);
        ctx.closePath();
        ctx.fill();
      });
    }

    // Slip virtual position (dim line)
    if (slipPosition != null && slipPosition > 0) {
      const slipX = slipPosition * width;
      ctx.strokeStyle = 'rgba(255, 102, 0, 0.5)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(slipX, 0);
      ctx.lineTo(slipX, height);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Playback position (bright line)
    const posX = position * width;
    const deckColor = deckId === 'A' ? '#00ff9d' : '#ff0055';
    ctx.strokeStyle = deckColor;
    ctx.lineWidth = 2;
    ctx.shadowColor = deckColor;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(posX, 0);
    ctx.lineTo(posX, height);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Center line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();
  }, [waveformData, position, hotCues, loopPoints, duration, bpm, deckId, slipPosition]);

  // Resize canvas to container
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resizeCanvas = () => {
      const { width, height } = container.getBoundingClientRect();
      canvas.width = Math.floor(width);
      canvas.height = Math.floor(height);
    };

    const observer = new ResizeObserver(resizeCanvas);
    observer.observe(container);
    resizeCanvas();
    return () => observer.disconnect();
  }, []);

  // Single rAF loop for drawing — draws every frame when position changes
  useEffect(() => {
    let raf;
    const tick = () => {
      draw();
      raf = requestAnimationFrame(tick);
    };
    // Always run at least one draw, then continue looping only if position is moving
    draw();
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [draw]);

  const handleClick = (e) => {
    if (!onSeek || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(percent);
  };

  return (
    <div
      ref={containerRef}
      className="color-waveform-container"
      onClick={handleClick}
      style={{ cursor: 'pointer' }}
    >
      <canvas ref={canvasRef} />
    </div>
  );
};

export default ColorWaveform;
