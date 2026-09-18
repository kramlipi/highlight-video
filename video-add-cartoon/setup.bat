@echo off
setlocal EnableExtensions
title Video Pipeline Setup
cd /d "%~dp0"

echo.
echo  Video Pipeline Setup (Windows)
echo  ==============================
echo.

where python >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found. Install Python 3.10+ and retry.
    pause
    exit /b 1
)

if exist .venv\bin\python if not exist .venv\Scripts\python.exe (
    echo Removing Linux/WSL virtual environment...
    rmdir /s /q .venv
)

if not exist .venv\Scripts\python.exe (
    echo Creating virtual environment...
    python -m venv .venv
)

echo Installing Python dependencies...
call .venv\Scripts\python.exe -m pip install --upgrade pip
call .venv\Scripts\pip.exe install -r requirements.txt
call .venv\Scripts\pip.exe install auto-editor

echo.
echo Checking tools...
where ffmpeg >nul 2>&1 && (echo   ffmpeg: OK) || (echo   ffmpeg: MISSING - install from https://ffmpeg.org)
where ffprobe >nul 2>&1 && (echo   ffprobe: OK) || (echo   ffprobe: MISSING)
call .venv\Scripts\auto-editor.exe --version >nul 2>&1 && (echo   auto-editor: OK) || (echo   auto-editor: installed in venv)

if not exist "%VIDEO_PIPELINE_OUTPUT_DIR%" (
    if exist "D:\karm\video_tutorial" (
        echo Output dir: D:\karm\video_tutorial
    ) else (
        echo Output dir will be created on first run.
    )
)

echo.
echo Setup complete. Run RUN.bat to start the UI.
pause
