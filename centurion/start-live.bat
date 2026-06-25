@echo off
setlocal
cd /d "%~dp0"
title Centurion (LIVE revenue)
echo ============================================================
echo   CENTURION  -  LIVE revenue mode (real Stripe links)
echo   Persistent ledger on this PC. Spending stays OFF until you
echo   arm the danger switch in the dashboard.
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

REM Your dashboard password + live revenue mode (real Stripe payment links).
set CENTURION_DASHBOARD_TOKEN=centurion
set CENTURION_RUN_AGENT=1
set CENTURION_LIVE_REVENUE=1
set CENTURION_FUNDED_CAPITAL=10
set CENTURION_FOCUS_STRATEGY=digital_products
set CENTURION_SANDBOX_IDENTITY=centurion-store

start "Centurion (live)" cmd /k "set CENTURION_DASHBOARD_TOKEN=centurion&& set CENTURION_RUN_AGENT=1&& set CENTURION_LIVE_REVENUE=1&& set CENTURION_FUNDED_CAPITAL=10&& set CENTURION_FOCUS_STRATEGY=digital_products&& set CENTURION_SANDBOX_IDENTITY=centurion-store&& python dashboard\app.py"

timeout /t 5 >nul
start http://localhost:8000

echo.
echo ============================================================
echo   Dashboard: http://localhost:8000   (token: centurion)
echo   1) Open the gear - Integrations - paste your STRIPE secret
echo      key and Save (it persists on this PC).
echo   2) A REAL payment link appears in the Storefront panel.
echo   3) Spending stays OFF. To allow real spending later, hit the
echo      red "Arm real spending" switch (asks you to confirm).
echo.
echo   To reach this dashboard from your phone anywhere, also run
echo   tunnel.bat and open the https://...trycloudflare.com URL.
echo ============================================================
endlocal
