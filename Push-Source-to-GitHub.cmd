@echo off
setlocal
cd /d "%~dp0"
title Deadlock Counter Advisor - Upload Source to GitHub
where git >nul 2>nul
if errorlevel 1 (echo Install Git for Windows first: https://git-scm.com/download/win & pause & exit /b 1)
set "WORK=%TEMP%\deadlockcounteradvisor-upload-%RANDOM%%RANDOM%"
echo Cloning the existing GitHub repository into a temporary folder...
git clone https://github.com/awkwardcarl/deadlockcounteradvisor.git "%WORK%"
if errorlevel 1 goto fail
if not exist "%WORK%\.git" goto fail
echo Copying source files; preserving GitHub history...
robocopy "%~dp0" "%WORK%" /E /XD .git node_modules release dist /XF *.log *.pfx *.pem *.key *.cer *.crt
if errorlevel 8 goto fail
cd /d "%WORK%"
git add -A
git diff --cached --quiet
if not errorlevel 1 goto push
git commit -m "Add Counter Advisor v0.7.0 update-ready source"
if errorlevel 1 goto fail
:push
git push origin HEAD
if errorlevel 1 goto fail
echo.
echo SUCCESS: source pushed; view GitHub Actions for build tests.
echo No GitHub release was published. Remove temporary work folder when convenient:
echo %WORK%
pause
exit /b 0
:fail
echo.
echo Upload did not finish. No force-push or repository-history rewrite was attempted.
echo If needed, inspect: %WORK%
pause
exit /b 1
