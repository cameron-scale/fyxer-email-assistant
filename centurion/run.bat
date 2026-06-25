@echo off
setlocal
cd /d "%~dp0"
title Centurion - run everywhere
echo ============================================================
echo   CENTURION  -  one-click: dashboard + public tunnel
echo ============================================================
echo.
echo This launches the live dashboard AND a public tunnel so you
echo can reach it from your phone anywhere. Two extra windows will
echo open - keep them running. Close them to stop.
echo.

REM 1) Start the live dashboard + agent (opens its own window + browser).
call start-live.bat

REM 2) Start the public tunnel in its own window.
start "Centurion tunnel" cmd /k tunnel.bat

echo.
echo Done. Watch the "Centurion tunnel" window for your public
echo https://...trycloudflare.com link - open it on your phone.
endlocal
