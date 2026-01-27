# Hugging Face Spaces 배포 가이드

이 가이드는 Simple DJ의 오디오 처리 기능을 Hugging Face Spaces에 배포하는 방법을 설명합니다.

## 아키텍처 개요

```
Frontend (Vercel) → Render Backend (Gateway) → HF Spaces (ML Processing)
                           ↓                           ↓
                    프록시 역할만               실제 오디오 처리
                    (torch 불필요)              (HDemucs, Librosa)
```

### 새로운 비동기 처리 방식

1. 클라이언트가 `/separate`에 파일 업로드
2. 서버가 즉시 `job_id` 반환 (타임아웃 방지)
3. 클라이언트가 `/job/{job_id}`를 폴링하여 상태 확인
4. 완료 시 `/job/{job_id}/stems/{stem_name}`에서 다운로드

## 1. Hugging Face Space 생성

1. [Hugging Face](https://huggingface.co/)에 로그인
2. 우측 상단 **"+"** 버튼 → **"New Space"** 선택
3. Space 설정:
   - **Name**: `simple-dj-separator`
   - **SDK**: **Docker** 선택
   - **Visibility**: `Public` 또는 `Private`
   - **Hardware**:
     - 무료: `CPU basic` (느림, ~5분/곡)
     - 유료 권장: `GPU T4 small` (~30초/곡)
4. **"Create Space"** 클릭

## 2. 필요한 파일들

### Space에 업로드할 파일 목록

```
your-space/
├── README.md           # Space 메타데이터 (YAML frontmatter)
├── Dockerfile          # Docker 빌드 설정
├── requirements.txt    # Python 의존성 (space_requirements.txt 내용)
├── app.py              # FastAPI 서버 (space_app.py 내용)
├── analysis.py         # BPM/Key 분석 모듈
└── seperator.py        # HDemucs 스템 분리 모듈
```

### 파일 복사 방법

```bash
# 터미널에서 실행
cd back/

# README.md - 이미 준비됨
cp README.md ../hf-space/README.md

# Dockerfile - 이미 준비됨
cp Dockerfile ../hf-space/Dockerfile

# requirements.txt
cp space_requirements.txt ../hf-space/requirements.txt

# app.py (space_app.py를 app.py로)
cp space_app.py ../hf-space/app.py

# 분석 모듈
cp analysis.py ../hf-space/
cp seperator.py ../hf-space/
```

## 3. 파일 업로드

1. Space 페이지에서 **"Files and versions"** 탭 클릭
2. **"Add file"** → **"Upload files"** 선택
3. 위의 파일들을 모두 업로드
4. **"Commit changes"** 클릭

## 4. 배포 확인

1. Space가 자동으로 빌드 시작
2. **"Logs"** 탭에서 빌드 진행 상황 확인
3. 성공 시 **"Running"** 상태 표시

### API URL 확인

- Space URL: `https://huggingface.co/spaces/{username}/{space-name}`
- API 엔드포인트: `https://{username}-{space-name}.hf.space`

예시:
```
Space: jiinn/hhhh-seperator
API: https://jiinn-hhhh-seperator.hf.space
```

## 5. Render 환경 변수 설정

1. Render 대시보드 → `dj-console-backend` 서비스
2. **Settings** → **Environment Variables**
3. 변수 설정:
   - **Key**: `HUGGINGFACE_SPACE_URL`
   - **Value**: `https://jiinn-hhhh-seperator.hf.space` (실제 URL로 변경)
4. **Save Changes** → 서비스 자동 재시작

## 6. Vercel 환경 변수 설정

1. Vercel 대시보드 → 프로젝트 선택
2. **Settings** → **Environment Variables**
3. 변수 설정:
   - **Key**: `VITE_API_URL`
   - **Value**: `https://dj-console-backend.onrender.com` (Render URL)
4. **Redeploy** 실행

## 7. 테스트

### API 직접 테스트

```bash
# Health check
curl https://jiinn-hhhh-seperator.hf.space/health

# 분석 테스트
curl -X POST https://jiinn-hhhh-seperator.hf.space/analyze \
  -F "file=@test.mp3"

# 분리 작업 시작
curl -X POST https://jiinn-hhhh-seperator.hf.space/separate \
  -F "file=@test.mp3"

# 작업 상태 확인 (job_id를 실제 값으로 교체)
curl https://jiinn-hhhh-seperator.hf.space/job/{job_id}
```

## 주요 개선사항 (v2.0)

1. **비동기 처리**: 타임아웃 문제 해결
2. **자동 파일 정리**: 30분 후 자동 삭제
3. **진행률 표시**: 프론트엔드에서 진행 상황 확인 가능
4. **에러 복구**: 네트워크 오류 시 자동 재시도
5. **Health check**: 서비스 상태 모니터링

## 문제 해결

### 빌드 실패

```bash
# 로그 확인
# Spaces > Logs 탭에서 에러 메시지 확인

# 일반적인 원인:
# - requirements.txt 의존성 충돌
# - Dockerfile 문법 오류
# - 파일 누락 (analysis.py, seperator.py)
```

### API 호출 실패 (502/504)

- Space가 cold start 중일 수 있음 (1-2분 대기)
- GPU 티어로 업그레이드 권장
- 파일 크기가 50MB 이하인지 확인

### 분리 작업 실패

- GPU 메모리 부족 → 더 작은 파일 시도
- 지원하지 않는 오디오 형식 → mp3/wav로 변환
- Job 로그에서 상세 에러 확인

### CORS 오류

- Space의 CORS 설정 확인
- Render 프록시를 통해 요청하도록 변경

## 비용 참고

| Hardware | 비용 | 처리 속도 (3분 곡) |
|----------|------|-------------------|
| CPU Basic | 무료 | ~5분 |
| CPU Upgrade | $0.03/hr | ~3분 |
| T4 Small | $0.40/hr | ~30초 |
| T4 Medium | $0.60/hr | ~20초 |

무료 티어는 48시간 비활성 시 슬립 모드로 전환됩니다.
