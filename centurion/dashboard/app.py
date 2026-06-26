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

import threading                          # noqa: E402
from config import load_config           # noqa: E402
from orchestrator import Orchestrator    # noqa: E402
from reporter import Reporter            # noqa: E402
from supervisor import Supervisor        # noqa: E402
# Eagerly load every module that is otherwise imported lazily during Orchestrator
# construction, so the whole graph is loaded ONCE here (single-threaded at import)
# and concurrent constructions can never trigger a partial-import race.
import assistant                              # noqa: E402,F401
import intelligence.language.templates        # noqa: E402,F401
import intelligence.language.stub             # noqa: E402,F401
import intelligence.language.local_llm        # noqa: E402,F401
import intelligence.language.auto             # noqa: E402,F401
try:
    import stripe                             # noqa: E402,F401  (preload to avoid per-request cost)
except Exception:
    pass
from supervisor import Supervisor              # noqa: E402,F401  (preload; used by watchdog)
from integrations.twilio_client import AlertClient  # noqa: E402,F401

# Belt-and-suspenders: serialize Orchestrator construction across threads.
_ORCH_LOCK = threading.Lock()

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
    import time as _t

    def _loop():
        with _ORCH_LOCK:
            o = Orchestrator(cfg)
        if not o.ledger.is_seeded():
            o.ledger.seed(cfg.funded_capital)
        # Collect-only LIVE revenue mode: create real Stripe payment links to take
        # money, but spending stays hard-blocked (block_all_spend) so risk is $0.
        # Anything else stays in simulation on a shared host.
        o.sim = os.environ.get("CENTURION_LIVE_REVENUE") != "1"
        # Gentle cadence: a free instance is CPU-throttled, so a busy agent
        # starves web requests. Keep-alive (separate, ~10 min) keeps it awake;
        # the agent itself can cycle slowly. Override with CENTURION_AGENT_SECONDS.
        interval = float(os.environ.get("CENTURION_AGENT_SECONDS",
                                        max(300.0, float(cfg.get("cycle_interval_minutes", 45)) * 60)))

        # Heartbeat + watchdog so you know it's alive while you're away, and get
        # an alert (SMS/email, configured in the dashboard) if it pauses, goes
        # stale, or an anomaly trips. Dedup so it doesn't spam your phone.
        from supervisor import Supervisor
        from integrations.twilio_client import AlertClient
        sup = Supervisor(o.ledger, o.cfg, alerter=AlertClient())

        def _watch():
            last = None
            while True:
                _t.sleep(max(120.0, sup.heartbeat_interval))
                try:
                    msg = sup.check_and_alert()  # alerts only when stale/paused
                    if msg != last:
                        last = msg  # state changed; avoids repeat alerts
                except Exception:
                    pass

        threading.Thread(target=_watch, name="centurion-watchdog", daemon=True).start()
        o.run_forever(sleep_seconds=interval,
                      heartbeat=lambda: sup.heartbeat(f"cycle {o.cycle_count}"))

    t = threading.Thread(target=_loop, name="centurion-agent", daemon=True)
    t.start()


_KEEPALIVE_STARTED = False


def _start_keepalive() -> None:
    """Self-ping the public URL so a free host (which sleeps on HTTP inactivity,
    not CPU) stays awake. Render provides RENDER_EXTERNAL_URL automatically."""
    global _KEEPALIVE_STARTED
    if _KEEPALIVE_STARTED:
        return
    url = os.environ.get("RENDER_EXTERNAL_URL") or os.environ.get("CENTURION_PUBLIC_URL")
    if not url or os.environ.get("CENTURION_KEEPALIVE") == "0":
        return
    _KEEPALIVE_STARTED = True
    import threading
    import time as _t
    interval = float(os.environ.get("CENTURION_KEEPALIVE_SECONDS", "600"))  # < 15-min idle

    def _ping():
        import requests
        ping_url = url.rstrip("/") + "/healthz"
        while True:
            _t.sleep(max(60.0, interval))
            try:
                requests.get(ping_url, timeout=20)
            except Exception:
                pass

    threading.Thread(target=_ping, name="centurion-keepalive", daemon=True).start()


