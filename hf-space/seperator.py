# separator.py
import os
import uuid
import torch
import torchaudio
from torchaudio.pipelines import HDEMUCS_HIGH_MUSDB_PLUS


SEGMENT = float(os.getenv("DEMUCS_SEGMENT_SECONDS", "8.0"))
OVERLAP = float(os.getenv("DEMUCS_OVERLAP_SECONDS", "0.5"))
DEVICE = "cuda:0" if torch.cuda.is_available() else "cpu"
CPU_THREADS = int(os.getenv("TORCH_CPU_THREADS", "2"))

if DEVICE == "cpu" and CPU_THREADS > 0:
    torch.set_num_threads(CPU_THREADS)

# Lazy loading: 모델을 필요할 때만 로드
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


def separate_sources(model, mix, sample_rate, segment, overlap, device, should_cancel=None):
    """Apply HDemucs in overlapping chunks and reconstruct with weighted overlap-add."""
    if device is None:
        device = mix.device
    else:
        device = torch.device(device)

    mix = mix.to(device)
    batch, channels, length = mix.shape

    chunk_len = max(1, int(sample_rate * segment))
    overlap_frames = max(0, int(overlap * sample_rate))
    if overlap_frames >= chunk_len:
        overlap_frames = max(0, chunk_len // 4)
    hop_len = max(1, chunk_len - overlap_frames)

    # Short file: single forward pass
    if length <= chunk_len:
        if should_cancel:
            should_cancel()
        with torch.inference_mode():
            out = model(mix)
        if should_cancel:
            should_cancel()
        return out

    final = torch.zeros(
        batch, len(model.sources), channels, length, device=device
    )
    weights = torch.zeros(1, 1, 1, length, device=device)

    for start in range(0, length, hop_len):
        if should_cancel:
            should_cancel()

        end = min(start + chunk_len, length)
        chunk = mix[:, :, start:end]

        if chunk.shape[-1] == 0:
            continue

        with torch.inference_mode():
            out = model(chunk)

        chunk_len_actual = out.shape[-1]
        chunk_weight = torch.ones(chunk_len_actual, device=device)
        if overlap_frames > 0:
            fade_in_len = min(overlap_frames, chunk_len_actual)
            fade_out_len = min(overlap_frames, chunk_len_actual)

            if start > 0 and fade_in_len > 0:
                chunk_weight[:fade_in_len] = torch.linspace(
                    0.0, 1.0, fade_in_len, device=device
                )
            if end < length and fade_out_len > 0:
                chunk_weight[-fade_out_len:] = torch.minimum(
                    chunk_weight[-fade_out_len:],
                    torch.linspace(1.0, 0.0, fade_out_len, device=device),
                )

        actual_end = min(start + chunk_len_actual, length)
        actual_len = actual_end - start
        if actual_len <= 0:
            continue

        out = out[:, :, :, :actual_len]
        chunk_weight = chunk_weight[:actual_len].view(1, 1, 1, -1)
        final[:, :, :, start:actual_end] += out * chunk_weight
        weights[:, :, :, start:actual_end] += chunk_weight

        if end >= length:
            break

    if should_cancel:
        should_cancel()

    return final / weights.clamp_min(1e-8)


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


def separate_file(input_path: str, output_root: str = "./results", output_id: str = None, should_cancel=None) -> dict:
    """
    High-level function:
    - load audio
    - normalize
    - run separation with chunking
    - denormalize
    - save stems under output_root / <output_id or uuid>/
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
    job_id = output_id or str(uuid.uuid4())
    out_dir = os.path.join(output_root, job_id)

    print(f"[separator] Loading audio from {input_path}")
    waveform, sr = load_audio(input_path, sample_rate, DEVICE)

    # Reference for normalization
    ref = waveform.mean(0)
    ref_mean = ref.mean()
    ref_std = ref.std().clamp_min(1e-8)
    waveform_norm = (waveform - ref_mean) / ref_std

    mix = waveform_norm.unsqueeze(0)

    print("[separator] Separating...")
    separated = separate_sources(
        model=model_instance,
        mix=mix,
        sample_rate=sample_rate,
        segment=SEGMENT,
        overlap=OVERLAP,
        device=DEVICE,
        should_cancel=should_cancel,
    )[0]  # (num_sources, channels, length)

    # De-normalize
    separated = separated * ref_std + ref_mean

    base_name = os.path.splitext(os.path.basename(input_path))[0]

    if should_cancel:
        should_cancel()

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
