# 기술 스택 문서 (EarthPhoto / PhotoGlobeViewer)

## 1. 플랫폼/런타임
- Electron 37
- Node.js 22 LTS 권장
- Windows 10/11 대상 배포 (NSIS/Portable)

## 2. 프론트엔드 (Renderer)
- React 19
- TypeScript 5
- Zustand (전역 상태 관리)
- i18next + react-i18next (다국어)
- CSS (커스텀 스타일 시스템)

## 3. 3D 지도/지리 시각화
- CesiumJS (3D Globe 렌더링)
- Supercluster (포인트 클러스터링, Main 측 계산)

## 4. 백엔드 로직 (Electron Main)
- Electron IPC 기반 Main/Renderer 분리
- 도메인 서비스:
  - IndexCoordinator (인덱싱 파이프라인/취소/진행률)
  - ClusterService (클러스터 스냅샷/캐시)
  - TripService (여행 구간 세그먼트 계산)
  - ThumbnailService (썸네일/프리뷰 생성 및 큐 스케줄링)
  - FileWatcherService (루트별 파일 변경 감시)
  - MetricsService (로컬 세션 메트릭)

## 5. 데이터 저장소
- SQLite (better-sqlite3)
- 주요 데이터:
  - `roots` (라이브러리 루트)
  - `photos` (경로/미디어타입/GPS/촬영시각/해상도/영상길이/카메라 등)
  - `settings` (앱 설정 JSON)

## 6. 미디어 메타/썸네일 파이프라인
- EXIF/메타 추출:
  - exiftool-vendored
- 이미지 처리:
  - sharp
  - heic-decode / heic2any (HEIC 대응)
- 비디오 처리:
  - ffmpeg-static
  - @ffmpeg-installer/ffmpeg

## 7. 파일 스캔/감시
- fast-glob (초기/재스캔 파일 수집)
- chokidar (파일 감시)
- 델타 기반 인덱싱 및 overflow 시 full scan fallback

## 8. 빌드/개발 도구
- Vite 7
- vite-plugin-electron
- vite-plugin-cesium
- electron-builder 25
- TypeScript noEmit typecheck

## 9. 패키징/배포
- 출력:
  - Installer(NSIS)
  - Portable EXE
- 리소스:
  - `app/build/icon.ico` 사용

## 10. 아키텍처 요약
- **Main Process**
  - 인덱싱/DB/썸네일/파일감시/클러스터/Trip/메트릭 처리
- **Preload**
  - 보안 경계 내 API 브리지 (`window.photoGlobe`)
- **Renderer**
  - UI 상태/유즈케이스 조합
  - Globe/Timeline/Trip/Preview/Calendar 통계 패널 렌더링

## 11. 품질 관리
- 정적 검증: `npm.cmd run typecheck`
- 빌드 검증: `npm.cmd run build`
- 수동 회귀: 인덱싱/필터/프리뷰/타임라인/Trip/도크 탭 동작 확인

