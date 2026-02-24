@echo off
setlocal EnableExtensions DisableDelayedExpansion

set "FLAG_BUILD_ONLY=0"
set "FLAG_FORCE_REBUILD=0"
set "FLAG_NO_PAUSE=0"
set "SCRIPT_SELF=%~f0"

:parse_args
if "%~1"=="" goto args_done
if /I "%~1"=="--build-only" (
  set "FLAG_BUILD_ONLY=1"
  shift
  goto parse_args
)
if /I "%~1"=="--force-rebuild" (
  set "FLAG_FORCE_REBUILD=1"
  shift
  goto parse_args
)
if /I "%~1"=="--no-pause" (
  set "FLAG_NO_PAUSE=1"
  shift
  goto parse_args
)
echo [PhotoGlobe] [args] Unknown option: %~1
shift
goto parse_args

:args_done
set "EXIT_CODE=0"
for %%I in ("%SCRIPT_SELF%") do set "APP_WORK_DIR=%%~dpI"
if not defined APP_WORK_DIR (
  echo [PhotoGlobe] [init] Failed to resolve script directory.
  set "EXIT_CODE=1"
  goto finish
)
if "%APP_WORK_DIR:~-1%"=="\" set "APP_WORK_DIR=%APP_WORK_DIR:~0,-1%"
for %%I in ("%APP_WORK_DIR%\..") do set "REPO_DIR=%%~fI"
set "TARGET_DRIVE="
set "NODE_CMD="
set "NPM_CMD="
set "BEST_EXE="
set "SRC_LATEST=0"
set "EXE_LATEST=0"
set "NEED_BUILD=0"
set "BUILD_FAILED=0"

call :map_work_drive
if errorlevel 1 (
  echo [PhotoGlobe] [init] subst mapping unavailable. Falling back to direct path.
) else (
  set "APP_WORK_DIR=%TARGET_DRIVE%\app"
)

cd /d "%APP_WORK_DIR%" 2>nul
if errorlevel 1 (
  echo [PhotoGlobe] [init] Failed to enter %APP_WORK_DIR%.
  set "EXIT_CODE=1"
  goto finish
)

set "ELECTRON_RUN_AS_NODE="
if not defined CESIUM_ION_TOKEN set "CESIUM_ION_TOKEN="
set "VITE_CESIUM_ION_TOKEN=%CESIUM_ION_TOKEN%"

echo [PhotoGlobe] [tool-check] Resolving Node/npm...
call :resolve_node_tools
if errorlevel 1 (
  echo [PhotoGlobe] [tool-check] Node/npm missing. Trying Node LTS install via winget...
  call :install_node_lts
  call :resolve_node_tools
)

if not defined NODE_CMD (
  echo [PhotoGlobe] [tool-check] Node.js was not found.
  echo [PhotoGlobe] Install Node.js 22 LTS and rerun this script.
  echo [PhotoGlobe] Download: https://nodejs.org/en/download
  set "EXIT_CODE=2"
  goto finish
)
if not defined NPM_CMD (
  echo [PhotoGlobe] [tool-check] npm.cmd was not found.
  echo [PhotoGlobe] Reinstall Node.js 22 LTS and rerun this script.
  set "EXIT_CODE=2"
  goto finish
)

echo [PhotoGlobe] [tool-check] Node: %NODE_CMD%
echo [PhotoGlobe] [tool-check] npm:  %NPM_CMD%

if not exist "node_modules" (
  echo [PhotoGlobe] [deps] Installing dependencies...
  call "%NPM_CMD%" install
  if errorlevel 1 (
    echo [PhotoGlobe] [deps] npm install failed.
    set "EXIT_CODE=3"
    goto finish
  )
)

if not exist "node_modules\better-sqlite3\build\Release\better_sqlite3.node" (
  echo [PhotoGlobe] [deps] Rebuilding native dependencies...
  call "%NPM_CMD%" run postinstall
  if errorlevel 1 (
    echo [PhotoGlobe] [deps] postinstall failed.
    echo [PhotoGlobe] Install Visual Studio Build Tools ^(C++^) and retry.
    set "EXIT_CODE=3"
    goto finish
  )
)

call :select_best_exe
call :compute_source_latest
call :compute_exe_latest

