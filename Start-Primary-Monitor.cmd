@echo off
setlocal
cd /d "%~dp0"
title Deadlock Counter Advisor - Primary Monitor
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js LTS from https://nodejs.org first.
  pause
  exit /b 1
)
if not exist "node_modules\electron\cli.js" (
  call npm ci
  if errorlevel 1 (pause & exit /b 1)
)
echo Starting on PRIMARY monitor for troubleshooting...
call npm start -- --primary-monitor
if errorlevel 1 pause
