# Centurion — Quick Start (Windows, one double-click)

Get it running in simulation mode (no real money, no keys) in three steps.

## 1. Install Python (one time)
Download from <https://www.python.org/downloads/> and run the installer.
**Important:** on the first screen, tick **"Add python.exe to PATH"**, then Install.
(Node.js is NOT required — the dashboard is pre-built.)

## 2. Get Centurion
Download the project ZIP and unzip it anywhere (e.g. your Desktop):
<https://github.com/cameron-scale/fyxer-email-assistant/archive/refs/heads/claude/centurion-agent-build-xyo5h1.zip>

## 3. Double-click `start.bat`
Inside the unzipped folder, open `centurion` and **double-click `start.bat`**.
It installs everything, starts the agent + dashboard, and opens your browser to:

> **http://localhost:8000**  (control token: `centurion`)

That's it. Two small windows open (the agent and the dashboard) — closing them
stops Centurion. It runs in **simulation mode**, so no real money moves.

### See it on your phone (same Wi-Fi)
While it's running on the PC, find your PC's IP: open `start.bat`'s window or run
`ipconfig` and look for IPv4 (e.g. `192.168.1.42`). On your phone's browser go to
`http://192.168.1.42:8000`.

---

## Going live with real money (later)
When you're ready, read **GO_LIVE.md**. In short: add your Stripe key, load a
prepaid card with only your funded amount, install a local model (Ollama), then
run `python main.py doctor --live` — it refuses to start until everything checks
out. Your maximum loss is always capped at the funded amount.

## Troubleshooting
- **"python is not recognized"** — Python wasn't added to PATH. Re-run the
  installer, tick "Add Python to PATH", restart, try again.
- **Browser shows a plain page, not the styled dashboard** — you're offline; the
  styling loads from the internet. Reconnect and refresh.
- **Want it livelier** — lower `cycle_interval_minutes` in `config.yaml`.
