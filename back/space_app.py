# space_app.py
# Hugging Face Spaces에서 실행될 FastAPI 서버
# 이 파일을 Space의 app.py로 사용하거나, Space 설정에서 이 파일을 지정

from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import os
import uuid
import tempfile
import shutil

import seperator
import analysis

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Spaces에서 사용할 임시 디렉토리
TEMP_DIR = "/tmp"
RESULTS_DIR = os.path.join(TEMP_DIR, "results")
os.makedirs(RESULTS_DIR, exist_ok=True)


@app.get("/")
def read_root():
    return {"message": "Audio Source Separation API - Running on Hugging Face Spaces"}


@app.get("/ping")
def ping():
    return {"status": "ok"}


@app.post("/analyze")
async def analyze(file: UploadFile = File(...)):
    """
    Analyze audio file to extract BPM, key, and other metadata.
    Returns analysis results (BPM, key, duration, sample_rate).
    """
    temp_file = None
    try:
        contents = await file.read()
        filename = file.filename
        
        # Run analysis using analysis.py
        result = analysis.analyze_audio(contents, filename)
        
        return result
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )


@app.post("/separate")
async def separate(file: UploadFile = File(...)):
    """
    Separate audio file into stems (drums, bass, vocals, other).
    Returns job ID and base64-encoded stems or download URLs.
    """
    # 임시 파일로 저장
    temp_file = None
    try:
        contents = await file.read()
        filename = file.filename
        
        # 임시 파일 생성
        with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(filename)[1]) as tmp:
            tmp.write(contents)
            temp_file = tmp.name
        
        # Run separation
        result = seperator.separate_file(temp_file, output_root=RESULTS_DIR)
        
        # 결과 파일들을 읽어서 base64로 인코딩하거나 경로 반환
        # Spaces에서는 파일을 직접 반환하기 어려우므로, 
        # base64 인코딩된 데이터를 반환하거나 다운로드 URL을 제공
        
        import base64
        sources_data = {}
        
        for stem_name, stem_path in result["sources"].items():
            if os.path.exists(stem_path):
                with open(stem_path, "rb") as f:
                    audio_data = f.read()
                    sources_data[stem_name] = {
                        "data": base64.b64encode(audio_data).decode("utf-8"),
                        "filename": os.path.basename(stem_path)
                    }
        
        return {
            "job_id": result["id"],
            "sources": sources_data,
            "filename": filename,
        }
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )
    finally:
        # 임시 파일 정리
        if temp_file and os.path.exists(temp_file):
            os.unlink(temp_file)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=7860)

