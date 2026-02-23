@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "PARENT_DIR=%%~fI"

set "TARGET_DRIVE="
for /f "tokens=1,2,3" %%A in ('subst') do (
  if /I "%%B %%C"=="=> %PARENT_DIR%" (
    set "TARGET_DRIVE=%%A"
  )
)

if defined TARGET_DRIVE set "TARGET_DRIVE=%TARGET_DRIVE:~0,2%"

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
  goto :finish
)

if not exist "%TARGET_DRIVE%\NUL" subst %TARGET_DRIVE% "%PARENT_DIR%" >nul 2>&1

cd /d "%TARGET_DRIVE%\app" 2>nul
if errorlevel 1 (
  echo [PhotoGlobe] Failed to enter %TARGET_DRIVE%\app.
  goto :finish
)

set "ELECTRON_RUN_AS_NODE="
if not defined CESIUM_ION_TOKEN set "CESIUM_ION_TOKEN="
set "VITE_CESIUM_ION_TOKEN=%CESIUM_ION_TOKEN%"

if not exist "node_modules" (
  echo [PhotoGlobe] Installing dependencies...
  call npm.cmd install
  if errorlevel 1 goto :finish
)

if not exist "node_modules\better-sqlite3\build\Release\better_sqlite3.node" (
  echo [PhotoGlobe] Rebuilding native dependencies...
  call npm.cmd run postinstall
  if errorlevel 1 goto :finish
)

echo [PhotoGlobe] Building distributable files...
call npm.cmd run dist:win
if errorlevel 1 echo [PhotoGlobe] NSIS installer build failed, will continue with portable package.

if not exist "release\win-unpacked\PhotoGlobeViewer.exe" (
  echo [PhotoGlobe] Portable app not found: release\win-unpacked\PhotoGlobeViewer.exe
  goto :finish
)

for /f %%I in ('powershell -NoProfile -Command "(Get-Date).ToString(\"yyyyMMdd-HHmmss\")"') do set "STAMP=%%I"
if not defined STAMP set "STAMP=unknown"

set "SHARE_DIR=release\share"
if not exist "%SHARE_DIR%" mkdir "%SHARE_DIR%"

set "PORTABLE_ZIP=%SHARE_DIR%\PhotoGlobeViewer-portable-%STAMP%.zip"
echo [PhotoGlobe] Creating portable zip...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Compress-Archive -Path 'release/win-unpacked/*' -DestinationPath '%PORTABLE_ZIP%' -Force"
if errorlevel 1 (
  echo [PhotoGlobe] Failed to create portable zip.
  goto :finish
)

set "INSTALLER_SRC="
for /f "delims=" %%F in ('dir /b /a:-d /o:-d "release\*.exe" 2^>nul') do (
  if not defined INSTALLER_SRC set "INSTALLER_SRC=release\%%F"
)

if defined INSTALLER_SRC (
  set "INSTALLER_DST=%SHARE_DIR%\PhotoGlobeViewer-setup-%STAMP%.exe"
  copy /y "!INSTALLER_SRC!" "!INSTALLER_DST!" >nul
  echo [PhotoGlobe] Installer copied: !INSTALLER_DST!
) else (
  echo [PhotoGlobe] Installer not found. Share portable zip instead.
)

set "INFO_FILE=%SHARE_DIR%\README_SHARE.txt"
> "%INFO_FILE%" echo PhotoGlobeViewer share package
>> "%INFO_FILE%" echo.
>> "%INFO_FILE%" echo 1. If setup EXE exists, share setup EXE first.
>> "%INFO_FILE%" echo 2. If setup EXE is missing, share portable ZIP.
>> "%INFO_FILE%" echo 3. For portable ZIP, unzip and run PhotoGlobeViewer.exe.
>> "%INFO_FILE%" echo 4. SmartScreen warning can be bypassed with More info - Run anyway.

echo.
echo [PhotoGlobe] Done.
echo [PhotoGlobe] Share folder: !CD!\%SHARE_DIR%
start "" explorer "!CD!\%SHARE_DIR%"

:finish
echo.
pause
endlocal
