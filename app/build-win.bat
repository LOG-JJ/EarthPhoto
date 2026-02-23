@echo off
setlocal EnableExtensions

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "PARENT_DIR=%%~fI"

set "TARGET_DRIVE="
for /f "tokens=1,2,3" %%A in ('subst') do (
  if /I "%%B %%C"=="=> %PARENT_DIR%" (
    set "TARGET_DRIVE=%%A"
  )
)

if defined TARGET_DRIVE (
  set "TARGET_DRIVE=%TARGET_DRIVE:~0,2%"
)

if not defined TARGET_DRIVE (
  for %%D in (X Y Z W V U T S R Q P O N M L K J I H G F E) do (
    if not exist "%%D:\NUL" (
      set "TARGET_DRIVE=%%D:"
      goto :map_done
    )
  )
)

:map_done
if not defined TARGET_DRIVE (
  echo [PhotoGlobe] Failed to map a temporary drive.
  goto :end
)

if not exist "%TARGET_DRIVE%\NUL" (
  subst %TARGET_DRIVE% "%PARENT_DIR%" >nul 2>&1
)

cd /d %TARGET_DRIVE%\app 2>nul
if errorlevel 1 (
  echo [PhotoGlobe] Failed to enter %TARGET_DRIVE%\app.
  goto :end
)

set "ELECTRON_RUN_AS_NODE="
if not defined CESIUM_ION_TOKEN set "CESIUM_ION_TOKEN="
set "VITE_CESIUM_ION_TOKEN=%CESIUM_ION_TOKEN%"

if not exist "node_modules" (
  echo [PhotoGlobe] Installing dependencies...
  call npm.cmd install
  if errorlevel 1 goto :end
)

if not exist "node_modules\better-sqlite3\build\Release\better_sqlite3.node" (
  echo [PhotoGlobe] Rebuilding native dependencies...
  call npm.cmd run postinstall
  if errorlevel 1 goto :end
)

echo [PhotoGlobe] Building Windows installer...
call npm.cmd run dist:win
if errorlevel 1 (
  if exist "release\\win-unpacked\\PhotoGlobeViewer.exe" (
    echo [PhotoGlobe] NSIS installer build failed.
    echo [PhotoGlobe] Portable exe was created: release\\win-unpacked\\PhotoGlobeViewer.exe
    goto :end
  )
)

:end
echo.
pause
