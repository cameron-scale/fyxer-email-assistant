# Centurion strategy — the cold-start plan

This is the part no architecture can fix: **without a validated edge and a
distribution channel, a $100 bankroll mostly lands as an honorable shortfall.**
You confirmed there's no existing audience yet, so this plan is built around that
reality instead of pretending otherwise.

## The single bet: one narrow-niche productized service

Centurion is configured to **focus on `service_arbitrage` only** (`focus_strategy`
in `config.yaml`). Reasoning:

- **Distribution is borrowed, not built.** A service marketplace (Fiverr, Upwork,
  etc., per their ToS for automated assistance + human oversight) already has
  buyers searching. That sidesteps the fatal flaw of POD/templates/affiliate
  with no audience: making something nobody sees. *The marketplace is the engine
  of demand.*
- **The fee math clears.** A $75 ticket loses ~$2.50 to Stripe; a $5 product
  loses ~6% to the fixed fee alone. Higher ticket = fees are noise.
- **Capital ≈ $0.** The deliverable is AI-assisted work, so the downside is time,
  not the bankroll. The $100 is reserved for *amplifying* what already converts.

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

## When you DO have distribution

The single highest-leverage change remains pointing Centurion at a real audience
(a list, a following, an existing client base). The moment one exists, switch
`focus_strategy` to the offer that fits it and set `sandbox_identity` so it can
operate autonomously through that channel. Distribution is the edge; this plan is
the best version of *not having one yet*.

## Honest odds

Higher-ticket service on borrowed distribution is the most defensible cold bet,
but 10x from $100 is still hard and most honest attempts fall short. The point of
the discipline above is to make the *downside* small and the *learning* real, so
a shortfall is cheap and informative rather than a blown bankroll.
