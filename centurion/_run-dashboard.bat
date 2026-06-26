@echo off
REM Resilient dashboard runner: relaunches automatically if it ever exits.
cd /d "%~dp0"
set CENTURION_DASHBOARD_TOKEN=centurion
set CENTURION_RUN_AGENT=1
set CENTURION_LIVE_REVENUE=1
set CENTURION_FUNDED_CAPITAL=10
set CENTURION_FOCUS_STRATEGY=digital_products
set CENTURION_SANDBOX_IDENTITY=centurion-store
REM Your public domain (used for product/SEO links + post-payment delivery
REM redirect). Make this match the domain your tunnel serves (see DOMAIN_SETUP.md).
set CENTURION_PUBLIC_URL=https://centurion.scalembs.com
:loop
echo [%date% %time%] syncing latest code from GitHub...
git pull --ff-only 2>nul
python -m pip install --quiet --disable-pip-version-check -r requirements.txt 2>nul
echo [%date% %time%] starting Centurion dashboard...
python dashboard\app.py
echo [%date% %time%] dashboard exited - pulling latest + restarting in 5s (close window to stop).
timeout /t 5 >nul
goto loop
