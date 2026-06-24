# Hosting Centurion on a free server

Two options, depending on what you want "for now".

## Option 1 — Instant preview (already hosted, zero setup)
The UI preview (simulated data) is live at a public URL you can open on any phone:

<https://raw.githack.com/cameron-scale/fyxer-email-assistant/claude/centurion-agent-build-xyo5h1/centurion/dashboard/demo.html>

No account, no deploy. Good for showing the interface around.

## Option 2 — Real dashboard + agent, free, on Render
This runs the actual Flask dashboard with the decision loop ticking in-process,
at a public HTTPS URL. Free tier, **no credit card**.

> **Simulation only.** Free hosts sleep when idle and have throwaway disk, and
> you should never put a real Stripe key on a shared host. This deploy runs in
> simulation mode (no real money). For live/real-money, run it on your own
> always-on machine (see GO_LIVE.md).

### Steps (~5 minutes)
1. Go to <https://render.com> and sign up (GitHub login is easiest) — no card.
2. **New → Blueprint**.
3. Connect the repo `cameron-scale/fyxer-email-assistant`.
4. When asked for the branch, pick **`claude/centurion-agent-build-xyo5h1`**
   (Render reads `render.yaml` from the repo root).
5. Click **Apply / Create**. Render builds and gives you a URL like
   `https://centurion-dashboard.onrender.com`.
6. Open that URL on your phone or anywhere. To use the control buttons, you need
   the token: in Render → your service → **Environment**, copy
   `CENTURION_DASHBOARD_TOKEN`. The dashboard prompts for it on first action.

### Notes
- **First load after idle is slow** (~30–60s): the free service spins down after
  ~15 min of no traffic and cold-starts on the next visit. Normal for free tier.
- **Data resets on redeploy** (ephemeral disk) — fine for a simulated demo.
- The agent loop runs inside the web service; on the free plan it pauses while
  the service is asleep and resumes when someone opens the page.

### Other free hosts
The same app works on Railway, Fly.io, Replit, or PythonAnywhere. The start
command is the key part:
```
python main.py --init || true; gunicorn -b 0.0.0.0:$PORT --workers 1 --threads 8 dashboard.app:app
```
with env `CENTURION_RUN_AGENT=1` and `CENTURION_DASHBOARD_TOKEN=<something>`,
working directory = the `centurion/` folder.

## When you're ready for real money
Hosting the *live* agent belongs on an always-on box you control (a cheap VPS or
your PC), not a free shared host — see **GO_LIVE.md** and `deploy/` (Dockerfile,
docker-compose, systemd unit).
