// lib/waveformAnalyzer.js — PCM analysis for color waveform rendering

/**
 * Analyze an AudioBuffer into 3-band frequency energy data for waveform visualization.
 * Uses direct PCM analysis with simple frequency splitting.
 * @param {AudioBuffer} audioBuffer
 * @param {number} resolution - Number of output segments (default 1024)
 * @returns {{ lowPeaks: Float32Array, midPeaks: Float32Array, highPeaks: Float32Array, peaks: Float32Array }}
 */
export function analyzeWaveform(audioBuffer, resolution = 1024) {
  const channelData = audioBuffer.getChannelData(0);
  const length = channelData.length;
  const samplesPerSegment = Math.floor(length / resolution);

  const peaks = new Float32Array(resolution);
  const lowPeaks = new Float32Array(resolution);
  const midPeaks = new Float32Array(resolution);
  const highPeaks = new Float32Array(resolution);

  // Simple 3-band splitting using running averages as pseudo-frequency bands
  // Low: slow-moving average, Mid: medium, High: fast changes (derivative)
  for (let i = 0; i < resolution; i++) {
    const start = i * samplesPerSegment;
    const end = Math.min(start + samplesPerSegment, length);

    let maxAbs = 0;
    let sumLow = 0;
    let sumMid = 0;
    let sumHigh = 0;
    let count = 0;

    // Simple 3-band energy estimation
    // We use a block-based approach: low = RMS of low-passed signal approximation
    const blockSize = Math.min(64, end - start);
    let prevSample = 0;
    let smoothed = 0;
    const smoothAlpha = 0.05; // Low-pass smoothing factor

    for (let j = start; j < end; j++) {
      const sample = channelData[j];
      const absSample = Math.abs(sample);
      if (absSample > maxAbs) maxAbs = absSample;

      // Low-pass approximation (smooth envelope)
      smoothed = smoothed * (1 - smoothAlpha) + absSample * smoothAlpha;
      sumLow += smoothed;

      // Mid-band: difference between original and smoothed
      const midEnergy = Math.abs(absSample - smoothed);
      sumMid += midEnergy;

      // High-band: derivative (fast changes)
      const highEnergy = Math.abs(sample - prevSample);
      sumHigh += highEnergy;

      prevSample = sample;
      count++;
    }

    if (count > 0) {
      peaks[i] = maxAbs;
      lowPeaks[i] = sumLow / count;
      midPeaks[i] = sumMid / count;
      highPeaks[i] = sumHigh / count;
    }
  }

  // Normalize each band to 0-1 range
  normalize(lowPeaks);
  normalize(midPeaks);
  normalize(highPeaks);

  return { peaks, lowPeaks, midPeaks, highPeaks };
}

function normalize(arr) {
  let max = 0;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] > max) max = arr[i];
  }
  if (max > 0) {
    for (let i = 0; i < arr.length; i++) {
      arr[i] /= max;
    }
  }
}
