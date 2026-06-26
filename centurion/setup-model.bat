@echo off
setlocal
cd /d "%~dp0"
title Centurion - local AI model setup
echo ============================================================
echo   Installing the local AI model (Ollama) for live mode
echo ============================================================
echo.

where ollama >nul 2>nul
if errorlevel 1 (
  echo Ollama not found. Installing via winget...
  winget install -e --id Ollama.Ollama
  if errorlevel 1 (
    echo.
    echo Automatic install failed. Download Ollama manually from:
    echo     https://ollama.com/download
    echo Then run this file again.
    pause
    exit /b
  )
)

echo Starting Ollama...
start "" ollama serve
timeout /t 3 >nul

echo Pulling the model (a few GB - one-time download)...
ollama pull llama3.1:8b
if errorlevel 1 (
  echo Model pull failed - check your internet and retry.
  pause
  exit /b
)

echo.
echo ============================================================
echo   Done. The local model is installed and running.
echo   No config change needed: Centurion is set to 'auto' and will
echo   detect the model within ~1 minute and upgrade itself. Leave the
echo   'ollama serve' window open. The dashboard's system panel will
echo   flip from 'template' to 'local' once it's in use.
echo ============================================================
pause
endlocal
