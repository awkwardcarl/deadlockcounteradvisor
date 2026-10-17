@echo off
setlocal
cd /d "%~dp0"
title Deadlock Counter Advisor - Windows EXE Builder
echo.
echo ==== Deadlock Counter Advisor v0.3.2 ====
echo Build a portable, standalone Windows EXE (one-time setup).
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not installed.
  echo Download the LTS version from https://nodejs.org/
  pause
  exit /b 1
)
echo [1/3] Installing the packaging tools (internet required)...
call npm ci --no-audit --no-fund
if errorlevel 1 goto fail
echo.
echo [2/3] Running the safety and roster tests...
call npm test
if errorlevel 1 goto fail
echo.
echo [3/3] Building the portable Windows EXE...
echo The Windows executable-resource editing step is disabled for this build.
echo No administrator mode or Developer Mode is necessary for that step.
call npm run build:win:portable
if errorlevel 1 goto fail
echo.
echo SUCCESS! Your stand-alone application is inside the dist folder.
echo You will no longer need this builder or Node.js to RUN the EXE.
if exist "dist" start "" explorer.exe "%CD%\dist"
pause
exit /b 0
:fail
echo.
echo BUILD FAILED. Copy the full output or send a screenshot.
echo You can also run Build-EXE-Folder.cmd as a fallback.
echo That creates an EXE alongside supporting files without electron-builder.
pause
exit /b 1
