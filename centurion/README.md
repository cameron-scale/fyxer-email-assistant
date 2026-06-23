# Centurion — Autonomous Capital Growth Agent

Centurion turns a small amount of **real seed capital** (default **$100**) into
more by autonomously researching, launching, and operating legitimate digital
micro-businesses and arbitrage. The mission milestone is **10x ($1,000)**; with
reinvestment it keeps compounding past that toward whatever target you set. It
runs **24/7, unattended, fully local on your own machine** — its decisions come
from a **custom Decision Core** and a **self-hosted language model**, with **no
third-party AI API anywhere in the loop**.

> **The hard promise:** you can never lose more than the capital you fund. Every
> dollar it earns can be reinvested, but the *loss floor* stays pinned to your
> seed. That cap is enforced mechanically, not by good behavior.

---

## What makes it tick

| Module | Role |
|---|---|
| `orchestrator.py` | Long-running daemon. Each cycle: assess → decide → guard → execute → learn → report. |
| `ledger.py` | SQLite source of truth for capital. Balance can never go negative. |
| `risk.py` | Capital ceiling, drawdown floor, **anti-escalation** caps, velocity caps, kill switch, anomaly auto-pause. |
| `guardrails.py` | Legal/ToS, no-obligation, prohibited-strategy blocks. Run before *every* action, at every autonomy level. |
| `autonomy.py` | The dial: `full` / `guarded` / `review`. Only ever *adds* friction. |
| `intelligence/decision_core/` | Thompson-sampling bandit + transparent EV scoring + constrained allocator. Deterministic, auditable, offline. |
| `intelligence/language/` | Swappable `LanguageProvider`: local model (Ollama) / template / stub. |
| `intelligence/memory.py` | Persistent learning — lessons from every failure, mistake, and win. |
| `intelligence/research.py` | Creative, human-style ideation (analogy, combination, first-principles, constraint-flip…). |
| `strategies/` | Five pluggable strategies (digital products, service arbitrage, POD, content/affiliate, reselling research). |
| `autodebug.py` | Live error log + self-healing + performance diagnosis. |
| `supervisor.py` | Heartbeat, watchdog, stale-alerting. |
| `reporter.py` | Daily plain-language report + ETA projection. |
| `dashboard/app.py` | Remote management UI: balance, activity, results, errors, **pause/kill**, autonomy dial. |
| `integrations/` | Stripe (revenue, mock mode keyless), Stripe webhook, Twilio/SMTP alerts. |

---

## Quick start (simulated dry run, no keys, no model)

```bash
cd centurion
pip install -r requirements.txt

python main.py --init            # seeds the ledger with $100
python main.py run --cycles 20 --interval 0   # full-autonomy simulated dry run
python main.py status
python main.py report            # writes data/reports/report_YYYY-MM-DD.md
```

Run the dashboard (separate terminal):

```bash
CENTURION_DASHBOARD_TOKEN=yourtoken python dashboard/app.py
# open http://localhost:8000  (token-protected pause/kill + autonomy dial)
```

Run the tests:

```bash
python -m pytest -q
```

---

## The Operating Ethos (and why the guardrails outrank the goal)

Centurion is relentless about the 10x target, but **winning is defined as
reaching the target _within the walls_**: the hard capital ceiling, the
no-obligation rule, and full legal/ToS compliance. A dollar earned outside the
walls is disqualification, not progress. There are three outcomes:

1. **Win** — reach the target within the walls.
2. **Honorable shortfall** — try every legitimate path with full effort,
   preserve capital, and still fall short. Respectable; it reports honestly and
   stops.
3. **The one unacceptable outcome** — break a wall, escalate into reckless bets
   because the balance is behind, or game the ledger. This is the only true
   failure, regardless of the number.

When **behind**, the disciplined move is to **lower variance**, not bet harder.
The Risk Manager enforces this mechanically: **per-action caps shrink as
drawdown deepens and never rise because the agent is behind.** Drive lives in
effort and creativity — never in risk escalation or rule-bending.

---

## The hard caps (provable, tested)

- **Capital ceiling / loss floor.** Spending that would breach the floor
  (`drawdown_floor × funded_capital`) is rejected; the ledger refuses any debit
  below zero. **Maximum possible loss = the funded seed, full stop** — even
  after profits, the floor stays pinned to the seed.
- **Reinvestment.** Earned money is redeployed: spend caps are a fixed *fraction
  of the current balance*, so profit compounds into larger deployments while the
  discipline (the fraction) never changes and drawdown still tightens.
- **No obligation beyond capital.** Recurring charges, subscriptions, contracts,
  credit lines — refused and logged.
- **Prohibited strategies** (fraud, fake reviews/engagement, scraping behind
  auth, spam, market manipulation, MLM, counterfeit, impersonation, …) —
  hard-blocked at every autonomy level.
- **Velocity caps** — max spend per hour and per day, so it can't drain the
  budget in one bad hour while you sleep.
- **Kill switch** — one CLI command or dashboard button pauses everything.
- **Anomaly auto-pause** — repeated errors/anomalies pause + alert.

```bash
python main.py pause --reason "checking in"   # kill switch
python main.py resume
python main.py set-autonomy guarded           # full | guarded | review
```

---

## The dial (autonomy levels)

- `full` (default) — every guardrail-and-capital-cleared action executes
  immediately, no human in the loop.
- `guarded` — spends ≤ `guarded_auto_approve_cap` execute; larger spends queue;
  non-spend actions run free.
- `review` — every spend / external action queues for approval.

The dial can only *add* friction. It can never loosen the hard guardrails.

---

## Self-healing & the auto-debugger

- **Live error log** — every exception captured with traceback, classified,
  persisted, and shown on the dashboard.
