// lib/pitchShifter.js — SoundTouchJS wrapper for Key Lock (time-stretch without pitch change)

import { SoundTouch, SimpleFilter } from 'soundtouchjs';

const BUFFER_SIZE = 4096;

export default class PitchShifter {
  constructor(audioContext) {
    this.audioContext = audioContext;
    this.soundTouch = new SoundTouch();
    this.soundTouch.pitch = 1.0;
    this.soundTouch.tempo = 1.0;
    this.filter = null;
    this.node = null;
    this.source = null;
    this._bypassed = false;
  }

  /**
   * Create a ScriptProcessorNode that reads from a decoded AudioBuffer
   * and applies SoundTouch time-stretching.
   * Returns the processor node to insert into the signal chain.
   */
  connectSource(audioBuffer, offset = 0) {
    this.disconnect();

    const channels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length;

    // Interleave audio data for SoundTouch
    const left = audioBuffer.getChannelData(0);
    const right = channels > 1 ? audioBuffer.getChannelData(1) : left;

    // Create a simple source that provides interleaved samples
    const samples = new Float32Array(length * 2);
    for (let i = 0; i < length; i++) {
      samples[i * 2] = left[i];
      samples[i * 2 + 1] = right[i];
    }

    // Position tracking for offset
    const startSample = Math.floor(offset * sampleRate);

    this.source = {
      extract(target, numFrames, position) {
        const actualPos = position + startSample;
        let outFrames = 0;
        for (let i = 0; i < numFrames; i++) {
          const idx = (actualPos + i) * 2;
          if (idx + 1 >= samples.length) break;
          target[i * 2] = samples[idx];
          target[i * 2 + 1] = samples[idx + 1];
          outFrames++;
        }
        return outFrames;
      }
    };

    this.filter = new SimpleFilter(this.source, this.soundTouch);

    // Create ScriptProcessorNode for real-time output
    this.node = this.audioContext.createScriptProcessor(BUFFER_SIZE, 2, 2);
    this.node.onaudioprocess = (e) => {
      if (this._bypassed) {
        // Pass-through silence — the regular source handles playback
        const outL = e.outputBuffer.getChannelData(0);
        const outR = e.outputBuffer.getChannelData(1);
        outL.fill(0);
        outR.fill(0);
        return;
      }

      const outL = e.outputBuffer.getChannelData(0);
      const outR = e.outputBuffer.getChannelData(1);
      const framesNeeded = outL.length;

      const buffer = new Float32Array(framesNeeded * 2);
      const framesExtracted = this.filter.extract(buffer, framesNeeded);

      for (let i = 0; i < framesNeeded; i++) {
        if (i < framesExtracted) {
          outL[i] = buffer[i * 2];
          outR[i] = buffer[i * 2 + 1];
        } else {
          outL[i] = 0;
          outR[i] = 0;
        }
      }
    };

    return this.node;
  }

  setTempo(rate) {
    this.soundTouch.tempo = rate;
  }

  getTempo() {
    return this.soundTouch.tempo;
  }

  bypass(enabled) {
    this._bypassed = enabled;
  }

  disconnect() {
    if (this.node) {
      try {
        this.node.disconnect();
      } catch {}
      this.node.onaudioprocess = null;
      this.node = null;
    }
    this.filter = null;
    this.source = null;
  }
}
