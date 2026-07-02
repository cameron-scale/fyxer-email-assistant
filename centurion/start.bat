@echo off
setlocal
cd /d "%~dp0"
title Centurion launcher
echo ============================================================
echo   CENTURION  -  starting on your PC (simulation mode)
echo ============================================================
echo.

REM --- 1. Check Python -------------------------------------------------
where python >nul 2>nul
if errorlevel 1 (
  echo Python is not installed.
  echo Opening the download page - install it, TICK "Add Python to PATH",
  echo then double-click start.bat again.
  start https://www.python.org/downloads/
  pause
  exit /b
)

REM --- 2. Install dependencies (first run only; fast afterwards) -------
echo Installing dependencies (first run can take a minute)...
python -m pip install --quiet --disable-pip-version-check -r requirements.txt
if errorlevel 1 (
  echo.
  echo Dependency install failed. Check your internet connection and retry.
  pause
  exit /b
)

REM --- 3. Initialize the ledger (safe to run repeatedly) --------------
python main.py --init

REM --- 4. Dashboard control token (change this for anything public) ----
set CENTURION_DASHBOARD_TOKEN=centurion

REM --- 5. Launch the agent (SIMULATION - no real money) --------------
start "Centurion agent" cmd /k "set CENTURION_DASHBOARD_TOKEN=centurion&& python main.py run --interval 60"

REM --- 6. Launch the dashboard ---------------------------------------
start "Centurion dashboard" cmd /k "set CENTURION_DASHBOARD_TOKEN=centurion&& python dashboard\app.py"

REM --- 7. Open the browser -------------------------------------------
echo Waiting for the dashboard to come up...
timeout /t 5 >nul
start http://localhost:8000

echo.
echo ============================================================
echo   Centurion is running in SIMULATION mode (no real money).
echo   Dashboard:  http://localhost:8000
echo   Token:      centurion
echo.
echo   Two windows opened (agent + dashboard). Close them to stop.
echo   To go live with real money later, see GO_LIVE.md.
echo ============================================================
endlocal
