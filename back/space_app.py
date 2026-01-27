# space_app.py
# Hugging Face Spaces - Audio Processing Server
# Handles BPM/Key analysis and stem separation with async job queue

from fastapi import FastAPI, UploadFile, File, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from typing import Dict, Optional
from enum import Enum
import os
import uuid
import tempfile
import shutil
import threading
import time
import traceback
from datetime import datetime, timedelta
from contextlib import asynccontextmanager

import analysis

# Lazy import for separator (heavy dependencies)
seperator = None

def get_separator():
    global seperator
    if seperator is None:
        import seperator as sep_module
        seperator = sep_module
    return seperator


# === Configuration ===
RESULTS_DIR = "/tmp/dj_results"
MAX_FILE_SIZE_MB = 50
FILE_TTL_MINUTES = 30  # Files deleted after 30 minutes
CLEANUP_INTERVAL_SECONDS = 300  # Run cleanup every 5 minutes

os.makedirs(RESULTS_DIR, exist_ok=True)


# === Job Status Enum ===
class JobStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


# === In-Memory Job Store ===
class JobStore:
    def __init__(self):
        self._jobs: Dict[str, dict] = {}
        self._lock = threading.Lock()

    def create_job(self, job_id: str, filename: str) -> dict:
        job = {
            "id": job_id,
            "filename": filename,
            "status": JobStatus.PENDING,
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
            "progress": 0,
            "error": None,
            "stems": {},
        }
        with self._lock:
            self._jobs[job_id] = job
        return job

    def update_job(self, job_id: str, **kwargs):
        with self._lock:
            if job_id in self._jobs:
                self._jobs[job_id].update(kwargs)
                self._jobs[job_id]["updated_at"] = datetime.utcnow().isoformat()

    def get_job(self, job_id: str) -> Optional[dict]:
        with self._lock:
            return self._jobs.get(job_id, {}).copy() if job_id in self._jobs else None

    def delete_job(self, job_id: str):
        with self._lock:
            if job_id in self._jobs:
                del self._jobs[job_id]

    def get_all_jobs(self) -> Dict[str, dict]:
        with self._lock:
            return {k: v.copy() for k, v in self._jobs.items()}

    def cleanup_old_jobs(self, max_age_minutes: int = FILE_TTL_MINUTES):
        """Remove jobs older than max_age_minutes."""
        now = datetime.utcnow()
        to_delete = []

        with self._lock:
            for job_id, job in self._jobs.items():
                created_at = datetime.fromisoformat(job["created_at"])
                if now - created_at > timedelta(minutes=max_age_minutes):
                    to_delete.append(job_id)

        for job_id in to_delete:
            self.delete_job(job_id)
            # Also delete files
            job_dir = os.path.join(RESULTS_DIR, job_id)
            if os.path.exists(job_dir):
                shutil.rmtree(job_dir, ignore_errors=True)

        return len(to_delete)


job_store = JobStore()


# === Background Cleanup Task ===
def cleanup_old_files():
    """Periodic cleanup of old result files."""
    while True:
        try:
            time.sleep(CLEANUP_INTERVAL_SECONDS)
            deleted = job_store.cleanup_old_jobs()
            if deleted > 0:
                print(f"[cleanup] Deleted {deleted} old jobs")
        except Exception as e:
            print(f"[cleanup] Error: {e}")


# Start cleanup thread
cleanup_thread = threading.Thread(target=cleanup_old_files, daemon=True)
cleanup_thread.start()


# === Lifespan Context ===
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[space_app] Starting up...")
    yield
    print("[space_app] Shutting down...")


# === FastAPI App ===
app = FastAPI(
    title="DJ Audio Processing API",
    description="Audio analysis and stem separation service",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS Configuration - Allow specific origins for production
ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "https://*.vercel.app",
    "https://*.onrender.com",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For HF Spaces, allow all (behind their proxy)
    allow_credentials=False,  # Don't use credentials with wildcard
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
    max_age=86400,  # Cache preflight for 24 hours
)


# === Health Check ===
@app.get("/")
def root():
    return {
        "service": "DJ Audio Processing API",
        "status": "running",
        "version": "2.0.0",
    }


@app.get("/health")
def health_check():
    """Health check endpoint for monitoring."""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "jobs_count": len(job_store.get_all_jobs()),
    }


@app.get("/ping")
def ping():
    return {"status": "ok"}


