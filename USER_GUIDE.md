# 사용자 가이드: Hugging Face Spaces 설정

이 가이드는 Hugging Face Spaces를 설정하고 Render 서버와 연결하는 방법을 설명합니다.

## 📋 체크리스트

다음 단계를 순서대로 진행하세요:

- [ ] 1. Hugging Face 계정 생성 및 Space 생성
- [ ] 2. Space에 코드 업로드
- [ ] 3. Space 배포 확인 및 API URL 확인
- [ ] 4. Render 환경 변수 설정
- [ ] 5. 테스트

---

## 1️⃣ Hugging Face Space 생성

### 1-1. 계정 생성 (이미 있으면 건너뛰기)

1. [Hugging Face](https://huggingface.co/) 접속
2. 우측 상단 **"Sign Up"** 클릭
3. 이메일, 사용자명, 비밀번호 입력
4. 이메일 인증 완료

### 1-2. Space 생성

1. 로그인 후 우측 상단 **"+"** 버튼 클릭
2. **"New Space"** 선택
3. Space 설정 입력:
   - **Name**: `simple-dj-separator` (원하는 이름)
   - **SDK**: **Docker** 선택 ⚠️ 중요!
   - **Visibility**: `Public` 또는 `Private`
   - **Hardware**: 
     - 무료: `CPU basic` (느릴 수 있음)
     - 유료: `GPU T4 small` (권장, 더 빠름)
4. **"Create Space"** 클릭

---

## 2️⃣ Space에 코드 업로드

### 2-1. 필요한 파일 준비

다음 파일들을 Space에 업로드해야 합니다:

1. **`app.py`** - `back/space_app.py`의 내용을 복사
2. **`seperator.py`** - `back/seperator.py` 파일 그대로
3. **`analysis.py`** - `back/analysis.py` 파일 그대로 (BPM/Key 분석용)
4. **`requirements.txt`** - `back/space_requirements.txt`의 내용을 복사
5. **`Dockerfile`** - 아래 내용 사용

### 2-2. Dockerfile 생성

Space 루트에 `Dockerfile` 파일을 생성하고 다음 내용을 붙여넣기:

```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 7860

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
```

### 2-3. 파일 업로드 방법

**방법 A: 웹 인터페이스 사용**

1. Space 페이지에서 **"Files and versions"** 탭 클릭
2. **"Add file"** → **"Upload files"** 선택
3. 다음 파일들을 업로드:
   - `app.py` (내용: `back/space_app.py`)
   - `seperator.py` (내용: `back/seperator.py`)
   - `analysis.py` (내용: `back/analysis.py`) - 새로 추가
   - `requirements.txt` (내용: `back/space_requirements.txt`)
   - `Dockerfile` (위 내용)
4. **"Commit changes"** 클릭

**방법 B: Git 사용 (고급)**

1. Space 페이지에서 **"Files and versions"** 탭 클릭
2. **"Clone repository"** 버튼 클릭하여 Git URL 복사
3. 로컬에서:
   ```bash
   git clone <space-git-url>
   cd <space-name>
   # 필요한 파일들을 복사
   cp ../back/space_app.py app.py
   cp ../back/seperator.py seperator.py
   cp ../back/space_requirements.txt requirements.txt
   # Dockerfile 생성 (위 내용)
   git add .
   git commit -m "Initial commit"
   git push
   ```

---

## 3️⃣ Space 배포 확인 및 API URL 확인

### 3-1. 배포 확인

1. Space 페이지에서 **"Logs"** 탭 클릭
2. 빌드 진행 상황 확인
3. "Application startup complete" 메시지가 보이면 배포 완료

### 3-2. API URL 확인

배포 완료 후, API URL을 확인하는 방법:

**방법 1: Space URL에서 직접 만들기 (가장 확실한 방법)**

1. Space 페이지의 주소창을 확인하세요
   - 예: `https://huggingface.co/spaces/your-username/simple-dj-separator`
2. URL에서 다음 정보를 찾으세요:
   - `your-username` (사용자명)
   - `simple-dj-separator` (Space 이름)
3. 다음 형식으로 API URL을 만드세요:
   ```
   https://{username}-{space-name}.hf.space
   ```
4. 예시:
   - Space URL: `https://huggingface.co/spaces/john/simple-dj-separator`
   - API URL: `https://john-simple-dj-separator.hf.space`

**방법 2: API 탭 확인 (있는 경우)**

1. Space 페이지 상단 메뉴에서 **"API"** 탭 찾기
   - ⚠️ **참고**: API 탭이 보이지 않을 수 있습니다 (정상입니다)
   - 이 경우 방법 1을 사용하세요
2. API 탭이 있다면 엔드포인트 URL 확인

**방법 3: 브라우저에서 직접 테스트**

1. 만든 API URL에 `/ping`을 추가하여 테스트:
   ```
   https://your-username-simple-dj-separator.hf.space/ping
   ```
2. 브라우저에서 이 URL을 열어보세요
3. `{"status": "ok"}` 같은 응답이 오면 정상입니다

⚠️ **중요**: 
- URL 끝에 `/`를 붙이지 마세요!
- Space가 배포 완료되어야 API가 작동합니다
- 이 URL을 복사해 두세요! 다음 단계에서 사용합니다.

---

## 4️⃣ Render 환경 변수 설정

### 4-1. Render 대시보드 접속

1. [Render 대시보드](https://dashboard.render.com/) 접속
2. `dj-console-backend` 서비스 선택

### 4-2. 환경 변수 추가

1. **Settings** 탭 클릭
2. **Environment Variables** 섹션으로 스크롤
3. **"Add Environment Variable"** 클릭
4. 다음 변수 추가:
   - **Key**: `HUGGINGFACE_SPACE_URL`
   - **Value**: 위에서 복사한 Space API URL (예: `https://your-username-simple-dj-separator.hf.space`)
   - ⚠️ **주의**: URL 끝에 `/`를 붙이지 마세요!
5. **"Save Changes"** 클릭

### 4-3. 서버 재시작

환경 변수 적용을 위해 서버가 자동으로 재시작됩니다.

---

## 5️⃣ 테스트

### 5-1. API 테스트

1. 프론트엔드에서 오디오 파일 업로드
2. 소스 분리 기능 테스트
3. Spaces 로그에서 실행 확인:
   - Space 페이지 → **"Logs"** 탭
   - API 호출 및 처리 로그 확인

### 5-2. 문제 해결

**문제: "HUGGINGFACE_SPACE_URL environment variable not set"**
- 해결: Render 환경 변수가 올바르게 설정되었는지 확인

**문제: "Failed to call Hugging Face Spaces API"**
- 해결: Space URL이 올바른지 확인
- 해결: Space가 실행 중인지 확인 (일정 시간 미사용 시 절전 모드)

**문제: 타임아웃 에러**
- 해결: 긴 오디오 파일은 처리 시간이 오래 걸릴 수 있음
- 해결: GPU 티어 사용 권장

---

## 📝 참고사항

### 무료 vs 유료 티어

- **CPU basic (무료)**: 느릴 수 있음, 타임아웃 제한 있음
- **GPU T4 small (유료)**: 빠름, 권장

### Spaces 절전 모드

- 일정 시간 미사용 시 Spaces가 절전 모드로 전환
- 첫 요청 시 깨어나는 데 시간이 걸릴 수 있음 (약 30초~1분)

### API 호출 제한

- 무료 티어는 요청 수 제한이 있을 수 있음
- 자세한 내용은 Hugging Face 문서 참고

---

## ✅ 완료!

모든 설정이 완료되면:
- Render 서버는 더 이상 모델을 실행하지 않음 (메모리 부담 없음)
- 소스 분리는 Hugging Face Spaces에서 처리
- 프론트엔드는 기존과 동일하게 작동

문제가 있으면 Spaces 로그와 Render 로그를 확인하세요!

