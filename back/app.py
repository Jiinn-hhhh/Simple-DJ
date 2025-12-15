from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
import os
import uuid
from typing import Dict
import requests
import base64
import logging

# 로깅 설정
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# In-memory storage for track information
# In production, use a database
tracks_db: Dict[str, dict] = {}


@app.get("/")
def read_root():
    return {"message": "DJ backend is alive!"}

@app.get("/ping")
def ping():
    return {"status": "ok"}

@app.get("/analyze-demo")
def analyze_demo(track_name: str):
    return {
        "track_name": track_name,
        "bpm": 128,
        "key": "C minor",
        "message": "This is a fake analysis result."
    }
@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    # 1) 업로드된 파일 내용을 한 번에 메모리로 읽기
    contents = await file.read()

    # 2) 저장할 경로 만들기
    file_path = os.path.join(UPLOAD_DIR, file.filename)

    # 3) 파일을 디스크에 저장
    with open(file_path, "wb") as f:
        f.write(contents)

    # 4) 파일 크기(바이트) 계산
    file_size = len(contents)

    # 5) 결과 반환 (이제 분석 정보 하나 추가!)
    return {
        "filename": file.filename,
        "size_bytes": file_size,
    }
@app.post("/analyze")
async def analyze(file: UploadFile = File(...)):
    """
    Analyze audio file to extract BPM, key, and other metadata.
    Uses Hugging Face Spaces API for analysis.
    """
    try:
        logger.info(f"[ANALYZE] Request received - filename: {file.filename}, content_type: {file.content_type}")
        
        contents = await file.read()
        filename = file.filename
        logger.info(f"[ANALYZE] File size: {len(contents)} bytes ({len(contents) / 1024 / 1024:.2f} MB)")
        
        # Call Hugging Face Spaces API for analysis
        if not HF_SPACE_URL:
            logger.error("[ANALYZE] HUGGINGFACE_SPACE_URL environment variable not set")
            return JSONResponse(
                status_code=500,
                content={"error": "HUGGINGFACE_SPACE_URL environment variable not set"}
            )
        
        space_api_url = f"{HF_SPACE_URL}/analyze"
        files = {"file": (filename, contents, file.content_type)}
        
        logger.info(f"[ANALYZE] Calling Spaces API: {space_api_url}")
        response = requests.post(space_api_url, files=files, timeout=300) # 5분 타임아웃
        response.raise_for_status() # HTTP 에러 발생 시 예외 처리
        
        result = response.json()
        logger.info(f"[ANALYZE] Analysis complete - BPM: {result.get('bpm')}, Key: {result.get('key')}, Duration: {result.get('duration')}")
        
        return result
    except requests.exceptions.RequestException as e:
        logger.error(f"[ANALYZE] Failed to call Hugging Face Spaces API: {str(e)}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to call Hugging Face Spaces API: {str(e)}"}
        )
    except Exception as e:
        logger.error(f"[ANALYZE] Error occurred: {str(e)}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"error": f"Analysis failed: {str(e)}"}
        )


@app.post("/analyze/{track_id}")
async def analyze_track(track_id: str):
    """
    Analyze a specific track (BPM, key, etc.).
    Uses Hugging Face Spaces API for analysis.
    """
    if track_id not in tracks_db:
        return JSONResponse(
            status_code=404,
            content={"error": "Track not found"}
        )
    
    track = tracks_db[track_id]
    file_path = track["file_path"]
    
    try:
        # Read file contents
        with open(file_path, "rb") as f:
            contents = f.read()
        
        # Call Hugging Face Spaces API for analysis
        if not HF_SPACE_URL:
            logger.error("[ANALYZE_TRACK] HUGGINGFACE_SPACE_URL environment variable not set")
            return JSONResponse(
                status_code=500,
                content={"error": "HUGGINGFACE_SPACE_URL environment variable not set"}
            )
        
        space_api_url = f"{HF_SPACE_URL}/analyze"
        files = {"file": (track["filename"], contents, "audio/mpeg")}
        
        logger.info(f"[ANALYZE_TRACK] Calling Spaces API for track {track_id}: {space_api_url}")
        response = requests.post(space_api_url, files=files, timeout=300)
        response.raise_for_status()
        
        result = response.json()
        
        # Update track info with analysis results
        tracks_db[track_id].update({
            "analyzed": True,
            "bpm": result["bpm"],
            "key": result["key"],
            "duration": result["duration"],
            "sample_rate": result["sample_rate"],
        })
        
        logger.info(f"[ANALYZE_TRACK] Analysis complete for track {track_id} - BPM: {result.get('bpm')}, Key: {result.get('key')}")
        
        return result
    except requests.exceptions.RequestException as e:
        logger.error(f"[ANALYZE_TRACK] Failed to call Hugging Face Spaces API: {str(e)}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to call Hugging Face Spaces API: {str(e)}"}
        )
    except Exception as e:
        logger.error(f"[ANALYZE_TRACK] Error occurred: {str(e)}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"error": f"Analysis failed: {str(e)}"}
        )


