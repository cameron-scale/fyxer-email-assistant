# Taking Centurion live

Centurion ships fully built and tested. Going **live** means running it on **your
own always-on machine** with **your** accounts — that part can only be done by
you, because it involves your identity, your money, and your API keys. This is
the one-time onboarding; after it, Centurion operates autonomously.

> Centurion will not start in live mode until `python main.py doctor --live`
> passes every **critical** check. It refuses to autonomously spend real money
> from a half-configured host.

## 1. Put it on an always-on host (your PC or a VPS)
```bash
git clone <your-fork> && cd centurion
pip install -r requirements.txt
cp .env.example .env          # then edit .env (below)
python main.py --init          # seeds the ledger with your funded capital
```

## 2. Install the local model (no third-party AI, ever)
```bash
# install Ollama from https://ollama.com
ollama serve &
ollama pull llama3.1:8b-instruct-q4_K_M
```
Then set in `config.yaml`: `language_provider: local`.

## 3. Connect the money rail (Stripe)
- Create a Stripe account, add your payout bank account.
- Put your keys in `.env`: `STRIPE_API_KEY=`, `STRIPE_WEBHOOK_SECRET=`.
- Point a Stripe webhook at `http://<your-host>:8000/` (the dashboard process
  hosts the webhook handler) so sales are credited in real time.

## 4. Set the hard cap at the card level (belt-and-suspenders)
- Load a **prepaid / virtual card with ONLY your funded amount** (default $100).
  Use it as the funding source for any paid action. This caps real-world loss
  at the card level, on top of Centurion's software loss floor.
- Acknowledge it: `python main.py confirm-card`

## 5. Secure the remote kill switch
- Set `CENTURION_DASHBOARD_TOKEN=<something-strong>` in `.env`.

## 6. Preflight, then go
```bash
python main.py doctor --live      # must say READY
python main.py run --live         # starts the daemon against real money
```
Run the dashboard so you can watch and hit pause from anywhere:
```bash
CENTURION_DASHBOARD_TOKEN=... python dashboard/app.py   # http://<host>:8000
```
Or run the whole stack 24/7 with Docker:
```bash
docker compose -f deploy/docker-compose.yml up -d --build
```

## Recommended for your first live days
- Start at **`autonomy_level: guarded`** (or `review`) and watch a few real
  cycles before switching to `full`. You want to see its judgment with your own
  eyes first. Change anytime: `python main.py set-autonomy full`.
- The default live revenue path **lists products and creates Stripe payment
  links — it does not spend on ads** until you wire a real ad-platform API, so
  your capital isn't risked on unproven promotion out of the gate.

## What's protected no matter what
- Max loss = your funded seed. The loss floor is enforced in code and (with the
  card) at the card level.
- Caps tighten under drawdown and never rise when behind (no chasing losses).
- Velocity caps limit spend per hour and per day.
- One command or the dashboard button pauses everything: `python main.py pause`.
