# Run Centurion on your PC, reachable from anywhere

Full power, persistent ledger (the $ cap can't reset), free, and reachable from
your phone anywhere via a free Cloudflare tunnel. This is the right home for
real money.

## 1. Get the code on your PC — use git clone (so remote updates work)
Install **Git for Windows** (<https://git-scm.com/download/win>) and
**Python 3.11+** (python.org, tick "Add Python to PATH"). Node is NOT needed —
the dashboard is prebuilt. Then in a terminal:

```
git clone -b claude/centurion-agent-build-xyo5h1 https://github.com/cameron-scale/fyxer-email-assistant.git
cd fyxer-email-assistant\centurion
```

(Clone — not the ZIP — so you can push code changes from your phone/laptop and
the PC pulls them. See "Update the code remotely" below.)

## Update the code remotely (from your phone or laptop)
The PC tracks the GitHub branch and can pull + restart into new code:
- **From the dashboard:** tap **⟳ Update** (top bar). It runs `git pull` and
  restarts into the new code (the dashboard blinks ~10s, then reconnects).
- **Automatic:** set `CENTURION_AUTO_UPDATE=1` and it polls GitHub every ~10 min
  and restarts itself when there are changes. The runner also pulls on every
  restart, so a crash-restart always lands on the latest code.
- **To change the code:** edit files on GitHub (the web editor works on a phone)
  and commit to the `claude/centurion-agent-build-xyo5h1` branch — or ask me to
  push a change. Then hit ⟳ Update (or let auto-update do it).

### No-git option: upload a code .zip from the dashboard
If you didn't clone with git (e.g. you ran from the ZIP), you can still push code
without any command line:
- Ask me for the change; I'll hand you a small `.zip` of the updated files.
- In the dashboard top bar, tap **⬆ Upload**, pick that `.zip`, confirm.
- It writes the files onto this PC and restarts into them (~10s blink, then
  reconnects). The zip's `centurion/` prefix is handled automatically, and the
  live ledger (`data/`) and `.git` are never overwritten.
- This is token-gated, exactly like ⟳ Update. It works locally and through your
  tunnel URL, so you can do it from your phone.

### Set the starting capital from the dashboard
Top bar → **$ Capital** → enter any amount. On a fresh ledger (no sales/spend
yet) it resets both the balance and the risk baseline to that amount; once
there's real activity it only adjusts the baseline and keeps your history.

Security note: anyone with the dashboard token can pull+run whatever is on that
branch onto your PC. Keep the token private; it's your repo and your machine.

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
