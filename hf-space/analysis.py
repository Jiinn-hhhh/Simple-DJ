import os
import tempfile
import librosa
import numpy as np
import soundfile as sf


ANALYSIS_SAMPLE_RATE = int(os.getenv("ANALYSIS_SAMPLE_RATE", "22050"))
ANALYSIS_MAX_SECONDS = float(os.getenv("ANALYSIS_MAX_SECONDS", "180"))
ANALYSIS_USE_HPSS = os.getenv("ANALYSIS_USE_HPSS", "false").lower() in {"1", "true", "yes"}


def load_analysis_audio(audio_path: str):
    """Load a bounded mono preview for metadata analysis on free CPU."""
    duration = ANALYSIS_MAX_SECONDS if ANALYSIS_MAX_SECONDS > 0 else None
    return librosa.load(audio_path, sr=ANALYSIS_SAMPLE_RATE, mono=True, duration=duration)


def analyze_bpm_from_audio(y, sr: int) -> float:
    tempo, _beats = librosa.beat.beat_track(y=y, sr=sr)
    return float(np.atleast_1d(tempo)[0])


def analyze_key_from_audio(y, sr: int) -> str:
    key_audio = librosa.effects.hpss(y)[0] if ANALYSIS_USE_HPSS else y
    chroma = librosa.feature.chroma_stft(y=key_audio, sr=sr)
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

    return best_key


def analyze_bpm(audio_path: str) -> float:
    """
    Analyze BPM (Beats Per Minute) of an audio file using librosa.
    
    Args:
        audio_path: Path to the audio file
        
    Returns:
        BPM value (float)
    """
    y, sr = load_analysis_audio(audio_path)
    return analyze_bpm_from_audio(y, sr)


def analyze_key(audio_path: str) -> str:
    """
    Analyze musical key of an audio file using chroma features.
    
    Args:
        audio_path: Path to the audio file
        
    Returns:
        Key name (e.g., "C major", "A minor")
    """
    y, sr = load_analysis_audio(audio_path)
    return analyze_key_from_audio(y, sr)


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
        y, sr = load_analysis_audio(tmp_path)
        bpm = analyze_bpm_from_audio(y, sr)
        key = analyze_key_from_audio(y, sr)
        try:
            info = sf.info(tmp_path)
            duration = info.duration
            source_sample_rate = info.samplerate
        except RuntimeError:
            duration = librosa.get_duration(path=tmp_path)
            source_sample_rate = sr
        
        # File size
        size_bytes = len(contents)
        
        return {
            "filename": filename,
            "size_bytes": size_bytes,
            "bpm": round(bpm, 2),
            "key": key,
            "duration": round(duration, 2),
            "sample_rate": int(source_sample_rate),
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
