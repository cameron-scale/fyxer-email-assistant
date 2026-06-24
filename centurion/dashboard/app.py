"""Centurion dashboard backend.

Serves:
  * a JSON API the React UI polls for live state (/api/state),
  * token-protected control endpoints (pause/resume/autonomy/approve/reject/
    strategy toggle),
  * the built React app from web/dist (falls back to a simple HTML page if the
    app hasn't been built yet, so nothing breaks out of the box),
  * the Stripe webhook (/webhook/stripe) for event-driven revenue.

Run:  CENTURION_DASHBOARD_TOKEN=... python dashboard/app.py   ->  http://host:8000
Build the React UI once:  cd dashboard/web && npm install && npm run build
"""
from __future__ import annotations

import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from config import load_config           # noqa: E402
from orchestrator import Orchestrator    # noqa: E402
from reporter import Reporter            # noqa: E402
from supervisor import Supervisor        # noqa: E402

WEB_DIST = Path(__file__).resolve().parent / "web" / "dist"

# Background agent (used when hosting one free web service that should also run
# the decision loop in-process). Guarded so it starts at most once per process.
_AGENT_STARTED = False


def _start_background_agent(cfg) -> None:
    global _AGENT_STARTED
    if _AGENT_STARTED:
        return
    _AGENT_STARTED = True
    import threading

    def _loop():
        o = Orchestrator(cfg)
        if not o.ledger.is_seeded():
            o.ledger.seed(cfg.funded_capital)
        o.sim = True  # never run real money on a shared/free host
        interval = float(cfg.get("cycle_interval_minutes", 45)) * 60
        # On a free host a tight-ish cadence keeps the dashboard lively.
        interval = min(interval, 120.0)
        o.run_forever(sleep_seconds=interval)

    t = threading.Thread(target=_loop, name="centurion-agent", daemon=True)
    t.start()

# Pretty names + stable ids for the five strategies, in display order.
STRAT_META = [
    ("digital_products", "dp", "Digital products"),
    ("service_arbitrage", "sa", "Service arbitrage"),
    ("content_affiliate", "ca", "Content & affiliate"),
    ("reselling_research", "cr", "Curated reselling"),
    ("print_on_demand", "pod", "Print on demand"),
]


def _hhmmss(ts: float) -> str:
    return datetime.fromtimestamp(ts).strftime("%H:%M:%S")


