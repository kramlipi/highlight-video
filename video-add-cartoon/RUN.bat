@echo off
setlocal EnableExtensions
title Video Pipeline
cd /d "%~dp0"

echo.
echo  ========================================
echo   Video Pipeline - Trim / Cartoon / Subs
echo  ========================================
echo.

where python >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found. Install Python 3.10+ first.
    goto :fail
)

if not exist .venv\Scripts\python.exe (
    echo First-time setup...
    call "%~dp0setup.bat"
)

echo [1/2] Opening browser at http://127.0.0.1:8765/ ...
start "" cmd /c "ping -n 4 127.0.0.1 >nul && start http://127.0.0.1:8765/"

echo [2/2] Starting server - keep this window open.
echo.
echo   Drop a video in the browser window.
echo   Output: video_tutorial\{name}_final.mp4
echo   Press Ctrl+C to stop.
echo.

.venv\Scripts\python.exe launch.py
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" goto :fail
exit /b 0

:fail
echo.
echo [ERROR] Something went wrong.
pause
exit /b 1