_AUTOUPDATE_STARTED = False


def _start_autoupdate() -> None:
    """Optionally poll GitHub and restart into new code automatically. Enable
    with CENTURION_AUTO_UPDATE=1. The runner loop relaunches python on exit."""
    global _AUTOUPDATE_STARTED
    if _AUTOUPDATE_STARTED or os.environ.get("CENTURION_AUTO_UPDATE") != "1":
        return
    _AUTOUPDATE_STARTED = True
    import threading
    import time as _t
    import subprocess
    interval = float(os.environ.get("CENTURION_UPDATE_SECONDS", "600"))

    def _poll():
        while True:
            _t.sleep(max(120.0, interval))
            try:
                r = subprocess.run(["git", "pull", "--ff-only"], cwd=str(ROOT),
                                   capture_output=True, text=True, timeout=120)
                out = ((r.stdout or "") + (r.stderr or "")).lower()
                if "up to date" not in out and r.returncode == 0:
                    os._exit(0)  # restart into new code
            except Exception:
                pass

    threading.Thread(target=_poll, name="centurion-autoupdate", daemon=True).start()

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


def _stripe_diag() -> dict:
    """Why are links mock vs real? Cheap: no Stripe object construction / network
    in the request path (keeps /api/state fast on a throttled free instance)."""
    from integrations.stripe_client import resolve_stripe_key
    key = resolve_stripe_key()
    try:
        import stripe  # noqa: F401
        lib = True
    except Exception:
        lib = False
    keytype = ("live" if key.startswith("sk_live") else
               "test" if key.startswith("sk_test") else
               ("set" if key else "missing"))
    mode = "live" if (key and lib) else "mock"
    return {"mode": mode, "keyType": keytype, "lib": lib}


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
    available = max(0.0, round(balance - in_flight, 2))

    # --- per-strategy performance ---
    # Compute everything in single passes instead of re-querying per strategy:
    # calibration.rows() was loaded 5x, strategy_spend queried 10x, and the txn
    # list scanned 5x for revenue — every poll. That starved a small CPU.
    disabled = o.disabled_strategies()
    cfg_strats = o.cfg.get("strategies", {})
    rev_by_strat: dict = {}
    for t in txns:
        if t["type"] == "credit" and t["strategy"]:
            rev_by_strat[t["strategy"]] = rev_by_strat.get(t["strategy"], 0.0) + t["amount"]
    cal_by_strat: dict = {}
    for r in o.calibration.rows():
        cal_by_strat.setdefault(r["strategy"], []).append(r)
    spend_by_strat = {name: led.strategy_spend(name) for name, _, _ in STRAT_META}
    deployed = sum(spend_by_strat.values())
    strategies = []
    for name, sid, pretty in STRAT_META:
        spent = spend_by_strat[name]
        revenue = rev_by_strat.get(name, 0.0)
        net = round(revenue - spent, 2)
        # bets + win rate from calibration predictions
        cal = cal_by_strat.get(name, [])
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
        "stripe": _stripe_diag(),
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
        "links": led.payment_links(),
        "products": [{"slug": p["slug"], "title": p["title"], "price": p["price"],
                      "landing": f"/product/{p['slug']}", "pay_url": p["pay_url"],
                      "mock": p.get("mock", False)} for p in led.products()[:12]],
        "live": os.environ.get("CENTURION_LIVE_REVENUE") == "1",
        "liveSpendArmed": led.get_state("live_spend_enabled", "0") == "1",
        "collectOnly": bool(o.risk.block_all_spend),
        "growth": _growth_summary(led),
    }


