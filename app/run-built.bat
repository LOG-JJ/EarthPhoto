@echo off
setlocal EnableExtensions

set "APP_EXE=%~dp0release\win-unpacked\PhotoGlobeViewer.exe"
set "ELECTRON_RUN_AS_NODE="

if exist "%APP_EXE%" (
  start "" "%APP_EXE%"
) else (
  echo [PhotoGlobe] Built exe not found.
  echo Run build-win.bat first.
)

endlocal
