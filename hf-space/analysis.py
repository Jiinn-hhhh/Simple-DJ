import os
import tempfile
import librosa
import numpy as np
import soundfile as sf


def analyze_bpm(audio_path: str) -> float:
    """
    Analyze BPM (Beats Per Minute) of an audio file using librosa.
    
    Args:
        audio_path: Path to the audio file
        
    Returns:
        BPM value (float)
    """
    # Load audio file
    y, sr = librosa.load(audio_path, sr=None)
    
    # Extract tempo using librosa's beat tracking
    tempo, beats = librosa.beat.beat_track(y=y, sr=sr)
    
    return float(tempo)


def analyze_key(audio_path: str) -> str:
    """
    Analyze musical key of an audio file using chroma features.
    
    Args:
        audio_path: Path to the audio file
        
    Returns:
        Key name (e.g., "C major", "A minor")
    """
    # Load audio file
    y, sr = librosa.load(audio_path, sr=None)
    
    # Extract harmonic component (remove percussive elements)
    y_harmonic, y_percussive = librosa.effects.hpss(y)
    
    # Compute chroma features
    chroma = librosa.feature.chroma_stft(y=y_harmonic, sr=sr)
    
    # Average chroma across time
    chroma_mean = np.mean(chroma, axis=1)
    
    # Key profiles for major and minor keys
    # Based on Krumhansl-Schmuckler key-finding algorithm
    major_profile = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
    minor_profile = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
    
    # Normalize profiles
    major_profile = major_profile / np.sum(major_profile)
    minor_profile = minor_profile / np.sum(minor_profile)
    
    # Key names
    keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    
    # Calculate correlation for each key (all 12 transpositions)
    max_corr = -1
    best_key = "C major"
    
    for i in range(12):
        # Rotate chroma to match key
        rotated_chroma = np.roll(chroma_mean, i)
        
        # Correlate with major profile
        major_corr = np.corrcoef(rotated_chroma, major_profile)[0, 1]
        
        # Correlate with minor profile
        minor_corr = np.corrcoef(rotated_chroma, minor_profile)[0, 1]
        
        # Choose better match
        if major_corr > minor_corr and major_corr > max_corr:
            max_corr = major_corr
            best_key = f"{keys[i]} major"
        elif minor_corr > max_corr:
            max_corr = minor_corr
            best_key = f"{keys[i]} minor"
    
    return best_key


def analyze_audio(contents: bytes, filename: str) -> dict:
    """
    Analyze audio file to extract BPM, key, and other metadata.
    
    Args:
        contents: Audio file contents as bytes
        filename: Original filename
        
    Returns:
        Dictionary containing analysis results
    """
    # Create temporary file to save audio contents
    with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(filename)[1]) as tmp_file:
        tmp_file.write(contents)
        tmp_path = tmp_file.name
    
    try:
        # Analyze BPM
        bpm = analyze_bpm(tmp_path)
        
        # Analyze key
        key = analyze_key(tmp_path)
        
        # Get audio duration
        y, sr = librosa.load(tmp_path, sr=None)
        duration = len(y) / sr
        
        # File size
        size_bytes = len(contents)
        
        return {
            "filename": filename,
            "size_bytes": size_bytes,
            "bpm": round(bpm, 2),
            "key": key,
            "duration": round(duration, 2),
            "sample_rate": int(sr),
        }
    finally:
        # Clean up temporary file
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


def adjust_bpm(audio_path: str, target_bpm: float, original_bpm: float, output_path: str) -> str:
    """
    Adjust BPM of an audio file using time stretching.
    
    Args:
        audio_path: Path to the input audio file
        target_bpm: Target BPM
        original_bpm: Original BPM of the audio
        output_path: Path to save the adjusted audio file
        
    Returns:
        Path to the output file
    """
    # Load audio
    y, sr = librosa.load(audio_path, sr=None)
    
    # Calculate stretch factor
    # If target is faster, we need to speed up (stretch factor < 1)
    # If target is slower, we need to slow down (stretch factor > 1)
    stretch_factor = original_bpm / target_bpm
    
    # Apply time stretching (preserves pitch)
    y_stretched = librosa.effects.time_stretch(y, rate=stretch_factor)
    
    # Save the result
    sf.write(output_path, y_stretched, sr)
    
    return output_path
