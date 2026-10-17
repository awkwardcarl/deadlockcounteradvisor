@echo off
setlocal
cd /d "%~dp0"
title Deadlock Counter Advisor - Windows Installer Builder
where node >nul 2>nul
if errorlevel 1 (echo Node.js LTS is required: https://nodejs.org & pause & exit /b 1)
call npm ci --no-audit --no-fund
if errorlevel 1 goto fail
call npm test
if errorlevel 1 goto fail
call npm run build:win:installer
if errorlevel 1 goto fail
echo.
echo SUCCESS. Installer and update metadata are in the dist folder.
start "" explorer.exe "%CD%\dist"
pause
exit /b 0
:fail
echo.
echo Build failed. Please share the error output; do not disable Windows security protections.
pause
exit /b 1
