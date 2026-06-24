# Hosting Centurion on a free server

Two options, depending on what you want "for now".

## Option 1 — Instant preview (already hosted, zero setup)
The UI preview (simulated data) is live at a public URL you can open on any phone:

<https://raw.githack.com/cameron-scale/fyxer-email-assistant/claude/centurion-agent-build-xyo5h1/centurion/dashboard/demo.html>

No account, no deploy. Good for showing the interface around.

## Option 2 — Real dashboard + agent, free, on Render
This runs the actual Flask dashboard with the decision loop ticking in-process,
at a public HTTPS URL. Free tier, **no credit card**.

> **Simulation only (no real money).** On the free host the agent runs in
> simulation: the **$10 seed is simulated**, no Stripe key is used, and no real
> money can move. It behaves exactly like the real thing so you can watch and
> control it from anywhere — but real-money operation belongs on your own
> always-on machine (see GO_LIVE.md), never a free shared host.

### Steps from your phone (~5 minutes, all in the browser)
1. Go to <https://render.com> → **Get Started** → **Sign in with GitHub** (no card).
2. Tap **New +** → **Blueprint**.
3. Connect/select the repo **`cameron-scale/fyxer-email-assistant`**
   (authorize Render to see it if asked).
4. Choose the branch **`claude/centurion-agent-build-xyo5h1`**. Render finds
   `render.yaml` automatically.
5. It will prompt you to enter **CENTURION_DASHBOARD_TOKEN** — type any password
   you'll remember (this unlocks the control buttons). The simulated seed is
   already set to **$10**.
6. Tap **Apply** / **Create**. First build takes ~2–4 min. You get a public URL
   like `https://centurion-dashboard.onrender.com`.
7. Open that URL on your phone — from anywhere in the world. Tap a control
   (Pause / dial) and it asks for the token you set in step 5.

That's it: a live dashboard you can reach from any phone, browser, or network.

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