def build_state(o: Orchestrator) -> dict:
    led = o.ledger
    rep = Reporter(led, o.cfg, memory=o.memory, risk=o.risk, calibration=o.calibration)
    sup = Supervisor(led, o.cfg)

    balance = led.balance()
    funded = o.risk.funded_capital()
    target = float(o.cfg.get("target_capital", 1000.0))
    txns = led.transactions(5000)

    # --- system / mission state ---
    paused = o.risk.is_paused()
    system_state = "paused" if paused else "live"
    today = rep._net_since(86400)
    mission_pct = max(0.0, min(1.0, (balance - funded) / (target - funded))) if target > funded else 0.0

    # --- capital split ---
    in_flight = sum(a["cost"] for a in led.actions_by_status("in_progress"))
    deployed = sum(led.strategy_spend(name) for name, _, _ in STRAT_META)
    available = max(0.0, round(balance - in_flight, 2))

    # --- per-strategy performance ---
    disabled = o.disabled_strategies()
    cfg_strats = o.cfg.get("strategies", {})
    strategies = []
    # precompute per-strategy credit/debit
    for name, sid, pretty in STRAT_META:
        spent = led.strategy_spend(name)
        revenue = sum(t["amount"] for t in txns
                      if t["strategy"] == name and t["type"] == "credit")
        net = round(revenue - spent, 2)
        # bets + win rate from calibration predictions
        cal = [r for r in o.calibration.rows() if r["strategy"] == name]
        trades = len(cal)
        wins = sum(1 for r in cal if r["realized"] > 0)
        win = (wins / trades) if trades else 0.0
        enabled = (cfg_strats.get(name, {}).get("enabled", True)) and name not in disabled
        # spark: running net over this strategy's recent bets
        run, spark = 0.0, []
        for r in cal[-8:]:
            run += r["realized"]
            spark.append(round(run, 2))
        if not spark:
            spark = [0, 0]
        # note
        if not enabled:
            note = "off"
        elif name == o.focus_strategy:
            note = "focused"
        elif trades < 3:
            note = "exploring"
        elif net > 0:
            note = "exploiting"
        elif net < 0:
            note = "throttled"
        else:
            note = "slow fuse"
        strategies.append({
            "id": sid, "name": pretty, "alloc": round(spent, 2), "ret": net,
            "win": round(win, 2), "trades": trades, "enabled": enabled,
            "spark": spark, "note": note,
        })

    # --- activity feed (transactions + rejected actions + opportunities) ---
    events = []
    for t in txns:
        if t["description"] == "seed capital":
            continue
        if t["type"] == "credit":
            events.append((t["ts"], {"t": _hhmmss(t["ts"]), "k": "rev",
                                     "m": t["description"] or "sale", "v": t["amount"]}))
        else:
            events.append((t["ts"], {"t": _hhmmss(t["ts"]), "k": "spend",
                                     "m": t["description"] or "spend", "v": -t["amount"]}))
    for a in led.actions(80):
        if a["status"] == "rejected":
            events.append((a["ts"], {"t": _hhmmss(a["ts"]), "k": "block",
                                     "m": a["description"] or "blocked"}))
    for opp in led._conn().execute(
            "SELECT ts, strategy, brief FROM opportunities ORDER BY id DESC LIMIT 20").fetchall():
        events.append((opp["ts"], {"t": _hhmmss(opp["ts"]), "k": "res",
                                   "m": f"Scored opportunity · {opp['strategy']}"}))
    events.sort(key=lambda e: e[0], reverse=True)
    activity = [e[1] for e in events][:40]

    # --- pending approvals ---
    pending = [{"id": p.action_id, "m": p.description, "cost": round(p.cost, 2),
                "ev": round(p.expected_return, 2)} for p in o.approvals.pending()]

    # --- velocity ---
    vel = {
        "hour": round(led.spend_since(3600), 2),
        "hourCap": o.risk.max_spend_per_hour,
        "day": round(led.spend_since(86400), 2),
        "dayCap": o.risk.max_spend_per_day,
    }

    # --- history series (sampled balance over transactions) ---
    asc = sorted(txns, key=lambda t: t["ts"])
    pts = [t["balance_after"] for t in asc] or [balance]
    if len(pts) > 40:
        step = len(pts) / 40.0
        pts = [pts[int(i * step)] for i in range(40)]
    history = [{"day": i, "v": round(v, 2)} for i, v in enumerate(pts)]

    # --- system health ---
    last_cycle_ts = float(led.get_state("last_cycle_ts", "0") or 0)
    first_ts = asc[0]["ts"] if asc else time.time()
    uptime_days = (time.time() - first_ts) / 86400.0
    provider = o.language.name
    system = {
        "heartbeat": round(sup.heartbeat_age()) if sup.last_heartbeat() else None,
        "lastCycleAgo": round((time.time() - last_cycle_ts)) if last_cycle_ts else None,
        "model": f"{o.cfg.get('model_name', 'template')} · {provider}",
        "computeUsed": float(led.get_state("compute_spent", "0") or 0),
        "computeBudget": float(o.cfg.get("monthly_compute_budget", 0) or 0),
        "anomalies": o.risk.anomaly_count(),
        "blocks": len(led.actions_by_status("rejected")),
        "calibration": o.calibration.stats().verdict,
    }

    return {
        "systemState": system_state,
        "mode": o.autonomy.level.value,
        "balance": round(balance, 2),
        "funded": funded,
        "target": target,
        "today": today,
        "multiple": round(balance / funded, 2) if funded else 0,
        "missionPct": round(mission_pct, 4),
        "deployed": round(deployed, 2),
        "available": available,
        "inflight": round(in_flight, 2),
        "vel": vel,
        "history": history,
        "strategies": strategies,
        "activity": activity,
        "pending": pending,
        "system": system,
        "uptimeDays": round(uptime_days, 2),
        "host": os.environ.get("CENTURION_HOST", "local"),
        "cycleMins": o.cfg.get("cycle_interval_minutes", 45),
        "focusStrategy": o.focus_strategy,
    }