- **Automatic recovery** — language-engine failure falls back to the
  deterministic template provider; transient I/O is retried; a single
  misbehaving strategy is quarantined so the rest keep running; unrecoverable
  faults **pause + alert** (fail safe, never barrel on).
- **Health check before resuming** — after a self-heal step it re-verifies the
  safety invariants (and can run the test suite) so it only continues from a
  known-good state.
- **Performance diagnosis** — strategies that persistently bleed capital are
  disabled; a stalled balance raises exploration.

**Responsible boundary:** operational self-healing is fully automatic. Autonomous
**source-code rewriting** of a live money system is *not* done silently — it is
gated behind `auto_apply_code_fixes` (default **off**), and even when enabled a
proposed patch is tested in a sandbox and only applied if tests pass; otherwise
it's quarantined for your review. Money-handling code does not edit itself behind
your back. This is a deliberate safety choice, not a limitation.

---

## The intelligence (no third-party AI APIs)

- **Decision Core** (`intelligence/decision_core/`) makes every money decision:
  a Thompson-sampling bandit over strategies/opportunity-types (learns from
  realized return), a transparent EV scoring model, and a constrained allocator.
  Deterministic given a seed, auditable line by line, `numpy`-only (optional
  offline `scikit-learn` regressor). It cannot hallucinate a trade.
- **Language Engine** (`intelligence/language/`) is used *sparingly*, only when
  words are needed, behind one `generate(prompt, schema)` interface:
  - `local` — self-hosted model via **Ollama** (default in production),
  - `template` — zero-ML deterministic copy (default for dry runs),
  - `stub` — fixed output for tests.

  The `local` provider **refuses any non-local host**, so the
  "no third-party AI" invariant can't be broken by misconfiguration. A test
  greps the codebase to prove no hosted-AI endpoints exist.

### Running the local model

```bash
# install Ollama (https://ollama.com), then:
ollama pull llama3.1:8b-instruct-q4_K_M
# set in config.yaml:  language_provider: local
python main.py status   # provider should read "local"
```

A quantized 7B–14B runs on modest hardware; larger models want a GPU. The
monthly compute budget (`monthly_compute_budget`) is respected — if hit, it
keeps operating existing assets and pauses new generation.

---

## Strategies

1. **Digital Products** — niche research → small digital product → landing page
   → list → collect via Stripe; optional capped ads.
2. **Productized Service Arbitrage** — in-demand service fulfilled with AI;
   near-zero capital.
3. **Print on Demand** — design concepts + listings for a POD platform with a
   real API; surfaces candidates if no API exists.
4. **Content & Affiliate** — content asset + compliant affiliate links.
5. **Curated Reselling Research** — under-priced→fair-priced spreads on
   API-backed marketplaces only; surfaces (never fakes) manual-only candidates.

Enable/disable each in `config.yaml`. Selection is by EV per dollar and per hour
with a strong penalty on capital at risk; multiple can run in parallel.

---

## One-time onboarding (for live operation)

Set these up once, then Centurion runs against them autonomously:

1. **Stripe** account + payout destination → `STRIPE_API_KEY`,
   `STRIPE_WEBHOOK_SECRET` in `.env`. (No key = mock mode, no real money.)
2. **Platform API keys** for any strategy you enable (POD, marketplace).
3. **A prepaid / virtual card loaded with exactly the funded amount** — a
   belt-and-suspenders hard cap at the card level on top of the software ceiling.
4. **The local model** — `ollama pull …` and confirm `python main.py status`
   shows `provider: local` answering with no internet AI service involved.
5. (Optional) **Twilio / SMTP** for alerts and remote approval.

Then run live: `python main.py run --live`.

---

## 24/7 deployment

**Docker (recommended):**

```bash
cd centurion
docker compose -f deploy/docker-compose.yml up -d --build
docker compose -f deploy/docker-compose.yml exec ollama \
  ollama pull llama3.1:8b-instruct-q4_K_M
```

`restart: always` relaunches any crashed service. The dashboard is published on
port 8000.

**systemd (no Docker):** install `deploy/centurion.service` (it uses
`Restart=always`).

**Reliability built in:** crash-safe idempotent action state machine (a
mid-action crash never double-spends — reconciled on restart), heartbeat +
watchdog alerting on staleness, fail-safe pause on anomalies, and remote
kill/dial via the dashboard or SSH CLI. Capital exhaustion is a *clean stop*:
it keeps operating live assets and reporting, and waits.

---

## Configuration (`config.yaml` highlights)

| Key | Meaning |
|---|---|
| `funded_capital` | Hard max loss (default 100). |
| `target_capital` | 10x milestone (1000). |
| `ultimate_target` | Keep compounding past 10x. |
| `autonomy_level` | `full` / `guarded` / `review`. |
| `per_action_cap`, `per_strategy_cap` | Spend caps (fractions of current balance under reinvestment). |
| `drawdown_floor` | Loss floor as a fraction of the seed. |
| `max_spend_per_hour` / `_day` | Velocity caps. |
| `reinvest_earnings` | Compound earnings into bigger deployments (default true). |
| `language_provider`, `model_name` | `local` / `template` / `stub`. |
| `decision_seed` | Determinism for the Decision Core. |

Secrets live in `.env` (copy from `.env.example`). **There is intentionally no
AI API key.**

---

## An honest word on expectations

10x from $100 is a genuinely hard target, and most honest attempts land as an
*honorable shortfall* — that's expected and fine. Centurion's job is to chase
the bar with full effort and total discipline; the math that protects your
downside is the same math that says it won't manufacture a miracle. Fund only
what you can afford to lose, read the daily report, and let the hard caps do
their job. **The Decision Core is the asset. The target is the scoreboard.**