# === Analysis Endpoint ===
@app.post("/analyze")
async def analyze_audio(file: UploadFile = File(...)):
    """
    Analyze audio file to extract BPM, key, and metadata.
    This is synchronous as it's relatively fast.
    """
    temp_file = None
    try:
        # Validate file size (read in chunks)
        contents = await file.read()
        file_size_mb = len(contents) / (1024 * 1024)

        if file_size_mb > MAX_FILE_SIZE_MB:
            raise HTTPException(
                status_code=413,
                detail=f"File too large. Maximum size is {MAX_FILE_SIZE_MB}MB"
            )

        filename = file.filename or "unknown.mp3"

        # Run analysis
        result = analysis.analyze_audio(contents, filename)

        return {
            "success": True,
            **result
        }

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# === Separation Endpoints ===
def process_separation(job_id: str, file_path: str, filename: str):
    """Background task to process audio separation."""
    try:
        job_store.update_job(job_id, status=JobStatus.PROCESSING, progress=10)

        # Get separator module
        sep = get_separator()

        job_store.update_job(job_id, progress=30)

        # Run separation
        result = sep.separate_file(file_path, output_root=RESULTS_DIR)

        job_store.update_job(job_id, progress=90)

        # Update job with results
        stems = {}
        for stem_name, stem_path in result["sources"].items():
            if os.path.exists(stem_path):
                stems[stem_name] = {
                    "filename": os.path.basename(stem_path),
                    "path": stem_path,
                    "size": os.path.getsize(stem_path),
                }

        job_store.update_job(
            job_id,
            status=JobStatus.COMPLETED,
            progress=100,
            stems=stems,
        )

        print(f"[separation] Job {job_id} completed successfully")

    except Exception as e:
        traceback.print_exc()
        job_store.update_job(
            job_id,
            status=JobStatus.FAILED,
            error=str(e),
        )
        print(f"[separation] Job {job_id} failed: {e}")

    finally:
        # Clean up temp input file
        if os.path.exists(file_path):
            try:
                os.unlink(file_path)
            except:
                pass


@app.post("/separate")
async def separate_audio(
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = None
):
    """
    Start audio separation job.
    Returns job_id immediately, process runs in background.
    Poll /job/{job_id} for status.
    """
    temp_file = None
    try:
        # Read file
        contents = await file.read()
        file_size_mb = len(contents) / (1024 * 1024)

        if file_size_mb > MAX_FILE_SIZE_MB:
            raise HTTPException(
                status_code=413,
                detail=f"File too large. Maximum size is {MAX_FILE_SIZE_MB}MB"
            )

        filename = file.filename or "unknown.mp3"

        # Create job
        job_id = str(uuid.uuid4())
        job_dir = os.path.join(RESULTS_DIR, job_id)
        os.makedirs(job_dir, exist_ok=True)

        # Save to temp file
        ext = os.path.splitext(filename)[1] or ".mp3"
        temp_file = os.path.join(job_dir, f"input{ext}")
        with open(temp_file, "wb") as f:
            f.write(contents)

        # Create job entry
        job_store.create_job(job_id, filename)

        # Start background processing
        if background_tasks:
            background_tasks.add_task(process_separation, job_id, temp_file, filename)
        else:
            # Fallback: run in thread
            thread = threading.Thread(
                target=process_separation,
                args=(job_id, temp_file, filename),
                daemon=True
            )
            thread.start()

        return {
            "success": True,
            "job_id": job_id,
            "status": JobStatus.PENDING,
            "message": "Separation job started. Poll /job/{job_id} for status.",
        }

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/job/{job_id}")
async def get_job_status(job_id: str):
    """Get the status of a separation job."""
    job = job_store.get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    response = {
        "job_id": job["id"],
        "status": job["status"],
        "progress": job["progress"],
        "filename": job["filename"],
        "created_at": job["created_at"],
        "updated_at": job["updated_at"],
    }

    if job["status"] == JobStatus.COMPLETED:
        response["stems"] = {
            name: {
                "filename": info["filename"],
                "size": info["size"],
                "download_url": f"/job/{job_id}/stems/{name}",
            }
            for name, info in job["stems"].items()
        }

    if job["status"] == JobStatus.FAILED:
        response["error"] = job["error"]

    return response


@app.get("/job/{job_id}/stems/{stem_name}")
async def download_stem(job_id: str, stem_name: str):
    """Download a completed stem file."""
    job = job_store.get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job["status"] != JobStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Job not completed yet")

    if stem_name not in job["stems"]:
        raise HTTPException(
            status_code=404,
            detail=f"Stem '{stem_name}' not found. Available: {list(job['stems'].keys())}"
        )

    stem_info = job["stems"][stem_name]
    file_path = stem_info["path"]

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Stem file not found on disk")

    return FileResponse(
        file_path,
        media_type="audio/wav",
        filename=stem_info["filename"],
    )


# === Admin Endpoints ===
@app.get("/jobs")
async def list_jobs():
    """List all active jobs (for debugging)."""
    jobs = job_store.get_all_jobs()
    return {
        "count": len(jobs),
        "jobs": [
            {
                "job_id": j["id"],
                "status": j["status"],
                "filename": j["filename"],
                "created_at": j["created_at"],
            }
            for j in jobs.values()
        ]
    }


@app.delete("/job/{job_id}")
async def delete_job(job_id: str):
    """Delete a job and its files."""
    job = job_store.get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Delete files
    job_dir = os.path.join(RESULTS_DIR, job_id)
    if os.path.exists(job_dir):
        shutil.rmtree(job_dir, ignore_errors=True)

    # Delete job entry
    job_store.delete_job(job_id)

    return {"success": True, "message": f"Job {job_id} deleted"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=7860)
