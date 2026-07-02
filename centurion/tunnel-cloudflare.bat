@echo off
setlocal
cd /d "%~dp0"
title Centurion tunnel - centurion.scalembs.com
REM Runs a NAMED Cloudflare tunnel mapped to your domain. Stable URL, survives
REM reboots, free. One-time setup must be done first (see DOMAIN_SETUP.md):
REM   cloudflared tunnel login
REM   cloudflared tunnel create centurion
REM   cloudflared tunnel route dns centurion centurion.scalembs.com
set TUNNEL_NAME=centurion

if not exist cloudflared.exe (
  echo Downloading cloudflared (one-time)...
  curl -L -o cloudflared.exe https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
)
echo Starting named tunnel '%TUNNEL_NAME%' -> http://localhost:8000
echo Your dashboard will be at: https://centurion.scalembs.com
:loop
cloudflared.exe tunnel run --url http://localhost:8000 %TUNNEL_NAME%
echo [%date% %time%] tunnel dropped - restarting in 5s...
timeout /t 5 >nul
goto loop
endlocal
