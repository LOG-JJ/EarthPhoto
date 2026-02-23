# PhotoGlobeViewer (Windows MVP)

로컬 사진/영상의 EXIF GPS를 인덱싱해서 지구본(Cesium.js) 위에 표시하는 Electron 데스크탑 앱입니다.

## 처음 받는 작업자용 시작 가이드
아래 순서대로 진행하면 처음 받는 PC에서도 실행할 수 있습니다.

1. 저장소 클론 후 `app` 폴더로 이동
```powershell
git clone https://github.com/LOG-JJ/EarthPhoto.git
cd EarthPhoto\app
```

2. 필수 프로그램 설치
- Windows 10/11
- Node.js **22 LTS** (중요: 24 계열은 `better-sqlite3` 빌드 실패 가능)
- Visual Studio Build Tools 2022
- `Desktop development with C++`
- MSVC v143
- Windows 10/11 SDK
- CMake tools

3. (선택) Cesium Ion 토큰 설정  
기본 실행은 토큰 없이도 가능하지만, 토큰을 쓰면 Cesium 리소스 사용이 안정적입니다.
```powershell
setx CESIUM_ION_TOKEN "여기에_토큰"
```

4. 개발 실행(권장)
- `start-dev.bat` 더블클릭
- 또는 PowerShell에서:
```powershell
.\start-dev.bat
```

`start-dev.bat`는 자동으로 아래를 처리합니다.
- `npm install` (최초 1회)
- 경로 특수문자 문제 회피(`subst` 임시 드라이브 매핑)
- 네이티브 모듈(`better-sqlite3`) 복구 시도
- Vite + Electron 개발 실행

5. 실행 확인
- 앱이 열리면 `폴더 선택`으로 사진/영상 루트를 추가
- 인덱싱 완료 후 지구본에 포인트/클러스터가 보이면 정상

## 빠른 실행/배포 명령
명령어 입력 없이 배치파일만으로 실행 가능합니다.

1. 개발 실행: `start-dev.bat`
2. Windows 설치 파일 빌드: `build-win.bat`
3. 빌드된 exe 실행: `run-built.bat`
4. 공유용 패키지 생성(설치파일+휴대용ZIP): `share-win.bat`

`start-dev.bat`/`build-win.bat`는 자동으로 임시 드라이브를 매핑해(`subst`) 경로 특수문자 이슈를 피하고, 필요한 경우 네이티브 모듈(`better-sqlite3`)도 재설정합니다.

## 주요 기능
- 폴더 선택 후 증분 인덱싱 (`path + mtimeMs + sizeBytes`)
- 사진/영상 메타 추출 (GPS, 촬영시각, 해상도, 영상 길이)
- Main 프로세스 `supercluster` 기반 클러스터링
- Cesium.js 기반 고해상도 타일 지구본 렌더링
- 점/클러스터 클릭 시 사진/영상 썸네일 미리보기
- 영상 선택 시 패널 내 비디오 재생 미리보기
- 비디오 점 hover 시 짧은 루프 프리뷰(WebP) 자동 표시
- 썸네일 디스크 캐시 (`%APPDATA%/PhotoGlobeViewer/thumbs`)
- 한국어/영어 전환, 파일 감시 옵션

## Cesium Ion 토큰
`start-dev.bat`/`build-win.bat` 실행 전에 토큰을 환경변수로 설정하면 자동 적용됩니다.

```powershell
setx CESIUM_ION_TOKEN "여기에_토큰"
```

현재 터미널 세션에 바로 적용하려면:

```powershell
$env:CESIUM_ION_TOKEN="여기에_토큰"
```

## 개발 환경
- Windows 10/11
- Node.js **22 LTS**
- Visual Studio Build Tools (C++ 워크로드 권장)

## 수동 실행 (필요할 때만)
가능하면 배치 파일(`start-dev.bat`) 사용을 권장합니다.

```powershell
npm.cmd install
npm.cmd run dev
```

빌드:

```powershell
npm.cmd run build
npm.cmd run dist:win
```

## 자주 발생하는 문제
1. `better-sqlite3` 바인딩 에러
- `start-dev.bat` 또는 `build-win.bat`를 먼저 실행하세요.
- 그래도 동일하면 `npm.cmd run postinstall` 후 재실행하세요.
- Node 24 이상이면 Node 22 LTS로 변경 후 `npm.cmd install`을 다시 실행하세요.

2. 검은 화면/렌더러 미로드
- 반드시 `start-dev.bat`로 실행하세요.
- 환경 변수 `ELECTRON_RUN_AS_NODE`가 설정돼 있으면 해제해야 합니다.

3. `dist:win` 중 NSIS 실패 (심볼릭 링크 권한)
- Windows 개발자 모드 활성화 또는 관리자 권한으로 다시 빌드하세요.
- 실패해도 `release/win-unpacked/PhotoGlobeViewer.exe`는 생성되므로 바로 실행할 수 있습니다.

4. `npm run`이 경로 문제로 실패
- 폴더 경로에 공백/한글/특수문자가 있으면 직접 `npm run`이 깨질 수 있습니다.
- 이 프로젝트는 해당 문제를 피하려고 `start-dev.bat`/`build-win.bat` 사용을 전제로 합니다.

## 다른 사용자에게 공유하는 가장 쉬운 방법
1. `share-win.bat`를 더블클릭합니다.
2. 완료되면 `release/share` 폴더가 자동으로 열립니다.
3. 아래 중 하나를 전달하세요.
- 설치형: `PhotoGlobeViewer-setup-*.exe` (가장 권장)
- 휴대형: `PhotoGlobeViewer-portable-*.zip` (설치 없이 압축해제 후 실행)

## 프로젝트 구조
- `main/`: 인덱싱, DB, IPC, 클러스터, 썸네일, 파일감시
- `renderer/`: React UI, Globe 뷰, 필터/미리보기/i18n
- `shared/`: 공용 타입과 유틸
