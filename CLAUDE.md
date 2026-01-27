# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Simple DJ is a web-based DJ console application for uploading, analyzing (BPM/key detection), and mixing audio tracks with AI-powered stem separation. It features dual decks, real-time visualization, and professional DJ controls (crossfader, EQ, filters).

## Architecture

Three-tier system designed for free-tier hosting:

```
Frontend (Vercel)  →  Render Backend (Gateway)  →  HF Spaces (ML)
     │                       │                          │
  React/Vite            FastAPI proxy              HDemucs/Librosa
  Static hosting        Lightweight                GPU processing
```

### Async Job Processing (v2.0)

To avoid timeout issues, stem separation uses async polling:

1. Client uploads file to `/separate`
2. Server immediately returns `job_id`
3. Client polls `/job/{job_id}` for status
4. When complete, client downloads stems from `/job/{job_id}/stems/{name}`

### Key Features

- **Auto file cleanup**: Files deleted after 30 minutes
- **Progress tracking**: Real-time separation progress
- **Health checks**: `/health` endpoint for monitoring
- **Error recovery**: Automatic retry on network failures

## Development Commands

### Frontend

```bash
cd front
npm install           # Install dependencies
npm run dev           # Dev server at http://localhost:5173
npm run build         # Production build to dist/
npm run lint          # ESLint check
```

### Backend (Render gateway - lightweight)

```bash
cd back
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

### Backend (Spaces - requires torch)

```bash
cd back
pip install -r space_requirements.txt
uvicorn space_app:app --host 0.0.0.0 --port 7860
```

## Key Files

### Frontend
- `front/src/App.jsx` - Main orchestrator with polling logic
- `front/src/audioPlayer.js` - Web Audio API (Source → Stem Gains → EQ → Filter → Master)
- `front/src/components/Deck.jsx` - Turntable UI with progress indicator
- `front/src/components/Mixer.jsx` - Crossfader, volume, EQ controls
- `front/vercel.json` - Vercel deployment config

### Backend (Render)
- `back/app.py` - API Gateway, proxies to HF Spaces
- `back/requirements.txt` - Lightweight deps (no torch)
- `render.yaml` - Render deployment config

### Backend (HF Spaces)
- `back/space_app.py` - Async job processing server
- `back/analysis.py` - BPM/key detection (Librosa)
- `back/seperator.py` - HDemucs stem separation
- `back/space_requirements.txt` - Full ML stack
- `back/Dockerfile` - HF Spaces Docker config
- `back/README.md` - HF Spaces metadata

## Environment Variables

### Frontend (Vercel)
- `VITE_API_URL` - Render backend URL (e.g., `https://dj-console-backend.onrender.com`)

### Backend (Render)
- `HUGGINGFACE_SPACE_URL` - HF Spaces API (e.g., `https://jiinn-hhhh-seperator.hf.space`)

## API Endpoints

### Render Backend
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/ping` | GET | Health check |
| `/health` | GET | Detailed health with HF status |
| `/config` | GET | Returns HF Space URL for frontend |
| `/analyze` | POST | Proxy to HF Spaces for BPM/key |
| `/separate` | POST | Start separation job |
| `/job/{id}` | GET | Get job status |
| `/job/{id}/stems/{name}` | GET | Download stem |

### HF Spaces (same endpoints, plus)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/jobs` | GET | List all active jobs |
| `/job/{id}` | DELETE | Delete job and files |

## Deployment

### Vercel (Frontend)
1. Connect GitHub repo
2. Set `VITE_API_URL` environment variable
3. Auto-deploys on push

### Render (Backend)
1. Connect GitHub repo
2. Uses `render.yaml` for config
3. Set `HUGGINGFACE_SPACE_URL` env var
4. Auto-deploys on push

### HF Spaces (ML Processing)
See `back/SPACE_DEPLOYMENT.md` for detailed instructions.

## Notes

- **Free tier limits**: Render sleeps after 15min, HF Spaces after 48hr
- **File size limit**: 50MB max per upload
- **Supported formats**: MP3, WAV, FLAC, OGG, M4A
- **CORS**: Configured for all origins (tighten in production if needed)