def create_app(config_path: str | None = None) -> Flask:
    app = Flask(__name__, static_folder=None)
    cfg = load_config(config_path)
    token = os.environ.get("CENTURION_DASHBOARD_TOKEN", "change-me")

    def orch() -> Orchestrator:
        return Orchestrator(cfg)

    # Optionally run the agent loop in this same process (free single-service
    # hosting). Enabled with CENTURION_RUN_AGENT=1. Always simulation on a host.
    if os.environ.get("CENTURION_RUN_AGENT") == "1":
        _start_background_agent(cfg)

    def authed() -> bool:
        supplied = request.args.get("token") or request.headers.get("X-Centurion-Token")
        if not supplied:
            if request.is_json:
                supplied = (request.get_json(silent=True) or {}).get("token")
            else:
                supplied = request.form.get("token")
        return supplied == token

    # ---- API ----
    @app.get("/api/state")
    def api_state():
        return jsonify(build_state(orch()))

    @app.post("/api/control/pause")
    def api_pause():
        if not authed():
            return jsonify(error="unauthorized"), 401
        body = request.get_json(silent=True) or {}
        orch().risk.pause(body.get("reason", "dashboard"))
        return jsonify(ok=True)

    @app.post("/api/control/resume")
    def api_resume():
        if not authed():
            return jsonify(error="unauthorized"), 401
        orch().risk.resume()
        return jsonify(ok=True)

    @app.post("/api/control/autonomy")
    def api_autonomy():
        if not authed():
            return jsonify(error="unauthorized"), 401
        level = (request.get_json(silent=True) or {}).get("level", "full")
        if level not in ("full", "guarded", "review"):
            return jsonify(error="bad level"), 400
        o = orch()
        o.autonomy.set_level(level)
        o.ledger.set_state("autonomy_level", level)
        return jsonify(ok=True, level=level)

    @app.post("/api/control/approve")
    def api_approve():
        if not authed():
            return jsonify(error="unauthorized"), 401
        aid = int((request.get_json(silent=True) or {}).get("id"))
        orch().approvals.approve(aid)
        return jsonify(ok=True)

    @app.post("/api/control/reject")
    def api_reject():
        if not authed():
            return jsonify(error="unauthorized"), 401
        aid = int((request.get_json(silent=True) or {}).get("id"))
        orch().approvals.reject(aid)
        return jsonify(ok=True)

    @app.post("/api/control/strategy")
    def api_strategy():
        if not authed():
            return jsonify(error="unauthorized"), 401
        body = request.get_json(silent=True) or {}
        name = body.get("name")
        enabled = bool(body.get("enabled"))
        ids = {sid: full for full, sid, _ in STRAT_META}
        full = ids.get(name, name)
        orch().set_strategy_enabled(full, enabled)
        return jsonify(ok=True)

    @app.post("/webhook/stripe")
    def stripe_webhook():
        from integrations.stripe_webhook import verify_and_parse, handle_event
        try:
            event = verify_and_parse(request.data, request.headers.get("Stripe-Signature"),
                                     os.environ.get("STRIPE_WEBHOOK_SECRET"))
        except Exception as e:
            return jsonify(error=str(e)), 400
        res = handle_event(event, orch().ledger)
        return jsonify(handled=res.handled, detail=res.detail)

    # ---- serve the built React app (fallback to simple HTML) ----
    @app.get("/")
    def index():
        if (WEB_DIST / "index.html").exists():
            return send_from_directory(WEB_DIST, "index.html")
        return _fallback_html(orch(), token)

    @app.get("/<path:path>")
    def assets(path):
        if WEB_DIST.exists() and (WEB_DIST / path).exists():
            return send_from_directory(WEB_DIST, path)
        return jsonify(error="not found"), 404

    return app


def _fallback_html(o: Orchestrator, token: str) -> str:
    rep = Reporter(o.ledger, o.cfg, memory=o.memory, risk=o.risk, calibration=o.calibration)
    return (
        "<!doctype html><meta charset='utf-8'><title>Centurion</title>"
        "<body style='font-family:system-ui;background:#07090D;color:#F2F5F8;padding:32px'>"
        f"<h1>Centurion</h1><p>{rep.cli_summary()}</p>"
        "<p style='color:#7A8699'>The polished dashboard isn't built yet. Build it once:</p>"
        "<pre style='background:#0E1218;padding:12px;border-radius:8px'>"
        "cd dashboard/web\nnpm install\nnpm run build</pre>"
        "<p style='color:#7A8699'>Live JSON is available now at "
        "<a style='color:#2DE2E6' href='/api/state'>/api/state</a>.</p></body>"
    )


app = create_app()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    app.run(host="0.0.0.0", port=port)
