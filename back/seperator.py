# separator.py
import os
import uuid
import torch
import torchaudio
from torchaudio.pipelines import HDEMUCS_HIGH_MUSDB_PLUS
from torchaudio.transforms import Fade


SEGMENT = 10.0      # chunk length in seconds
OVERLAP = 1.0       # overlap length in seconds
DEVICE = "cuda:0" if torch.cuda.is_available() else "cpu"

# Lazy loading: Load model only when needed
model = None
SAMPLE_RATE = None
SOURCE_NAMES = None
bundle = None

def get_model():
    """Lazy load model on first use to save memory."""
    global model, SAMPLE_RATE, SOURCE_NAMES, bundle
    if model is None:
        print(f"[separator] Loading model on device: {DEVICE}")
        bundle = HDEMUCS_HIGH_MUSDB_PLUS
        model = bundle.get_model().to(DEVICE).eval()
        SAMPLE_RATE = bundle.sample_rate
        SOURCE_NAMES = list(model.sources)
        print(f"[separator] Model loaded successfully")
    return model, SAMPLE_RATE, SOURCE_NAMES


def separate_sources(model, mix, sample_rate, segment, overlap, device):
    """Apply HDemucs to the mixture in chunks with overlap + fade."""
    if device is None:
        device = mix.device
    else:
        device = torch.device(device)

    mix = mix.to(device)
    batch, channels, length = mix.shape

    chunk_len = int(sample_rate * segment * (1.0 + overlap))
    overlap_frames = int(overlap * sample_rate)

    # Short file: single forward pass
    if length <= chunk_len:
        with torch.no_grad():
            out = model(mix)
        return out

    start = 0
    end = chunk_len

    fade = Fade(
        fade_in_len=0,
        fade_out_len=overlap_frames,
        fade_shape="linear",
    )

    final = torch.zeros(
        batch, len(model.sources), channels, length, device=device
    )

    while start < length - overlap_frames:
        chunk = mix[:, :, start:end]

        with torch.no_grad():
            out = model(chunk)

        out = fade(out)
        final[:, :, :, start:end] += out

        if start == 0:
            fade.fade_in_len = overlap_frames
            start += chunk_len - overlap_frames
        else:
            start += chunk_len

        end = start + chunk_len

        if end >= length:
            fade.fade_out_len = 0
            end = length

    return final


def load_audio(path, target_sr, device):
    """Load audio file and resample if needed."""
    waveform, sr = torchaudio.load(path)
    if sr != target_sr:
        waveform = torchaudio.functional.resample(waveform, sr, target_sr)
        sr = target_sr
    waveform = waveform.to(device)
    return waveform, sr


def save_sources(sources, source_names, sample_rate, out_dir, base_name):
    """
    Save each separated source as <base_name>_<source>.wav
    Returns dict: {source_name: file_path}
    """
    os.makedirs(out_dir, exist_ok=True)

    saved_paths = {}
    for src_tensor, name in zip(sources, source_names):
        out_path = os.path.join(out_dir, f"{base_name}_{name}.wav")
        torchaudio.save(out_path, src_tensor.cpu(), sample_rate)
        saved_paths[name] = out_path
        print(f"[separator] Saved: {out_path}")
    return saved_paths


def separate_file(input_path: str, output_root: str = "./results") -> dict:
    """
    High-level function:
    - load audio
    - normalize
    - run separation with chunking
    - denormalize
    - save stems under output_root / <uuid>/
    Returns:
        {
          "id": <uuid>,
          "sources": {
            "drums": "path/to/file.wav",
            "bass": "...",
            ...
          }
        }
    """
    # Lazy load model
    model_instance, sample_rate, source_names = get_model()
    
    # Unique ID for this job (folder name)
    job_id = str(uuid.uuid4())
    out_dir = os.path.join(output_root, job_id)

    print(f"[separator] Loading audio from {input_path}")
    waveform, sr = load_audio(input_path, sample_rate, DEVICE)

    # Reference for normalization
    ref = waveform.mean(0)
    waveform_norm = (waveform - ref.mean()) / ref.std()

    mix = waveform_norm.unsqueeze(0)

    print("[separator] Separating...")
    separated = separate_sources(
        model=model_instance,
        mix=mix,
        sample_rate=sample_rate,
        segment=SEGMENT,
        overlap=OVERLAP,
        device=DEVICE,
    )[0]  # (num_sources, channels, length)

    # De-normalize
    separated = separated * ref.std() + ref.mean()

    base_name = os.path.splitext(os.path.basename(input_path))[0]

    print("[separator] Saving results...")
    saved = save_sources(
        separated,
        source_names,
        sample_rate,
        out_dir,
        base_name,
    )

    return {
        "id": job_id,
        "sources": saved,
    }
