# PhotoGlobeViewer

로컬 사진/영상 라이브러리를 인덱싱해 지구본 위에서 탐색하는 Electron 데스크톱 앱입니다.  
GPS, 촬영 시각, 카메라/해상도/영상 길이 메타데이터를 기반으로 필터링하고, 타임라인/Trip/미리보기로 회고 탐색을 빠르게 수행할 수 있습니다.

앱 소스는 [`app/`](app) 폴더에 있습니다.

## 핵심 기능
- 멀티 루트 라이브러리 관리 (루트 추가/삭제/활성화)
- 인덱싱 제어 (취소/재시도/진행률/최근 작업 로그)
- 파일 변경 감시 기반 자동 델타 인덱싱
- 지구본 클러스터/포인트 탐색 (Cesium + Supercluster)
- 점/클러스터 클릭 시 다중 썸네일 프리뷰 스트립 (점진 로딩 + 취소)
- Hover 프리뷰 (사진/영상)
- 타임라인 바 + 재생 + undated 포함 옵션
- Trip 세그먼트 시각화 및 카드 탐색
- 달력 통계 탭 (날짜별 사진/영상 개수)
- 한국어/영어 i18n

## 시스템 요구사항
- Windows 10/11
- Node.js 22 LTS 권장
- npm (Node 포함)
- (네이티브 모듈 빌드 필요 시) Visual Studio Build Tools 2022 + C++ 워크로드

## 빠른 시작
1. 저장소 클론 및 앱 폴더 이동
```powershell
git clone https://github.com/LOG-JJ/EarthPhoto.git
cd EarthPhoto\app
```

2. 의존성 설치
```powershell
npm.cmd install
```

3. 개발 실행
```powershell
npm.cmd run dev
```

또는 배치 파일 실행:
```powershell
.\start-dev.bat
```

## 원클릭 설치/실행 (Windows)
- 단일 진입점: `app\run-built.bat`
- 기본 동작: Node/npm 확인 -> 필요 시 설치 시도(winget) -> 의존성/네이티브 모듈 준비 -> 스마트 증분 빌드 -> 앱 실행
- 실행 대상 우선순위:
  - `release\PhotoGlobeViewer-Portable-*.exe` 최신 파일
  - 없으면 `release\win-unpacked\PhotoGlobeViewer.exe`

```powershell
cd app
.\run-built.bat
```

- 옵션
```powershell
.\run-built.bat --build-only
.\run-built.bat --force-rebuild
.\run-built.bat --no-pause
```

## 빌드/배포 (수동)
- 타입체크
```powershell
npm.cmd run typecheck
```

- 프로덕션 빌드
```powershell
npm.cmd run build
```

- Windows 패키징 (설치형 + 포터블)
```powershell
npm.cmd run dist:win
```

- 포터블 exe만 빌드
```powershell
npm.cmd run dist:win:portable
```

## 실행 스크립트 (app/)
- `start-dev.bat`: 개발 실행
- `run-built.bat`: 원클릭 설치/빌드/실행 통합 스크립트

## 프로젝트 구조
- `app/main`: Electron Main, IPC, 인덱싱, DB, 워처, 썸네일, Trip/클러스터 서비스
- `app/renderer`: React UI, Globe View, 상태관리, 유즈케이스
- `app/shared`: 공용 타입/유틸

## 문서
- 기술 스택 문서: [`TECH_STACK.md`](TECH_STACK.md)
- 릴리즈/개선 노트: [`apple_toss_release_notes.md`](apple_toss_release_notes.md)
- UI/UX 개선 계획: [`design_improvement_plan.md`](design_improvement_plan.md)

## 트러블슈팅
- 앱이 검은 화면이면:
  - 최신 빌드로 재실행
  - 기존 프로세스 완전 종료 후 재시작
  - `npm.cmd run typecheck` / `npm.cmd run build` 통과 여부 확인
- 네이티브 모듈 문제 발생 시:
  - `app\run-built.bat` 재실행 (자동 복구 경로 포함)
  - `npm.cmd run postinstall` 재실행
  - Node 버전을 22 LTS로 맞춘 뒤 재설치
