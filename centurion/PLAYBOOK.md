# Centurion — the $10 → $100 playbook

Honest framing first: the software can build products, take money, and run the
learning loop by itself. It **cannot manufacture an audience.** The single thing
that turns $10 into $100 fastest is *you* pointing one good product at people you
can already reach — your ScaleMBS clients and contacts. Everything below is built
to make that one move as easy as a couple of taps.

## The model in one line
Centurion drafts honest, niche-specific products and outreach → **you approve and
share** → sales land in Stripe → the bandit learns which products/copy actually
sell → it makes more of what works. Downside is capped at your seed; real
*spending* stays off behind a switch.

## One-time setup (5 minutes, from your phone)
1. **Lock the controls.** In Render → Environment, set `CENTURION_DASHBOARD_TOKEN`
   to a private value (right now it's the default, so the dashboard shows a red
   "control plane is OPEN" banner and disables actions for safety). Redeploy.
2. **Confirm Stripe is live.** System panel should read `stripe: live`. (Your key
   is recognized under `STRIPE_API_SECRET_KEY`.)
3. **Webhook.** Add the Stripe webhook to `…/webhook/stripe` for
   `checkout.session.completed` and `charge.refunded`, and set
   `STRIPE_WEBHOOK_SECRET` in Render. In live mode Centurion **refuses unsigned
   events**, so this is required for sales to credit.
4. **Niche is set** to `medical billing for small practices`. Optionally set
   `CENTURION_BRAND` to your company name — anything a draft writes that contains
   your brand is routed to you, never auto-published.
5. **Fund the seed.** Tap **$ Fund → 10**. This sets the real capital baseline.
   It is *not* a card charge (paying your own Stripe link is against Stripe's
   terms). If you later arm real spending, load a $10 prepaid card so the cap is
   backed by real money.

## The daily loop (2–3 minutes)
1. Open the dashboard. Check the **Lane B** panel.
2. You'll see **warm-email** and **LinkedIn** drafts aimed at billers — short,
   honest notes with one product link. Read one. If it's good: **Approve**, then
   **Copy text**, paste it into your email/LinkedIn, send, and tap **Mark posted**.
   *That send is the whole revenue engine.* One warm note to your list beats a
   month of cold SEO.
3. In **Storefront**, tap **Share** on the product you like best to grab its link.
4. Glance at **Growth** — SEO pages are compounding in the background (weeks, not
   days; they don't need your attention).

## Make the products genuinely good (optional, on your Mac)
Render runs on fast deterministic templates. Your Mac's Ollama makes the copy
noticeably better, on your own hardware (no third-party AI, ever):
1. Set `CENTURION_BRIDGE_TOKEN` in Render to a second private value.
2. On the Mac, in the `centurion/` folder:
   ```
   ollama serve            # if not already running
   python3 ollama_bridge.py --server https://centurion-dashboard.onrender.com \
       --token YOUR_BRIDGE_TOKEN --model llama3.1:8b
   ```
   It pulls quality-upgrade jobs, runs them locally, and posts results back;
   Centurion re-checks compliance and upgrades the product/page in place. If the
   Mac is off, nothing breaks — upgrades just wait.

## What "good" looks like in a week
- 3–6 focused billing products live, each with a real buy link.
- A handful of warm sends you approved and posted.
- SEO pages accumulating (the long game).
- **First sale = one biller buys one $19–$49 pack.** Two or three of those clears
  $100. That's the target — not virality, just a warm audience and an honest offer.

## The guardrails that protect you (they outrank the goal)
- No income/earnings claims, no fake reviews, no CPT code lists (AMA copyright).
- Every deliverable carries an "educational only, not billing/coding/legal advice"
  line — appropriate for this niche.
- Real spending is OFF until you arm it; the loss cap can never exceed your seed.
- Your brand name never auto-publishes.
