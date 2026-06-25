@echo off
setlocal
cd /d "%~dp0"
title Centurion remote tunnel
echo ============================================================
echo   CENTURION  -  public tunnel (reach the dashboard anywhere)
echo ============================================================
echo.
echo Make sure Centurion is already running first (start.bat or
echo start-live.bat) so the dashboard is up at http://localhost:8000
echo.

REM Download cloudflared once (free, no account needed for a quick tunnel).
if not exist cloudflared.exe (
  echo Downloading cloudflared (one-time, ~50MB)...
  curl -L -o cloudflared.exe https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
  if errorlevel 1 (
    echo.
    echo Download failed. Get cloudflared manually from:
    echo   https://github.com/cloudflare/cloudflared/releases/latest
    echo Save it as cloudflared.exe in this folder, then run this again.
    pause
    exit /b
  )
)

echo.
echo Opening a public HTTPS tunnel to http://localhost:8000 ...
echo ============================================================
echo   LOOK FOR A LINE LIKE:  https://something.trycloudflare.com
echo   Open THAT url on your phone - it works from anywhere.
echo   (Keep this window open; closing it closes the tunnel.)
echo ============================================================
echo.
cloudflared.exe tunnel --url http://localhost:8000
endlocal
