// Client-side audio analysis using Pyodide + librosa
import { loadPyodide } from './pyodideLoader';

// Python code for audio analysis (mirrors back/analysis.py)
const ANALYSIS_CODE = `
import librosa
import numpy as np
import io
import base64

def analyze_bpm(audio_data, sample_rate):
    """Analyze BPM using librosa."""
    y = librosa.util.buf_to_float(audio_data)
    tempo, beats = librosa.beat.beat_track(y=y, sr=sample_rate)
    return float(tempo)

def analyze_key(audio_data, sample_rate):
    """Analyze musical key using chroma features."""
    y = librosa.util.buf_to_float(audio_data)
    
    # Extract harmonic component
    y_harmonic, y_percussive = librosa.effects.hpss(y)
    
    # Compute chroma features
    chroma = librosa.feature.chroma_stft(y=y_harmonic, sr=sample_rate)
    
    # Average chroma across time
    chroma_mean = np.mean(chroma, axis=1)
    
    # Key profiles
    major_profile = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
    minor_profile = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
    
    major_profile = major_profile / np.sum(major_profile)
    minor_profile = minor_profile / np.sum(minor_profile)
    
    keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    
    max_corr = -1
    best_key = "C major"
    
    for i in range(12):
        rotated_chroma = np.roll(chroma_mean, i)
        major_corr = np.corrcoef(rotated_chroma, major_profile)[0, 1]
        minor_corr = np.corrcoef(rotated_chroma, minor_profile)[0, 1]
        
        if major_corr > minor_corr and major_corr > max_corr:
            max_corr = major_corr
            best_key = f"{keys[i]} major"
        elif minor_corr > max_corr:
            max_corr = minor_corr
            best_key = f"{keys[i]} minor"
    
    return best_key
`;

let pyodideReady = false;
let analysisCodeLoaded = false;

async function ensurePyodideReady() {
  if (pyodideReady && analysisCodeLoaded) {
    return;
  }

  const pyodide = await loadPyodide();
  
  if (!analysisCodeLoaded) {
    // Load analysis code
    pyodide.runPython(ANALYSIS_CODE);
    analysisCodeLoaded = true;
  }
  
  pyodideReady = true;
}

/**
 * Analyze audio file in browser using Pyodide + librosa
 * @param {File} audioFile - Audio file to analyze
 * @returns {Promise<{bpm: number, key: string, duration: number, sample_rate: number}>}
 */
export async function analyzeAudioClient(audioFile) {
  try {
    console.log("[Client Analysis] Starting analysis...");
    await ensurePyodideReady();
    
    const pyodide = await loadPyodide();
    
    // Read audio file and decode using Web Audio API
    const arrayBuffer = await audioFile.arrayBuffer();
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    const sampleRate = audioBuffer.sampleRate;
    const duration = audioBuffer.duration;
    
    // Convert to mono and get float32 array
    const channelData = audioBuffer.getChannelData(0);
    const audioData = Array.from(channelData);
    
    // Convert to Pyodide-compatible format
    const audioDataPy = pyodide.toPy(audioData);
    pyodide.globals.set("audio_data_js", audioDataPy);
    pyodide.globals.set("sr_js", sampleRate);
    
    console.log("[Client Analysis] Analyzing BPM...");
    const bpm = pyodide.runPython(`
import librosa
import numpy as np
audio_data = np.array(audio_data_js, dtype=np.float32)
sr = sr_js
tempo, beats = librosa.beat.beat_track(y=audio_data, sr=sr)
float(tempo)
    `);
    
    console.log("[Client Analysis] Analyzing key...");
    const key = pyodide.runPython(`
import librosa
import numpy as np
audio_data = np.array(audio_data_js, dtype=np.float32)
sr = sr_js
y_harmonic, y_percussive = librosa.effects.hpss(audio_data)
chroma = librosa.feature.chroma_stft(y=y_harmonic, sr=sr)
chroma_mean = np.mean(chroma, axis=1)

major_profile = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
minor_profile = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
major_profile = major_profile / np.sum(major_profile)
minor_profile = minor_profile / np.sum(minor_profile)

keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
max_corr = -1
best_key = "C major"

for i in range(12):
    rotated_chroma = np.roll(chroma_mean, i)
    major_corr = np.corrcoef(rotated_chroma, major_profile)[0, 1]
    minor_corr = np.corrcoef(rotated_chroma, minor_profile)[0, 1]
    
    if major_corr > minor_corr and major_corr > max_corr:
        max_corr = major_corr
        best_key = f"{keys[i]} major"
    elif minor_corr > max_corr:
        max_corr = minor_corr
        best_key = f"{keys[i]} minor"

best_key
    `);
    
    console.log("[Client Analysis] Analysis complete:", { bpm, key, duration, sample_rate: sampleRate });
    
    return {
      filename: audioFile.name,
      size_bytes: audioFile.size,
      bpm: Math.round(bpm * 100) / 100,
      key: key,
      duration: Math.round(duration * 100) / 100,
      sample_rate: sampleRate,
    };
  } catch (error) {
    console.error("[Client Analysis] Error:", error);
    // Fallback to server if client-side fails
    throw new Error(`Client-side analysis failed: ${error.message}. Falling back to server.`);
  }
}

