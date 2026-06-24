# Centurion launcher (PowerShell). Right-click > Run with PowerShell,
# or in a terminal:  powershell -ExecutionPolicy Bypass -File start.ps1
Set-Location $PSScriptRoot
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  CENTURION - starting on your PC (simulation mode)" -ForegroundColor Cyan
Write-Host "============================================================`n" -ForegroundColor Cyan

# 1. Python check
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
  Write-Host "Python is not installed. Opening the download page..." -ForegroundColor Yellow
  Write-Host 'Install it (tick "Add Python to PATH"), then run this again.'
  Start-Process "https://www.python.org/downloads/"
  Read-Host "Press Enter to exit"; exit
}

# 2. Dependencies
Write-Host "Installing dependencies (first run can take a minute)..."
python -m pip install --quiet --disable-pip-version-check -r requirements.txt

# 3. Initialize ledger
python main.py --init

# 4. Token
$env:CENTURION_DASHBOARD_TOKEN = "centurion"

# 5. Agent (simulation - no real money) + 6. dashboard, each in its own window
Start-Process powershell -ArgumentList '-NoExit','-Command',
  '$env:CENTURION_DASHBOARD_TOKEN="centurion"; python main.py run --interval 60'
Start-Process powershell -ArgumentList '-NoExit','-Command',
  '$env:CENTURION_DASHBOARD_TOKEN="centurion"; python dashboard\app.py'

# 7. Open browser
Start-Sleep -Seconds 5
Start-Process "http://localhost:8000"

Write-Host "`nCenturion is running in SIMULATION mode." -ForegroundColor Green
Write-Host "Dashboard: http://localhost:8000   Token: centurion"
Write-Host "Close the two pop-up windows to stop it. See GO_LIVE.md to go live."
