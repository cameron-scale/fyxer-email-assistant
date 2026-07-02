@echo off
setlocal
cd /d "%~dp0"
title Centurion (LIVE revenue)
echo ============================================================
echo   CENTURION  -  LIVE revenue mode (real Stripe links)
echo   Persistent ledger on this PC. Spending stays OFF until you
echo   arm the danger switch in the dashboard. Auto-restarts on crash.
echo ============================================================
echo.

where python >nul 2>nul
if errorlevel 1 (
  echo Python is not installed. Opening the download page...
  start https://www.python.org/downloads/
  echo Install it (tick "Add Python to PATH"), then run this again.
  pause
  exit /b
)

echo Installing dependencies...
python -m pip install --quiet --disable-pip-version-check -r requirements.txt
python main.py --init

REM Launch the resilient dashboard runner (auto-restarts if it exits).
start "Centurion (live)" cmd /k _run-dashboard.bat

timeout /t 6 >nul
start http://localhost:8000

echo.
echo ============================================================
echo   Dashboard: http://localhost:8000   (token: centurion)
echo   1) gear - Integrations - paste your STRIPE key + Save.
echo   2) Optional: paste Twilio/SMTP details to get phone alerts.
echo   3) A REAL payment link appears in the Storefront panel.
echo   Spending stays OFF until you arm the red danger switch.
echo.
echo   To reach it from your phone anywhere, also run tunnel.bat.
echo ============================================================
endlocal
