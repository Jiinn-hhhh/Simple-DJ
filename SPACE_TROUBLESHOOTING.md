# Hugging Face Space 404 에러 해결 가이드

## 현재 문제 상황

- Render 서버에서 Space API 호출 시 404 에러 발생
- Space 로그에 POST 요청이 나타나지 않음
- Space의 `/ping`과 `/` 엔드포인트는 정상 작동

## 확인 사항

### 1. Space 빌드 로그 확인 (가장 중요!)

Space 페이지 → **"Logs"** 탭에서 다음을 확인:

1. **최근 빌드가 성공했는지 확인**
   - 빌드 실패 시 에러 메시지 확인
   - 특히 `analysis.py` import 관련 에러 확인

2. **확인할 에러 메시지 예시:**
   ```
   ModuleNotFoundError: No module named 'analysis'
   ImportError: cannot import name 'analyze_audio' from 'analysis'
   ```

3. **빌드가 성공했다면:**
   - "Application startup complete" 메시지 확인
   - 빌드 완료 시간 확인

### 2. Space 파일 확인

Space 페이지 → **"Files and versions"** 탭에서 확인:

#### 필수 파일 목록:
- [ ] `app.py` (3.35 kB) - `space_app.py` 내용과 동일해야 함
- [ ] `analysis.py` (4.61 kB) - 파일이 존재해야 함
- [ ] `seperator.py` (4.68 kB) - 파일이 존재해야 함
- [ ] `requirements.txt` (85 Bytes) - `space_requirements.txt` 내용과 동일해야 함
- [ ] `Dockerfile` (202 Bytes) - 올바른 내용이어야 함

#### `app.py` 내용 확인:
- 파일 상단에 `import analysis`가 있는지 확인
- `@app.post("/analyze")` 엔드포인트가 있는지 확인

### 3. Space 재배포

파일이 모두 올바르다면 Space를 재배포:

1. Space 페이지 → **"Settings"** 탭
2. **"Restart this Space"** 버튼 클릭
3. 또는 파일을 다시 커밋하여 자동 재배포 유도

### 4. 직접 POST 요청 테스트

터미널에서 다음 명령어로 테스트:

```bash
# 작은 테스트 파일로 POST 요청 보내기
curl -X POST https://jiinn-hhhh-seperator.hf.space/analyze \
  -F "file=@test.mp3" \
  -H "Content-Type: multipart/form-data"
```

**예상 결과:**
- 성공: `{"bpm": ..., "key": ..., ...}` 또는 에러 메시지
- 실패: `404 Not Found` → Space의 `/analyze` 엔드포인트가 없음

### 5. Space 로그에서 POST 요청 확인

Space 페이지 → **"Logs"** 탭에서:

1. 프론트엔드에서 오디오 파일 업로드
2. Render 서버에서 Space로 요청 전송
3. Space 로그에 다음이 나타나는지 확인:
   ```
   INFO: ... - "POST /analyze HTTP/1.1" 200 OK
   ```
   또는
   ```
   INFO: ... - "POST /analyze HTTP/1.1" 500 Internal Server Error
   ```

## 문제 해결 단계

### 단계 1: Space 빌드 로그 확인
- [ ] Space 로그에서 빌드 성공 여부 확인
- [ ] `analysis.py` import 에러 확인
- [ ] 빌드 실패 시 에러 메시지 확인

### 단계 2: Space 파일 확인
- [ ] 모든 필수 파일이 Space에 있는지 확인
- [ ] `app.py`에 `/analyze` 엔드포인트가 있는지 확인
- [ ] `app.py`에 `import analysis`가 있는지 확인

### 단계 3: Space 재배포
- [ ] Space 재시작 또는 재배포
- [ ] 빌드 완료 확인
- [ ] "Application startup complete" 메시지 확인

### 단계 4: 테스트
- [ ] `/ping` 엔드포인트 테스트
- [ ] 직접 POST 요청 테스트
- [ ] Render 서버에서 Space API 호출 테스트

## 예상 원인 및 해결책

### 원인 1: Space 빌드 실패
**증상:** Space 로그에 빌드 에러 메시지
**해결:** 
- `requirements.txt` 확인
- `analysis.py` 파일 확인
- Space 재배포

### 원인 2: Space가 재배포되지 않음
**증상:** 파일은 올바르지만 최근 빌드가 없음
**해결:**
- Space 재시작
- 파일을 다시 커밋하여 재배포 유도

### 원인 3: Space의 `app.py`가 최신 버전이 아님
**증상:** `/analyze` 엔드포인트가 없음
**해결:**
- `back/space_app.py` 내용을 Space의 `app.py`에 복사
- Space 재배포

## 다음 단계

위 단계를 모두 확인한 후에도 문제가 지속되면:

1. Space의 빌드 로그 전체 내용 확인
2. Space의 `app.py` 파일 내용 재확인
3. Render 서버 로그에서 실제 요청 URL 확인

