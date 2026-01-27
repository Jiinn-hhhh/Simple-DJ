---
title: Simple DJ Audio Separator
emoji: 🎧
colorFrom: purple
colorTo: pink
sdk: docker
pinned: false
license: mit
---

# Simple DJ - Audio Separator API

This Hugging Face Space provides audio processing services for the Simple DJ application:

- **BPM Detection**: Analyzes audio to detect tempo
- **Key Detection**: Identifies musical key using chroma features
- **Stem Separation**: Separates audio into drums, bass, vocals, and other using HDemucs

## API Endpoints

### Health Check
```
GET /health
GET /ping
```

### Audio Analysis
```
POST /analyze
Content-Type: multipart/form-data
Body: file (audio file)

Response: { bpm, key, duration, sample_rate }
```

### Stem Separation
```
POST /separate
Content-Type: multipart/form-data
Body: file (audio file)

Response: { job_id, status }
```

### Job Status
```
GET /job/{job_id}

Response: { job_id, status, progress, stems }
```

### Download Stem
```
GET /job/{job_id}/stems/{stem_name}
stem_name: drums | bass | vocals | other

Response: audio/wav file
```

## Architecture

This Space uses asynchronous job processing:

1. Client uploads audio file
2. Server returns job_id immediately
3. Client polls `/job/{job_id}` for status
4. When complete, client downloads stems

This architecture prevents timeout issues with long-running separation tasks.

## Supported Formats

- MP3, WAV, FLAC, OGG, M4A
- Maximum file size: 50MB

## Deployment Notes

- Files are automatically cleaned up after 30 minutes
- GPU recommended for faster separation (T4 or better)
- CPU fallback available but slower

## Related

- [Simple DJ Frontend](https://github.com/your-username/simple-dj)
- [Render Backend Gateway](https://dj-console-backend.onrender.com)
