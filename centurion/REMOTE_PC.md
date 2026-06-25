# Run Centurion on your PC, reachable from anywhere

Full power, persistent ledger (the $ cap can't reset), free, and reachable from
your phone anywhere via a free Cloudflare tunnel. This is the right home for
real money.

## 1. Get the code on your PC
Download the ZIP and unzip it (or `git clone`):
<https://github.com/cameron-scale/fyxer-email-assistant/archive/refs/heads/claude/centurion-agent-build-xyo5h1.zip>
Install **Python 3.11+** (python.org, tick "Add Python to PATH"). Node is NOT
needed — the dashboard is prebuilt.

## 2. Start Centurion
Open the `centurion` folder and double-click one of:
- **`start.bat`** — simulation (no real money). Good first run.
- **`start-live.bat`** — LIVE revenue: creates real Stripe payment links.
  Spending stays OFF behind the dashboard's danger switch.

Either opens the dashboard at **http://localhost:8000** (token: `centurion`).

For live mode: open the **gear → Integrations**, paste your **Stripe secret
key**, Save (it persists on your PC). A real payment link then appears in the
**Storefront** panel.

## 3. Make it reachable from your phone (anywhere)
Double-click **`tunnel.bat`** (keep `start*.bat` running). It downloads
`cloudflared` once, then prints a line like:

> `https://something-random.trycloudflare.com`

Open **that URL on your phone** — it reaches your PC's dashboard from anywhere,
over HTTPS, free. Keep the tunnel window open (closing it closes the tunnel).
The URL changes each time you restart the tunnel (a fixed URL needs a free
Cloudflare account + named tunnel — ask if you want that).

## Safety on your PC (unlike the free cloud host)
- **Persistent ledger** → the loss cap and idempotency actually hold across
  restarts. This is why real spending belongs here, not on a disposable host.
- **Spending is OFF by default.** Real money is only spent if you arm the red
  danger switch — and even then, there's no live *spend* integration wired yet
  (it can collect via Stripe, not autonomously spend), so collecting is the only
  thing that happens until we wire a spend channel.
- Pause anything instantly from the dashboard. Max loss is always the funded
  amount.

## Keeping it running 24/7
Leave the PC on with the two windows (Centurion + tunnel) running. For unattended
operation, see `deploy/centurion.service` (Linux) or run it as a scheduled task
on Windows. A reboot needs you to re-launch the two .bat files (or set them to
auto-start).