RESULTS_DIR = "results"
os.makedirs(RESULTS_DIR, exist_ok=True)

# Hugging Face Spaces URL (환경 변수에서 가져오기)
HF_SPACE_URL = os.getenv("HUGGINGFACE_SPACE_URL", "")


@app.post("/separate")
async def separate(file: UploadFile = File(...)):
    """
    Separate audio file into stems (drums, bass, vocals, other).
    Uses Hugging Face Spaces API for separation.
    Returns job ID and paths to separated stems.
    """
    if not HF_SPACE_URL:
        return {"error": "HUGGINGFACE_SPACE_URL environment variable not set"}
    
    # Read file contents
    contents = await file.read()
    filename = file.filename
    
    # Call Hugging Face Spaces API
    try:
        space_api_url = f"{HF_SPACE_URL}/separate"
        
        # Prepare file for upload
        files = {"file": (filename, contents, file.content_type)}
        
        # Make request to Spaces API
        response = requests.post(space_api_url, files=files, timeout=300)
        response.raise_for_status()
        
        result = response.json()
        
        # Decode base64 data and save files
        job_id = result.get("job_id", str(uuid.uuid4()))
        job_dir = os.path.join(RESULTS_DIR, job_id)
        os.makedirs(job_dir, exist_ok=True)
        
        sources = {}
        sources_data = result.get("sources", {})
        
        for stem_name, stem_info in sources_data.items():
            if isinstance(stem_info, dict) and "data" in stem_info:
                # Decode base64 data
                audio_data = base64.b64decode(stem_info["data"])
                
                # Save to file
                stem_filename = stem_info.get("filename", f"{filename}_{stem_name}.wav")
                stem_path = os.path.join(job_dir, stem_filename)
                
                with open(stem_path, "wb") as f:
                    f.write(audio_data)
                
                sources[stem_name] = stem_path
        
        return {
            "job_id": job_id,
            "sources": sources,
            "filename": filename,
        }
    except requests.exceptions.RequestException as e:
        return {"error": f"Failed to call Hugging Face Spaces API: {str(e)}"}
    except Exception as e:
        return {"error": f"Error processing separation: {str(e)}"}


@app.post("/separate/{track_id}")
async def separate_track(track_id: str):
    """
    Separate a specific track into stems.
    Uses Hugging Face Spaces API for separation.
    """
    if track_id not in tracks_db:
        return {"error": "Track not found"}
    
    if not HF_SPACE_URL:
        return {"error": "HUGGINGFACE_SPACE_URL environment variable not set"}
    
    track = tracks_db[track_id]
    file_path = track["file_path"]
    
    # Read file and call Spaces API
    try:
        with open(file_path, "rb") as f:
            contents = f.read()
        
        space_api_url = f"{HF_SPACE_URL}/separate"
        files = {"file": (track["filename"], contents, "audio/mpeg")}
        
        response = requests.post(space_api_url, files=files, timeout=300)
        response.raise_for_status()
        
        result = response.json()
        
        # Decode and save stems
        job_id = result.get("job_id", str(uuid.uuid4()))
        job_dir = os.path.join(RESULTS_DIR, job_id)
        os.makedirs(job_dir, exist_ok=True)
        
        sources = {}
        sources_data = result.get("sources", {})
        
        for stem_name, stem_info in sources_data.items():
            if isinstance(stem_info, dict) and "data" in stem_info:
                audio_data = base64.b64decode(stem_info["data"])
                stem_filename = stem_info.get("filename", f"{track['filename']}_{stem_name}.wav")
                stem_path = os.path.join(job_dir, stem_filename)
                
                with open(stem_path, "wb") as f:
                    f.write(audio_data)
                
                sources[stem_name] = stem_path
        
        # Update track info
        tracks_db[track_id].update({
            "separated": True,
            "separation_job_id": job_id,
            "stems": sources,
        })
        
        return {
            "job_id": job_id,
            "sources": sources,
            "filename": track["filename"],
        }
    except requests.exceptions.RequestException as e:
        return {"error": f"Failed to call Hugging Face Spaces API: {str(e)}"}
    except Exception as e:
        return {"error": f"Error processing separation: {str(e)}"}


