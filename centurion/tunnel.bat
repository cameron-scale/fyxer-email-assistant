@echo off
setlocal
cd /d "%~dp0"
title Centurion remote tunnel
echo ============================================================
echo   CENTURION  -  public tunnel (reach the dashboard anywhere)
echo   Auto-restarts if the tunnel drops.
echo ============================================================
echo.
echo Make sure Centurion is running (start-live.bat or run.bat) so
echo the dashboard is up at http://localhost:8000
echo.

if not exist cloudflared.exe (
  echo Downloading cloudflared (one-time, ~50MB)...
  curl -L -o cloudflared.exe https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
  if errorlevel 1 (
    echo Download failed. Get it from:
    echo   https://github.com/cloudflare/cloudflared/releases/latest
    echo save as cloudflared.exe here, then re-run.
    pause
    exit /b
  )
)

echo.
echo ============================================================
echo   LOOK FOR:  https://something.trycloudflare.com
echo   Open THAT on your phone. NOTE: this quick-tunnel URL CHANGES
echo   each restart. For a stable URL during vacation, set up a named
echo   tunnel (see VACATION.md).
echo ============================================================
:loop
cloudflared.exe tunnel --url http://localhost:8000
echo [%date% %time%] tunnel dropped - restarting in 5s...
timeout /t 5 >nul
goto loop
endlocal
