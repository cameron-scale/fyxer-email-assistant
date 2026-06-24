# What I need from you (everything else is done)

Centurion is built, tested, and ready. These are the only steps that need *you* —
your machine, your accounts, your money. I can't do them remotely.

## To run it in SIMULATION (no money — do this first)
1. A Windows PC that can stay on.
2. Install **Python 3.11+** from python.org — tick **"Add Python to PATH"**.
3. Download the project ZIP, unzip it, open the `centurion` folder, and
   **double-click `start.bat`**. It opens the dashboard at http://localhost:8000.

That's the whole sim setup. Watch a few cycles so you trust its judgment.

## To go LIVE with real money (when you're ready)
4. **Funded amount + risk** — confirm the cap (default **$100**). This is the most
   you can ever lose.
5. **Prepaid / virtual card** loaded with **only** that amount — use it as the
   payment source (a hard cap at the card level on top of the software cap).
6. **Stripe account** (to collect revenue) — sign up, add your payout bank, copy
   your **secret key** and **webhook secret**. Paste them into the dashboard's
   **gear → Integrations** panel (no file editing).
7. **Local AI model** — double-click **`setup-model.bat`** (installs Ollama +
   the model automatically), then set `language_provider: local`.
8. *(Optional)* **Alerts** — Twilio (SMS) and/or email creds in the same panel,
   so it can text/email you if something trips while you're away.
9. Run `python main.py doctor --live` — it refuses to start until 4–7 check out,
   then `python main.py run --live`.

## What's already taken care of (my side)
- The agent, decision core, guardrails, hard caps, anti-escalation, kill switch.
- The dashboard (balance, activity, controls, integrations panel) — prebuilt.
- `start.bat` (sim), `setup-model.bat` (model), Docker/systemd for 24/7.
- Cold-start strategy: one focused, organic-first productized service.
- Everything is in PR #3.

Reply when you've done 1–3 and I'll walk you through going live step by step.