@app.get("/stems/{job_id}/{stem_name}")
async def get_stem(job_id: str, stem_name: str):
    """
    Download a separated stem file.
    
    Args:
        job_id: Job ID from separation result
        stem_name: Name of the stem (drums, bass, vocals, other)
    """
    # Find the stem file
    job_dir = os.path.join(RESULTS_DIR, job_id)
    
    # Look for files matching the pattern
    if not os.path.exists(job_dir):
        return {"error": "Job not found"}
    
    # Find the stem file
    for file in os.listdir(job_dir):
        if file.endswith(f"_{stem_name}.wav"):
            file_path = os.path.join(job_dir, file)
            return FileResponse(
                file_path,
                media_type="audio/wav",
                filename=file
            )
    
    return {"error": "Stem not found"}


@app.post("/upload-tracks")
async def upload_tracks(track1: UploadFile = File(...), track2: UploadFile = File(...)):
    """
    Upload two audio tracks for DJ mixing.
    Returns track IDs for both tracks.
    """
    track_ids = []
    
    for idx, file in enumerate([track1, track2], 1):
        # Generate unique track ID
        track_id = str(uuid.uuid4())
        
        # Read file contents
        contents = await file.read()
        filename = file.filename
        
        # Save file
        file_path = os.path.join(UPLOAD_DIR, f"{track_id}_{filename}")
        with open(file_path, "wb") as f:
            f.write(contents)
        
        # Store track information
        tracks_db[track_id] = {
            "id": track_id,
            "filename": filename,
            "file_path": file_path,
            "size_bytes": len(contents),
            "analyzed": False,
            "separated": False,
        }
        
        track_ids.append(track_id)
    
    return {
        "track1_id": track_ids[0],
        "track2_id": track_ids[1],
        "message": "Tracks uploaded successfully"
    }


@app.get("/tracks/{track_id}/info")
async def get_track_info(track_id: str):
    """
    Get information about an uploaded track.
    Returns track metadata, analysis results, and separation status.
    """
    if track_id not in tracks_db:
        return {"error": "Track not found"}
    
    track_info = tracks_db[track_id].copy()
    
    # Return track information
    return track_info


@app.get("/tracks/{track_id}/download")
async def download_track(track_id: str):
    """
    Download the original audio file for a track.
    """
    if track_id not in tracks_db:
        return {"error": "Track not found"}
    
    track = tracks_db[track_id]
    file_path = track["file_path"]
    
    if not os.path.exists(file_path):
        return {"error": "File not found"}
    
    return FileResponse(
        file_path,
        media_type="audio/mpeg",
        filename=track["filename"]
    )


class BPMAdjustRequest(BaseModel):
    track_id: str
    target_bpm: float


@app.post("/adjust-bpm")
async def adjust_bpm_endpoint(request: BPMAdjustRequest):
    """
    Adjust BPM of a track using time stretching.
    Returns the path to the adjusted file.
    """
    if request.track_id not in tracks_db:
        return {"error": "Track not found"}
    
    track = tracks_db[request.track_id]
    
    if not track.get("analyzed"):
        return {"error": "Track must be analyzed first to get original BPM"}
    
    original_bpm = track.get("bpm")
    if not original_bpm:
        return {"error": "Original BPM not found"}
    
    # Create output path
    output_filename = f"{track['id']}_bpm_{request.target_bpm}.wav"
    output_path = os.path.join(UPLOAD_DIR, output_filename)
    
    # Adjust BPM
    analysis.adjust_bpm(
        track["file_path"],
        request.target_bpm,
        original_bpm,
        output_path
    )
    
    return {
        "track_id": request.track_id,
        "original_bpm": original_bpm,
        "target_bpm": request.target_bpm,
        "output_file": output_filename,
        "download_url": f"/tracks/{request.track_id}/bpm-adjusted"
    }
