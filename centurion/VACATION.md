# Leaving it running while you're away

Goal: reach and control Centurion from your phone all week, know it's alive, and
have it recover on its own. Do these before you leave.

## Read this first (honest)
Centurion is in **collect-only** mode: it lists products and can *take* money via
Stripe, but it **cannot spend** (no live spend integration, and the danger switch
is off). So the financial risk of a week away is essentially **zero** — the worst
case is downtime, not loss.

A home PC for a full week is fragile: a Windows Update reboot, a power blip, or an
ISP hiccup can take it offline until you're back. If you want true hands-off
reliability, a **$7/mo Render Starter** (or any small VPS) is far more dependable
and needs no babysitting — say the word and I'll move it there. Otherwise, harden
the PC as below.

## Pre-departure checklist (PC)
1. **Stable URL (important).** A quick tunnel's URL changes on every restart, so a
   reboot would lock you out. Set up a **stable URL** once with ngrok:
   - Sign up free at <https://ngrok.com>, download `ngrok.exe` into this folder.
   - Claim your free **Static Domain** in the ngrok dashboard.
   - Run once: `ngrok config add-authtoken YOUR_TOKEN`
   - Edit `tunnel-ngrok.bat`, set `NGROK_DOMAIN` to your static domain.
   - Use `tunnel-ngrok.bat` instead of `tunnel.bat`. Your URL never changes.
2. **Phone alerts.** In the dashboard → **gear → Integrations**, add either:
   - Twilio (SMS): Account SID, Auth Token, from-number, your phone number; or
   - SMTP (email): host/port/user/password + your email.
   You'll then get alerts if it pauses, goes stale (offline), or makes a **sale**.
3. **Keep the PC awake.** Double-click `prevent-sleep.bat`.
4. **Survive reboots.** Double-click `install-autostart.bat` (relaunches at logon).
   For a forced Windows-Update reboot to recover unattended, also enable
   **auto-login** in Windows, or pause Windows Updates for the week.
5. **Start it.** Double-click `run.bat` (dashboard + tunnel, both auto-restart on
   crash). Or run `start-live.bat` + `tunnel-ngrok.bat` separately.
6. **Test from your phone, on cellular (not your home wifi):** open the URL, log
   in with the token (`centurion`), hit Pause then Resume, send yourself a test
   from the chat. Confirm you can control it.

## Managing it from your phone (anywhere)
- **Dashboard URL** → balance, activity, storefront link, chat.
- **Pause / Emergency stop** → halts everything instantly.
- **Autonomy dial / strategy toggles** → tune what it does.
- **Danger switch** → leave OFF (keeps spend at $0). Don't arm it while away.
- **Chat** → ask "what have you done?", "any sales?", "are you ok?".

## What the alerts mean
- "heartbeat STALE" → the PC/agent stopped (reboot, sleep, crash, internet). The
  dashboard may be unreachable; it should auto-recover when the PC is back.
- "PAUSED" → it auto-paused on an anomaly (safe; nothing is spending).
- "SALE +$X" → a real payment came in. 🎉

## If you can't reach it while away
It's almost certainly the PC (reboot/sleep/internet), not Centurion. Since it's
collect-only, nothing bad happens — money already collected is safe in Stripe.
It resumes when the PC is back online. This is exactly the fragility a $7 host
removes.