def _growth_summary(led) -> dict:
    pages = led.content_pages()
    laneB = [{"id": a["id"], "title": a["description"], "draft": a["rationale"]}
             for a in led.actions_by_status("queued") if a.get("strategy") == "growth"][:12]
    import json
    try:
        recs = json.loads(led.get_state("growth_records") or "[]")[:12]
    except Exception:
        recs = []
    return {
        "pages": len(pages),
        "views": sum(int(p.get("views", 0)) for p in pages),
        "clicks": sum(int(p.get("clicks", 0)) for p in pages),
        "laneB": laneB,
        "records": recs,
    }


def create_app(config_path: str | None = None) -> Flask:
    app = Flask(__name__, static_folder=None)
    app.config["MAX_CONTENT_LENGTH"] = 64 * 1024 * 1024  # cap code-upload size
    cfg = load_config(config_path)
    token = os.environ.get("CENTURION_DASHBOARD_TOKEN", "change-me")

    # Cache ONE Orchestrator for the web path and reuse it across requests.
    # Rebuilding the whole engine on every /api/state poll (every few seconds)
    # was the dominant cost on a small CPU and could spiral into timeouts. Reuse
    # is safe: the ledger's SQLite connection is thread-local, WAL is on, and
    # build_state reads fresh data from the DB on every call, so the UI stays
    # live. Control endpoints mutate this instance AND persist to the DB.
    _web_orch: dict = {}

    def orch() -> Orchestrator:
        o = _web_orch.get("o")
        if o is None:
            with _ORCH_LOCK:
                if _web_orch.get("o") is None:
                    _web_orch["o"] = Orchestrator(cfg)
                o = _web_orch["o"]
        return o

    # Build the web Orchestrator once, eagerly, BEFORE the agent starts — so the
    # first /api/state doesn't pay construction cost under the lock and can never
    # race the agent's own construction. Best-effort: fall back to lazy on error.
    try:
        orch()
    except Exception:
        pass

    # Optionally run the agent loop in this same process (free single-service
    # hosting). Enabled with CENTURION_RUN_AGENT=1. Always simulation on a host.
    if os.environ.get("CENTURION_RUN_AGENT") == "1":
        _start_background_agent(cfg)
    # Keep a free host awake by self-pinging its public URL (sleeps on HTTP idle).
    _start_keepalive()
    # Optional: auto-pull new code from GitHub and restart into it.
    _start_autoupdate()

    @app.get("/healthz")
    def healthz():
        return jsonify(ok=True)

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

    @app.post("/api/control/live-spend")
    def api_live_spend():
        if not authed():
            return jsonify(error="unauthorized"), 401
        enabled = bool((request.get_json(silent=True) or {}).get("enabled"))
        orch().ledger.set_state("live_spend_enabled", "1" if enabled else "0")
        return jsonify(ok=True, enabled=enabled)

    @app.post("/api/control/update")
    def api_update():
        """Pull the latest code from GitHub and restart into it. The PC's runner
        loop (_run-dashboard.bat) relaunches python, so new code goes live.
        Token-gated (a token holder can run whatever is on the branch)."""
        if not authed():
            return jsonify(error="unauthorized"), 401
        import subprocess
        import threading as _th
        try:
            r = subprocess.run(["git", "pull", "--ff-only"], cwd=str(ROOT),
                               capture_output=True, text=True, timeout=120)
            out = ((r.stdout or "") + (r.stderr or "")).strip()[-1500:]
        except Exception as e:
            return jsonify(ok=False, error=str(e)), 500
        changed = ("up to date" not in out.lower())
        if changed:
            def _restart():
                import time as _t2, os as _os2
                _t2.sleep(1.0)
                _os2._exit(0)  # runner loop relaunches with the new code
            _th.Thread(target=_restart, daemon=True).start()
        return jsonify(ok=True, changed=changed, output=out)

    @app.post("/api/control/capital")
    def api_capital():
        """Set the funded/seed capital to any amount. On a fresh ledger (no
        activity beyond the seed) this resets the balance AND the baseline to the
        new amount. Once there's real revenue/spend, it only adjusts the risk
        baseline and leaves history intact."""
        if not authed():
            return jsonify(error="unauthorized"), 401
        from ledger import SEED_DESCRIPTION
        body = request.get_json(silent=True) or {}
        try:
            amount = round(float(body.get("amount")), 2)
        except (TypeError, ValueError):
            return jsonify(error="bad amount"), 400
        if amount <= 0 or amount > 1_000_000:
            return jsonify(error="amount must be between 0 and 1,000,000"), 400
        led = orch().ledger
        has_activity = any(
            t.get("description") != SEED_DESCRIPTION for t in led.transactions(5)
        )
        if has_activity:
            led.set_funded_capital(amount)
            mode = "baseline"
        else:
            led.reset_seed(amount)
            mode = "reset"
        return jsonify(ok=True, amount=amount, mode=mode, balance=led.balance())

    @app.post("/api/control/upload-code")
    def api_upload_code():
        """Apply a .zip of updated source files onto this install and restart into
        them — a git-free way to push code from the dashboard. Token-gated (same
        trust level as the ⟳ Update button: a token holder runs whatever code they
        upload). Paths are confined to the install dir; the live DB and .git are
        never overwritten."""
        if not authed():
            return jsonify(error="unauthorized"), 401
        import io
        import zipfile
        f = request.files.get("bundle")
        if f is None:
            return jsonify(error="no file uploaded (field 'bundle')"), 400
        try:
            zf = zipfile.ZipFile(io.BytesIO(f.read()))
        except Exception as e:
            return jsonify(error=f"not a valid .zip: {e}"), 400
        entries = [n for n in zf.namelist() if not n.endswith("/")]
        if not entries:
            return jsonify(error="zip is empty"), 400

        root = ROOT.resolve()

        def _rel(name: str) -> str:
            n = name.replace("\\", "/").lstrip("/")
            # The zip I hand you nests everything under "centurion/"; this install
            # IS the centurion dir, so strip that prefix to map files correctly.
            if n.startswith("centurion/"):
                n = n[len("centurion/"):]
            return n

        written, skipped = [], []
        for name in entries:
            rel = _rel(name)
            parts = rel.split("/")
            if (not rel or ".." in parts or rel.startswith("data/")
                    or rel.startswith(".git/") or parts[0] in ("data", ".git")):
                skipped.append(name)
                continue
            dest = (root / rel).resolve()
            if dest != root and not str(dest).startswith(str(root) + os.sep):
                skipped.append(name)  # path traversal attempt
                continue
            dest.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(name) as src:
                dest.write_bytes(src.read())
            written.append(rel)

        if written:
            import threading as _th

            def _restart():
                import time as _t2
                import os as _os2
                _t2.sleep(1.0)
                _os2._exit(0)  # runner loop relaunches python with the new code
            _th.Thread(target=_restart, daemon=True).start()
        return jsonify(ok=True, written=written, skipped=skipped,
                       restarting=bool(written))

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

    @app.get("/api/settings")
    def api_settings_get():
        import settings as S
        return jsonify(groups=S.status(orch().ledger))

    @app.post("/api/settings")
    def api_settings_set():
        if not authed():
            return jsonify(error="unauthorized"), 401
        import settings as S
        values = (request.get_json(silent=True) or {}).get("values", {})
        changed = S.apply(orch().ledger, values)
        return jsonify(ok=True, changed=changed)

    @app.post("/api/chat")
    def api_chat():
        import assistant
        msg = (request.get_json(silent=True) or {}).get("message", "")
        try:
            reply = assistant.answer(orch(), msg)
        except Exception as e:
            reply = f"(couldn't read state: {e})"
        return jsonify(reply=reply)

    @app.errorhandler(Exception)
    def on_error(e):
        # Surface the real cause as JSON instead of a blank 500 — helps debug
        # hosted deploys and lets the dashboard show what went wrong.
        import traceback
        from werkzeug.exceptions import HTTPException
        if isinstance(e, HTTPException):
            return e
        tb = "".join(traceback.format_exception(type(e), e, e.__traceback__))
        return jsonify(error=type(e).__name__, message=str(e),
                       path=request.path, trace=tb[-1800:]), 500

    @app.get("/product/<slug>")
    def product_landing(slug):
        p = orch().ledger.get_product(slug)
        if not p:
            return "Product not found", 404
        return (
            "<!doctype html><html><head><meta charset='utf-8'>"
            "<meta name='viewport' content='width=device-width, initial-scale=1'>"
            f"<title>{p['title']}</title>"
            "<style>body{font-family:system-ui,Arial,sans-serif;max-width:620px;margin:0 auto;"
            "padding:40px;line-height:1.6;color:#13202c;text-align:center}"
            ".buy{display:inline-block;margin-top:18px;background:#0b6;color:#fff;padding:14px 28px;"
            "border-radius:10px;text-decoration:none;font-weight:700;font-size:18px}"
            ".p{font-size:34px;font-weight:800;margin:8px 0}</style></head><body>"
            f"<h1>{p['title']}</h1>"
            "<p>A focused, ready-to-use digital toolkit. Instant download after purchase.</p>"
            f"<div class='p'>${p['price']:.0f}</div>"
            f"<a class='buy' href='{p['pay_url']}'>Buy now</a>"
            "</body></html>"
        )

    @app.get("/c/<slug>")
    def content_page(slug):
        o = orch()
        p = o.ledger.get_content_page(slug)
        if not p:
            return "Not found", 404
        o.ledger.incr_page_metric(slug, "views")
        f = Path(p["file"])
        return f.read_text(encoding="utf-8") if f.exists() else "Page missing", 404 if not f.exists() else 200

    @app.get("/go/<slug>")
    def go(slug):
        from flask import redirect
        o = orch()
        p = o.ledger.get_content_page(slug)
        if not p:
            return redirect("/")
        o.ledger.incr_page_metric(slug, "clicks")
        prod = o.ledger.get_product(p.get("product_slug", ""))
        return redirect(prod["pay_url"] if prod else f"/product/{p.get('product_slug','')}")

    @app.get("/sitemap.xml")
    def sitemap():
        o = orch()
        base = request.host_url.rstrip("/")
        urls = [f"{base}/product/{p['slug']}" for p in o.ledger.products()]
        urls += [f"{base}/c/{p['slug']}" for p in o.ledger.content_pages()]
        body = ("<?xml version='1.0' encoding='UTF-8'?>"
                "<urlset xmlns='http://www.sitemaps.org/schemas/sitemap/0.9'>"
                + "".join(f"<url><loc>{u}</loc></url>" for u in urls) + "</urlset>")
        return app.response_class(body, mimetype="application/xml")

    @app.get("/robots.txt")
    def robots():
        base = request.host_url.rstrip("/")
        return app.response_class(
            f"User-agent: *\nAllow: /\nSitemap: {base}/sitemap.xml\n", mimetype="text/plain")

    @app.get("/deliver/<token>")
    def deliver(token):
        p = orch().ledger.get_product_by_token(token)
        if not p:
            return "Invalid or expired delivery link.", 404
        f = Path(p["file"])
        if not f.exists():
            return "Product file missing.", 404
        return f.read_text(encoding="utf-8")

    @app.post("/webhook/stripe")
    def stripe_webhook():
        from integrations.stripe_webhook import verify_and_parse, handle_event
        try:
            event = verify_and_parse(request.data, request.headers.get("Stripe-Signature"),
                                     os.environ.get("STRIPE_WEBHOOK_SECRET"))
        except Exception as e:
            return jsonify(error=str(e)), 400
        res = handle_event(event, orch().ledger)
        # Ping your phone when real money lands.
        if res.handled and res.kind and "refund" not in res.kind and res.amount > 0:
            try:
                AlertClient().alert(f"Centurion: SALE +${res.amount:.2f} ({res.kind}).")
            except Exception:
                pass
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
