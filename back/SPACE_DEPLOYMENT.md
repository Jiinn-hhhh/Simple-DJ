# Hugging Face Spaces 배포 가이드

이 가이드는 소스 분리 기능을 Hugging Face Spaces에 배포하는 방법을 설명합니다.

## 1. Hugging Face Space 생성

1. [Hugging Face](https://huggingface.co/)에 로그인
2. 우측 상단 **"+"** 버튼 클릭 → **"New Space"** 선택
3. Space 설정:
   - **Name**: `simple-dj-separator` (원하는 이름)
   - **SDK**: **Docker** 선택 (FastAPI 사용을 위해)
   - **Visibility**: `Public` 또는 `Private`
   - **Hardware**: 
     - 무료: `CPU basic` (느릴 수 있음)
     - 유료: `GPU T4 small` (권장, 더 빠름)
4. **"Create Space"** 클릭

## 2. Space에 파일 업로드

Space가 생성되면 다음 파일들을 업로드합니다:

### 필수 파일

1. **`app.py`** (Space 루트에)
   - `back/space_app.py`의 내용을 복사하여 `app.py`로 저장
   - 또는 Space에서 직접 편집

2. **`seperator.py`**
   - `back/seperator.py` 파일을 그대로 업로드

3. **`requirements.txt`**
   - `back/space_requirements.txt`의 내용을 복사하여 `requirements.txt`로 저장

4. **`Dockerfile`** (Docker SDK 사용 시)
   ```
   FROM python:3.11-slim

   WORKDIR /app

   COPY requirements.txt .
   RUN pip install --no-cache-dir -r requirements.txt

   COPY . .

   EXPOSE 7860

   CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "port", "7860"]
   ```

### 파일 업로드 방법

1. Space 페이지에서 **"Files and versions"** 탭 클릭
2. **"Add file"** → **"Upload files"** 선택
3. 파일들을 드래그 앤 드롭 또는 선택
4. **"Commit changes"** 클릭

## 3. Space 배포 확인

1. Space가 자동으로 빌드 시작
2. **"Logs"** 탭에서 빌드 진행 상황 확인
3. 배포 완료 후 **"API"** 탭에서 API 엔드포인트 확인

## 4. Space API URL 확인

배포 완료 후:
- Space URL: `https://huggingface.co/spaces/{username}/{space-name}`
- API 엔드포인트: `https://{username}-{space-name}.hf.space`

예시:
- Space 이름: `simple-dj-separator`
- 사용자명: `your-username`
- API URL: `https://your-username-simple-dj-separator.hf.space`

## 5. Render 환경 변수 설정

1. Render 대시보드 → `dj-console-backend` 서비스
2. **Settings** → **Environment Variables**
3. 새 변수 추가:
   - **Key**: `HUGGINGFACE_SPACE_URL`
   - **Value**: 위에서 확인한 Space API URL (예: `https://your-username-simple-dj-separator.hf.space`)
4. **Save Changes**

## 6. 테스트

1. Render 서버 재시작 (환경 변수 적용)
2. 프론트엔드에서 소스 분리 기능 테스트
3. Spaces 로그에서 실행 확인

## 주의사항

- **무료 티어 제한**: CPU basic은 느릴 수 있습니다. GPU 사용을 권장합니다.
- **타임아웃**: 긴 오디오 파일은 처리 시간이 오래 걸릴 수 있습니다.
- **메모리**: Spaces의 메모리 제한을 확인하세요.
- **API 호출 제한**: 무료 티어는 요청 수 제한이 있을 수 있습니다.

## 문제 해결

### 빌드 실패
- `requirements.txt` 확인
- 로그에서 에러 메시지 확인
- Python 버전 확인 (3.11 권장)

### API 호출 실패
- Space URL이 올바른지 확인
- CORS 설정 확인
- Space가 실행 중인지 확인 (Spaces는 일정 시간 미사용 시 절전 모드)

### 메모리 부족
- GPU 티어로 업그레이드
- 오디오 파일 크기 줄이기
- 모델 최적화