if "%FLAG_FORCE_REBUILD%"=="1" (
  set "NEED_BUILD=1"
) else if not defined BEST_EXE (
  set "NEED_BUILD=1"
) else (
  for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "$src=[Int64]$env:SRC_LATEST; $exe=[Int64]$env:EXE_LATEST; if($exe -eq 0 -or $src -gt $exe){1}else{0}"`) do set "NEED_BUILD=%%I"
)

if not "%NEED_BUILD%"=="1" (
  echo [PhotoGlobe] [build-check] Existing executable is up to date.
) else (
  echo [PhotoGlobe] [build-check] Build required.
  echo [PhotoGlobe] [build] Running portable build...
  call "%NPM_CMD%" run dist:win:portable
  if errorlevel 1 (
    set "BUILD_FAILED=1"
    echo [PhotoGlobe] [build] Build failed.
    if not defined BEST_EXE (
      echo [PhotoGlobe] [build] No fallback executable available.
      set "EXIT_CODE=4"
      goto finish
    )
    echo [PhotoGlobe] [build] Using existing executable as fail-open fallback.
  ) else (
    call :select_best_exe
  )
)

if "%FLAG_BUILD_ONLY%"=="1" (
  if "%BUILD_FAILED%"=="1" (
    echo [PhotoGlobe] [run] Build-only mode: build failed.
    set "EXIT_CODE=4"
  ) else (
    echo [PhotoGlobe] [run] Build-only mode enabled. Skipping app launch.
  )
  goto finish
)

if not defined BEST_EXE (
  echo [PhotoGlobe] [run] Executable not found after build step.
  set "EXIT_CODE=5"
  goto finish
)

echo [PhotoGlobe] [run] Launching: %BEST_EXE%
start "" "%BEST_EXE%"
if errorlevel 1 (
  echo [PhotoGlobe] [run] Failed to launch executable.
  set "EXIT_CODE=5"
  goto finish
)

goto finish

:map_work_drive
for /f "tokens=1,2,3" %%A in ('subst') do (
  if /I "%%B %%C"=="=> %REPO_DIR%" (
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
      goto map_done
    )
  )
)

:map_done
if not defined TARGET_DRIVE (
  echo [PhotoGlobe] [init] No temporary subst drive available.
  exit /b 1
)

if not exist "%TARGET_DRIVE%\NUL" (
  subst %TARGET_DRIVE% "%REPO_DIR%" >nul 2>&1
  if errorlevel 1 (
    echo [PhotoGlobe] [init] subst drive %TARGET_DRIVE% unavailable.
    exit /b 1
  )
)
exit /b 0

:resolve_node_tools
set "NODE_CMD="
set "NPM_CMD="
for /f "delims=" %%I in ('where node 2^>nul') do if not defined NODE_CMD set "NODE_CMD=%%I"
for /f "delims=" %%I in ('where npm.cmd 2^>nul') do if not defined NPM_CMD set "NPM_CMD=%%I"

if not defined NODE_CMD if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_CMD=%ProgramFiles%\nodejs\node.exe"
if not defined NPM_CMD if exist "%ProgramFiles%\nodejs\npm.cmd" set "NPM_CMD=%ProgramFiles%\nodejs\npm.cmd"

if not defined NODE_CMD if exist "%LocalAppData%\Programs\nodejs\node.exe" set "NODE_CMD=%LocalAppData%\Programs\nodejs\node.exe"
if not defined NPM_CMD if exist "%LocalAppData%\Programs\nodejs\npm.cmd" set "NPM_CMD=%LocalAppData%\Programs\nodejs\npm.cmd"

if defined NODE_CMD (
  for %%D in ("%NODE_CMD%") do set "NODE_DIR=%%~dpD"
  if defined NODE_DIR set "PATH=%NODE_DIR%;%PATH%"
)

if not defined NODE_CMD exit /b 1
if not defined NPM_CMD exit /b 1
exit /b 0

:install_node_lts
for /f "delims=" %%I in ('where winget 2^>nul') do set "WINGET_CMD=%%I"
if not defined WINGET_CMD (
  echo [PhotoGlobe] [tool-check] winget not available. Skipping auto-install.
  exit /b 1
)

echo [PhotoGlobe] [tool-check] Installing Node LTS with winget...
call winget install --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements
if errorlevel 1 (
  echo [PhotoGlobe] [tool-check] winget install failed.
  exit /b 1
)
exit /b 0

:select_best_exe
set "BEST_EXE="
for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "$f=Get-ChildItem -LiteralPath 'release' -File -Filter 'PhotoGlobeViewer-Portable-*.exe' -ErrorAction SilentlyContinue | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1; if($f){$f.FullName}"`) do set "BEST_EXE=%%I"
if not defined BEST_EXE if exist "release\win-unpacked\PhotoGlobeViewer.exe" for %%I in ("release\win-unpacked\PhotoGlobeViewer.exe") do set "BEST_EXE=%%~fI"
exit /b 0

:compute_source_latest
set "SRC_LATEST=0"
for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "$files=@(); foreach($dir in @('main','renderer','shared','build')){ if(Test-Path -LiteralPath $dir){ $files += Get-ChildItem -LiteralPath $dir -File -Recurse -ErrorAction SilentlyContinue } }; foreach($f in @('package.json','package-lock.json')){ if(Test-Path -LiteralPath $f){ $files += Get-Item -LiteralPath $f } }; if($files.Count -gt 0){ ($files | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1).LastWriteTimeUtc.ToFileTimeUtc() } else { 0 }"`) do set "SRC_LATEST=%%I"
exit /b 0

:compute_exe_latest
set "EXE_LATEST=0"
if not defined BEST_EXE exit /b 0
set "BEST_EXE_ENV=%BEST_EXE%"
for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "$p=$env:BEST_EXE_ENV; if($p -and (Test-Path -LiteralPath $p)){ (Get-Item -LiteralPath $p).LastWriteTimeUtc.ToFileTimeUtc() } else { 0 }"`) do set "EXE_LATEST=%%I"
set "BEST_EXE_ENV="
exit /b 0

:finish
if not "%EXIT_CODE%"=="0" echo [PhotoGlobe] Finished with error code %EXIT_CODE%.
echo.
if "%FLAG_NO_PAUSE%"=="1" (
  endlocal & exit /b %EXIT_CODE%
)
pause
endlocal & exit /b %EXIT_CODE%
