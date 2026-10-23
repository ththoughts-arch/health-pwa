# 건강 트래커 PWA

가민(intervals.icu 경유) 수면·운동 + 직접 기록한 영양제로 매일 건강 분석을 받는 개인용 PWA. 자세한 결정 사항은 [CLAUDE.md](CLAUDE.md).

## 구조

| 경로 | 내용 |
|---|---|
| `app/` | PWA 정적 파일 (빌드 없음). GitHub Pages로 배포 |
| `app/js/firebase-config.js` | Firebase 웹 설정 (공개해도 되는 값) |
| `firestore.rules` | Firestore 보안 규칙 — `users/{uid}/` 본인만 접근 |
| `.github/workflows/pages.yml` | `app/` 변경 시 Pages 자동 배포 |
| `design/` | 디자인 시안(참고용, 배포 안 함) |

## 처음 한 번 설정

### 1. GitHub 저장소 + Pages
1. GitHub에서 새 **Public** 저장소 생성 (무료 Pages는 공개 저장소 필요. 건강 데이터는 저장소가 아니라 Firestore에 저장)
2. 이 폴더를 `main` 브랜치로 푸시
3. 저장소 **Settings → Pages → Source: GitHub Actions** 선택
4. 배포 주소: `https://<사용자명>.github.io/<저장소명>/`

### 2. Firebase (무료 Spark 플랜)
1. [Firebase 콘솔](https://console.firebase.google.com)에서 프로젝트 생성 (Google Analytics 끔)
2. **Firestore Database** 생성 → 위치 `asia-northeast3`(서울)
3. **규칙** 탭에 `firestore.rules` 내용 붙여넣고 게시
4. **Authentication → 이메일/비밀번호** 사용 설정 → **사용자 추가**로 본인 계정 생성
5. Authentication → 설정 → **승인된 도메인**에 `<사용자명>.github.io` 추가
6. 프로젝트 설정 → 내 앱 → 웹 앱 추가 → 나오는 config를 `app/js/firebase-config.js`에 붙여넣기

### 3. intervals.icu
Settings → Developer Settings에서 **API Key**와 **Athlete ID** 확인. 2단계에서 GitHub Secrets(`INTERVALS_API_KEY`, `INTERVALS_ATHLETE_ID`)로 등록한다. 저장소에 커밋하지 않는다.

## 로컬 미리보기

```powershell
powershell -ExecutionPolicy Bypass -File tools/serve.ps1
```
→ http://localhost:8080
