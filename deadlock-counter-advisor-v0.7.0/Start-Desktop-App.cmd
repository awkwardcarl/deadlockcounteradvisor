@echo off
setlocal
cd /d "%~dp0"
title Deadlock Counter Advisor - Startup
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js LTS is needed to run this source-code version.
  echo Install Node.js LTS from https://nodejs.org and run this file again.
  pause
  exit /b 1
)
if not exist "node_modules\electron\cli.js" (
  echo Installing Electron runtime - internet required the first time.
  call npm install
  if errorlevel 1 (
    echo Installation failed. Check your internet connection.
    pause
    exit /b 1
  )
)
echo.
echo Starting Deadlock Counter Advisor v0.3.2...
echo The terminal stays open until you CLOSE the app. This is normal.
echo If the app window is not visible, try Alt+Tab or Win+Shift+Left/Right.
echo.
call npm start
set "APP_EXIT=%ERRORLEVEL%"
if not "%APP_EXIT%"=="0" (
  echo.
  echo Application exited with error code %APP_EXIT%.
  echo Please send the complete error text from this window.
  pause
)
exit /b %APP_EXIT%
