# Centurion strategy — the warm-channel plan

This is the part no architecture can fix: **without distribution, a small
bankroll mostly lands as an honorable shortfall.** The difference now is that you
DO have a reachable audience — the ScaleMBS medical-billing world — so the plan is
built to aim one honest product straight at it. See `PLAYBOOK.md` for the tap-by-
tap operator loop.

## The single bet: honest niche products + your warm channel

Centurion focuses on **`digital_products`** (`focus_strategy` in `config.yaml`) —
the one strategy with a fully wired live path (real deliverable file + real Stripe
link + post-payment delivery). Reasoning:

- **Distribution is yours, not borrowed.** The highest-EV first sale is a
  **warm-email or LinkedIn draft** (Lane B) to billers you already reach, carrying
  one quality product link. Centurion drafts it; you approve, copy, send. Cold SEO
  (Lane A) compounds in the background over weeks — it is not the week-one plan.
- **The fee math clears.** A $19–$49 ticket loses only ~$0.85–$1.72 to Stripe;
  two or three sales clear $100. A $5 product loses ~6% to the fixed fee alone, so
  price for a professional buyer, not a bargain hunter.
- **Capital ≈ $0 to make.** The deliverable is generated work; the $10 seed is a
  loss cap, not a production cost. Real spending stays off until you arm it.

## The sequence (organic-first, de-risked)

1. **Prove $1 before risking $100.** `require_organic_proof: true` blocks all paid
   spend until one real organic sale lands. Centurion lists the offer and earns
   first; only then is the budget unlocked.
2. **Concentrate, don't spread.** One niche, one strong offer. Five shallow plays
   are five ways to lose slowly.
3. **Force the math.** Every paid action must clear `min_net_ev` / `min_margin`
   *after fees* or it's a **HOLD** — patience is the +EV move on a small bankroll.
4. **Reinvest only what's working.** Caps scale with the balance; losers are
   disabled by the performance monitor; the bandit shifts weight to winners
   across rounds (it won't "converge" inside one $100 run — treat it as a
   cross-round optimizer leaning on priors early).
5. **Measure decision quality, not just balance.** Predicted-vs-realized is
   logged so you can tell skill from luck before ever trusting it with more.

## Guardrails specific to this plan

- **Your name is protected.** Service listings post under a fresh marketplace
  seller identity (a sandbox identity), never "ScaleMBS". Anything that *would*
  publish under the real brand is human-gated in live mode (`brand_human_gate`).
- **ToS teeth.** Many marketplaces restrict fully-automated accounts. Keep a human
  in the loop on account actions (guarded autonomy does this), disclose AI
  assistance where required, and route revenue/tax through your LLC. Bans cost
  access, not just cash — treat platform rules as hard walls.
- **Copy quality.** Customer-facing text uses the strong deterministic template
  layer, not only the small local model, so conversion doesn't hinge on weaker
  copy. The local model drafts; templates guarantee a floor.

## Using your distribution well

You have the edge most cold-starts lack: a warm audience. Use it deliberately —
approve one genuinely useful product, send one honest note, and let the buyers
(not an algorithm) decide. The bandit then learns from **real Stripe sales**
(rewards are queued by the webhook and applied by the agent) and makes more of
what actually sold. Set `CENTURION_BRAND` so your company name can never
auto-publish, and keep `sandbox_identity` for anything posted under a store name.

## Honest odds

With a real warm channel and an honest $19–$49 product, $10 → $100 is a handful of
sales, not a miracle — plausible inside a couple of weeks if you actually send the
drafts. The discipline above keeps the *downside* pinned to the seed and the
*learning* real, so a shortfall is cheap and informative rather than a blown
bankroll. The one thing the software can't do is press send for you.
