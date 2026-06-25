@echo off
REM Resilient dashboard runner: relaunches automatically if it ever exits.
cd /d "%~dp0"
set CENTURION_DASHBOARD_TOKEN=centurion
set CENTURION_RUN_AGENT=1
set CENTURION_LIVE_REVENUE=1
set CENTURION_FUNDED_CAPITAL=10
set CENTURION_FOCUS_STRATEGY=digital_products
set CENTURION_SANDBOX_IDENTITY=centurion-store
:loop
echo [%date% %time%] starting Centurion dashboard...
python dashboard\app.py
echo [%date% %time%] dashboard exited - restarting in 5s (close this window to stop).
timeout /t 5 >nul
goto loop
