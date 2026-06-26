@echo off
setlocal
cd /d "%~dp0"
title Centurion tunnel (stable URL via ngrok)
REM A STABLE public URL that does NOT change on restart/reboot - ideal for being
REM away. One-time setup (free, no domain needed):
REM   1) Sign up at https://ngrok.com  (free)
REM   2) Download ngrok for Windows, save ngrok.exe in this folder
REM   3) Claim your free Static Domain in the ngrok dashboard
REM   4) Run once:  ngrok config add-authtoken YOUR_TOKEN
REM   5) Put your static domain below, then double-click this file.
set NGROK_DOMAIN=frenzy-frenzy-risotto.ngrok-free.dev

if not exist ngrok.exe (
  echo ngrok.exe not found. Download it from https://ngrok.com/download
  echo and save ngrok.exe in this folder, then run this again.
  start https://ngrok.com/download
  pause & exit /b
)
if "%NGROK_DOMAIN%"=="CHANGE-ME.ngrok-free.app" (
  echo Edit this file and set NGROK_DOMAIN to your free static domain first.
  pause & exit /b
)
echo Your permanent dashboard URL:  https://%NGROK_DOMAIN%
echo Open that on your phone from anywhere - it stays the same across reboots.
:loop
ngrok http --domain=%NGROK_DOMAIN% 8000
echo [%date% %time%] tunnel dropped - restarting in 5s...
timeout /t 5 >nul
goto loop
endlocal
