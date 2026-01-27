# app.py
# Render Backend - API Gateway to Hugging Face Spaces
# Handles routing, file cleanup, and acts as proxy to HF Spaces ML processing

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Dict, Optional
import os
import uuid
import shutil
import threading
import time
import requests
import traceback
from datetime import datetime, timedelta
from contextlib import asynccontextmanager

# === Configuration ===
UPLOAD_DIR = "uploads"
RESULTS_DIR = "results"
MAX_FILE_SIZE_MB = 50
FILE_TTL_MINUTES = 30
CLEANUP_INTERVAL_SECONDS = 300
REQUEST_TIMEOUT = 60  # Timeout for HF Spaces requests (seconds)

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(RESULTS_DIR, exist_ok=True)

# HF Spaces URL from environment
HF_SPACE_URL = os.getenv("HUGGINGFACE_SPACE_URL", "").rstrip("/")


# === File Cleanup ===
def cleanup_old_files():
    """Periodically clean up old uploaded files and results."""
    while True:
        try:
            time.sleep(CLEANUP_INTERVAL_SECONDS)
            now = datetime.utcnow()
            deleted_count = 0

            # Clean uploads
            for filename in os.listdir(UPLOAD_DIR):
                filepath = os.path.join(UPLOAD_DIR, filename)
                try:
                    mtime = datetime.utcfromtimestamp(os.path.getmtime(filepath))
                    if now - mtime > timedelta(minutes=FILE_TTL_MINUTES):
                        os.remove(filepath)
                        deleted_count += 1
                except Exception:
                    pass

            # Clean results directories
            for dirname in os.listdir(RESULTS_DIR):
                dirpath = os.path.join(RESULTS_DIR, dirname)
                try:
                    if os.path.isdir(dirpath):
                        mtime = datetime.utcfromtimestamp(os.path.getmtime(dirpath))
                        if now - mtime > timedelta(minutes=FILE_TTL_MINUTES):
                            shutil.rmtree(dirpath, ignore_errors=True)
                            deleted_count += 1
                except Exception:
                    pass

            if deleted_count > 0:
                print(f"[cleanup] Deleted {deleted_count} old files/directories")

        except Exception as e:
            print(f"[cleanup] Error: {e}")


# Start cleanup thread
cleanup_thread = threading.Thread(target=cleanup_old_files, daemon=True)
cleanup_thread.start()


# === Lifespan ===
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[app] Starting up...")
    print(f"[app] HF_SPACE_URL: {HF_SPACE_URL or 'NOT SET'}")
    yield
    print("[app] Shutting down...")


# === FastAPI App ===
app = FastAPI(
    title="Simple DJ Backend",
    description="API Gateway for DJ Console - routes to Hugging Face Spaces for ML processing",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS Configuration
ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all for simplicity; tighten in production if needed
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    max_age=86400,
)


# === Health Endpoints ===
@app.get("/")
def root():
    return {
        "service": "Simple DJ Backend",
        "status": "running",
        "version": "2.0.0",
        "hf_space_configured": bool(HF_SPACE_URL),
    }


@app.get("/health")
def health_check():
    """Health check endpoint for Render."""
    hf_status = "unknown"

    if HF_SPACE_URL:
        try:
            resp = requests.get(f"{HF_SPACE_URL}/ping", timeout=5)
            hf_status = "healthy" if resp.status_code == 200 else "unhealthy"
        except:
            hf_status = "unreachable"

    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "hf_space_status": hf_status,
    }


@app.get("/ping")
def ping():
    return {"status": "ok"}


