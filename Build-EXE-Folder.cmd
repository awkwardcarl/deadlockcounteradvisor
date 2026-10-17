@echo off
setlocal
cd /d "%~dp0"
title Deadlock Counter Advisor - Windows EXE Folder Builder
where node >nul 2>nul
if errorlevel 1 (echo Install Node.js LTS first from https://nodejs.org & pause & exit /b 1)
call npm ci --no-audit --no-fund
if errorlevel 1 goto fail
call npm test
if errorlevel 1 goto fail
call npm run build:win
if errorlevel 1 goto fail
echo SUCCESS. Open release\Deadlock Counter Advisor-win32-x64\ and double-click Deadlock Counter Advisor.exe
if exist "release" start "" explorer.exe "%CD%\release"
pause
exit /b 0
:fail
echo Build failed - take a screenshot of this window.
pause
exit /b 1