# === Analysis Endpoint (Proxy to HF Spaces) ===
@app.post("/analyze")
async def analyze(file: UploadFile = File(...)):
    """
    Analyze audio file for BPM and key detection.
    Proxies request to Hugging Face Spaces.
    """
    if not HF_SPACE_URL:
        raise HTTPException(
            status_code=503,
            detail="HF Spaces URL not configured. Set HUGGINGFACE_SPACE_URL environment variable."
        )

    try:
        contents = await file.read()
        file_size_mb = len(contents) / (1024 * 1024)

        if file_size_mb > MAX_FILE_SIZE_MB:
            raise HTTPException(
                status_code=413,
                detail=f"File too large. Maximum size is {MAX_FILE_SIZE_MB}MB"
            )

        # Forward to HF Spaces
        files = {"file": (file.filename, contents, file.content_type or "audio/mpeg")}
        response = requests.post(
            f"{HF_SPACE_URL}/analyze",
            files=files,
            timeout=REQUEST_TIMEOUT
        )

        if response.status_code != 200:
            error_detail = "Analysis failed"
            try:
                error_data = response.json()
                error_detail = error_data.get("detail", error_data.get("error", error_detail))
            except:
                error_detail = response.text[:200]
            raise HTTPException(status_code=response.status_code, detail=error_detail)

        return response.json()

    except HTTPException:
        raise
    except requests.exceptions.Timeout:
        raise HTTPException(status_code=504, detail="HF Spaces request timed out")
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Failed to connect to HF Spaces: {str(e)}")
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# === Separation Endpoint (Proxy to HF Spaces) ===
@app.post("/separate")
async def separate(file: UploadFile = File(...)):
    """
    Start audio separation job.
    Proxies request to Hugging Face Spaces.
    Returns job_id for polling.

    Frontend should poll HF Spaces directly at:
    {HF_SPACE_URL}/job/{job_id}
    """
    if not HF_SPACE_URL:
        raise HTTPException(
            status_code=503,
            detail="HF Spaces URL not configured. Set HUGGINGFACE_SPACE_URL environment variable."
        )

    try:
        contents = await file.read()
        file_size_mb = len(contents) / (1024 * 1024)

        if file_size_mb > MAX_FILE_SIZE_MB:
            raise HTTPException(
                status_code=413,
                detail=f"File too large. Maximum size is {MAX_FILE_SIZE_MB}MB"
            )

        # Forward to HF Spaces
        files = {"file": (file.filename, contents, file.content_type or "audio/mpeg")}
        response = requests.post(
            f"{HF_SPACE_URL}/separate",
            files=files,
            timeout=REQUEST_TIMEOUT  # This should be quick as HF Spaces returns immediately
        )

        if response.status_code != 200:
            error_detail = "Separation request failed"
            try:
                error_data = response.json()
                error_detail = error_data.get("detail", error_data.get("error", error_detail))
            except:
                error_detail = response.text[:200]
            raise HTTPException(status_code=response.status_code, detail=error_detail)

        result = response.json()

        # Add HF Spaces URL for frontend to poll directly
        result["hf_space_url"] = HF_SPACE_URL

        return result

    except HTTPException:
        raise
    except requests.exceptions.Timeout:
        raise HTTPException(status_code=504, detail="HF Spaces request timed out")
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Failed to connect to HF Spaces: {str(e)}")
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# === Job Status Proxy ===
@app.get("/job/{job_id}")
async def get_job_status(job_id: str):
    """
    Proxy job status request to HF Spaces.
    Frontend can also call HF Spaces directly.
    """
    if not HF_SPACE_URL:
        raise HTTPException(
            status_code=503,
            detail="HF Spaces URL not configured"
        )

    try:
        response = requests.get(
            f"{HF_SPACE_URL}/job/{job_id}",
            timeout=10
        )

        if response.status_code == 404:
            raise HTTPException(status_code=404, detail="Job not found")

        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail="Failed to get job status")

        result = response.json()

        # Rewrite download URLs to go through this proxy or direct to HF Spaces
        if "stems" in result:
            for stem_name, stem_info in result["stems"].items():
                # Option 1: Direct to HF Spaces (recommended for performance)
                stem_info["download_url"] = f"{HF_SPACE_URL}/job/{job_id}/stems/{stem_name}"
                # Option 2: Through this proxy (uncomment if CORS issues)
                # stem_info["download_url"] = f"/job/{job_id}/stems/{stem_name}"

        result["hf_space_url"] = HF_SPACE_URL

        return result

    except HTTPException:
        raise
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Failed to connect to HF Spaces: {str(e)}")


# === Stem Download Proxy ===
@app.get("/job/{job_id}/stems/{stem_name}")
async def download_stem(job_id: str, stem_name: str):
    """
    Proxy stem download from HF Spaces.
    Useful if CORS is an issue with direct HF Spaces access.
    """
    if not HF_SPACE_URL:
        raise HTTPException(status_code=503, detail="HF Spaces URL not configured")

    try:
        response = requests.get(
            f"{HF_SPACE_URL}/job/{job_id}/stems/{stem_name}",
            timeout=120,  # Longer timeout for file download
            stream=True
        )

        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail="Failed to download stem")

        # Stream the response
        from fastapi.responses import StreamingResponse

        return StreamingResponse(
            response.iter_content(chunk_size=8192),
            media_type="audio/wav",
            headers={
                "Content-Disposition": f'attachment; filename="{stem_name}.wav"'
            }
        )

    except HTTPException:
        raise
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Failed to download from HF Spaces: {str(e)}")


# === Configuration Endpoint ===
@app.get("/config")
def get_config():
    """
    Returns configuration info for frontend.
    Frontend uses this to know where to poll for job status.
    """
    return {
        "hf_space_url": HF_SPACE_URL,
        "max_file_size_mb": MAX_FILE_SIZE_MB,
        "supported_formats": ["mp3", "wav", "flac", "ogg", "m4a"],
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
