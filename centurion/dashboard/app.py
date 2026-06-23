"""Lightweight Flask dashboard — remote management and visibility.

Shows balance, progress to 10x (and the stretch target), uptime / last-cycle
time, recent actions and results, anything skipped, the learning log, and a
prominent remote PAUSE / KILL button plus the autonomy dial. Reachable remotely
since Centurion lives on a server / always-on PC, not the operator's laptop.

Mutating endpoints (pause/resume/autonomy) require a token from the
CENTURION_DASHBOARD_TOKEN env var, so the kill switch is safe to expose.
"""
from __future__ import annotations

import os
import time
from pathlib import Path

from flask import Flask, jsonify, redirect, request, url_for

# Allow running as `python dashboard/app.py` or `flask --app dashboard.app`.
import sys
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from config import load_config
from orchestrator import Orchestrator
from reporter import Reporter
from supervisor import Supervisor


def create_app(config_path: str | None = None) -> Flask:
    app = Flask(__name__)
    cfg = load_config(config_path)
    token = os.environ.get("CENTURION_DASHBOARD_TOKEN", "change-me")

    def orch() -> Orchestrator:
        return Orchestrator(cfg)

    def authed() -> bool:
        supplied = request.args.get("token") or request.form.get("token") \
            or request.headers.get("X-Centurion-Token")
        return supplied == token

    @app.route("/")
    def index():
        o = orch()
        rep = Reporter(o.ledger, o.cfg, memory=o.memory, risk=o.risk)
        sup = Supervisor(o.ledger, o.cfg)
        stats = rep.growth_stats()
        balance = o.ledger.balance()
        target = float(o.cfg.get("target_capital", 1000.0))
        pct = min(balance / target * 100, 100) if target else 0
        actions = o.ledger.actions(25)
        rejected = o.ledger.actions_by_status("rejected")[-10:]
        lessons = o.memory.relevant(limit=8)
        hb_age = sup.heartbeat_age()
        errors = o.error_log.recent(12)
        heals = o.error_log.heal_events(12)
        return _render(balance, target, pct, o, rep, stats, actions, rejected,
                       lessons, hb_age, token, errors, heals)

    @app.route("/api/status")
    def api_status():
        o = orch()
        rep = Reporter(o.ledger, o.cfg, memory=o.memory, risk=o.risk)
        return jsonify({
            "balance": o.ledger.balance(),
            "funded": o.risk.funded_capital(),
            "target": float(o.cfg.get("target_capital", 1000.0)),
            "ultimate_target": float(o.cfg.get("ultimate_target", 0) or 0),
            "milestone": rep.milestone(),
            "paused": o.risk.is_paused(),
            "pause_reason": o.risk.pause_reason(),
            "autonomy": o.autonomy.level.value,
            "per_action_cap": o.risk.effective_per_action_cap(),
            "floor": o.risk.floor_amount(),
            "cycles": o.cycle_count,
            "provider": o.language.name,
            "growth": rep.growth_stats(),
            "learning": o.memory.summary(),
        })

    @app.route("/pause", methods=["POST"])
    def pause():
        if not authed():
            return "unauthorized", 401
        orch().risk.pause(request.form.get("reason", "dashboard kill switch"))
        return redirect(url_for("index", token=request.form.get("token")))

    @app.route("/resume", methods=["POST"])
    def resume():
        if not authed():
            return "unauthorized", 401
        orch().risk.resume()
        return redirect(url_for("index", token=request.form.get("token")))

    @app.route("/autonomy", methods=["POST"])
    def autonomy():
        if not authed():
            return "unauthorized", 401
        level = request.form.get("level", "full")
        o = orch()
        o.autonomy.set_level(level)
        o.ledger.set_state("autonomy_level", level)
        return redirect(url_for("index", token=request.form.get("token")))

    return app


def _render(balance, target, pct, o, rep, stats, actions, rejected, lessons,
            hb_age, token, errors=None, heals=None) -> str:
    errors = errors or []
    heals = heals or []
    paused = o.risk.is_paused()
    status_color = "#c0392b" if paused else "#27ae60"
    status_text = f"PAUSED — {o.risk.pause_reason()}" if paused else "RUNNING"
    eta = stats.get("eta_days_to_target")
    eta_txt = f"~{eta} days to 10x (projection)" if eta else "trajectory still forming"
    rows = "".join(
        f"<tr><td>{a['id']}</td><td>{a['strategy'] or ''}</td>"
        f"<td>{a['description']}</td><td>{a['status']}</td>"
        f"<td>${a['cost']:.2f}</td></tr>" for a in actions)
    rej = "".join(f"<li>[{a['strategy']}] {a['description']} — {a['rationale']}</li>"
                  for a in rejected) or "<li>None.</li>"
    les = "".join(f"<li>({l['kind']}) {l['lesson']}</li>" for l in lessons) or "<li>None yet.</li>"
    err_rows = "".join(
        f"<tr><td>{'✅' if e['resolved'] else '⚠️'}</td><td>{e['etype']}</td>"
        f"<td>{(e['message'] or '')[:80]}</td><td>{e['resolution'] or '—'}</td></tr>"
        for e in errors) or "<tr><td colspan=4>No errors logged.</td></tr>"
    heal_rows = "".join(
        f"<li>{h['trigger']} → <b>{h['action']}</b> ({h['outcome']})</li>"
        for h in heals) or "<li>No self-heal events.</li>"
    return f"""<!doctype html><html><head><meta charset='utf-8'>
<title>Centurion</title><meta http-equiv='refresh' content='30'>
<style>
 body{{font-family:system-ui,Arial,sans-serif;margin:0;background:#0f1115;color:#e6e6e6}}
 .wrap{{max-width:980px;margin:0 auto;padding:24px}}
 .card{{background:#1a1d24;border-radius:12px;padding:20px;margin-bottom:18px}}
 .big{{font-size:42px;font-weight:700}}
 .bar{{height:18px;background:#2a2f3a;border-radius:9px;overflow:hidden}}
 .fill{{height:100%;background:#27ae60;width:{pct:.1f}%}}
 .status{{display:inline-block;padding:6px 14px;border-radius:20px;color:#fff;
   background:{status_color};font-weight:600}}
 table{{width:100%;border-collapse:collapse;font-size:14px}}
 td,th{{text-align:left;padding:6px;border-bottom:1px solid #2a2f3a}}
 button{{padding:10px 16px;border:0;border-radius:8px;color:#fff;font-weight:600;
   cursor:pointer}}
 .kill{{background:#c0392b}} .go{{background:#27ae60}} .dial{{background:#2c3e50}}
 input,select{{padding:8px;border-radius:6px;border:1px solid #2a2f3a;background:#0f1115;
   color:#e6e6e6}}
 .muted{{color:#8a8f98}}
</style></head><body><div class='wrap'>
 <div class='card'>
  <span class='status'>{status_text}</span>
  <span class='muted' style='float:right'>autonomy: {o.autonomy.level.value}
   · provider: {o.language.name} · cycles: {o.cycle_count}
   · heartbeat {hb_age/60:.0f}m ago</span>
  <div class='big'>${balance:,.2f}</div>
  <div class='muted'>{rep.milestone()} · {pct:.1f}% to 10x (${target:,.0f}) · {eta_txt}</div>
  <div class='bar'><div class='fill'></div></div>
  <p class='muted'>Loss floor: balance protected at ${o.risk.floor_amount():,.2f} ·
   per-action cap now ${o.risk.effective_per_action_cap():,.2f} ·
   max loss can never exceed the funded ${o.risk.funded_capital():,.0f}.</p>
 </div>

 <div class='card'>
  <h3>Controls</h3>
  <form method='post' action='/pause' style='display:inline'>
   <input type='hidden' name='token' value='{token}'>
   <button class='kill'>⏸ PAUSE / KILL</button></form>
  <form method='post' action='/resume' style='display:inline'>
   <input type='hidden' name='token' value='{token}'>
   <button class='go'>▶ Resume</button></form>
  <form method='post' action='/autonomy' style='display:inline;margin-left:12px'>
   <input type='hidden' name='token' value='{token}'>
   <select name='level'>
     <option value='full'>full</option>
     <option value='guarded'>guarded</option>
     <option value='review'>review</option>
   </select>
   <button class='dial'>Set autonomy</button></form>
  <p class='muted'>Token-protected. Pause takes effect within one cycle, and
   immediately for in-flight spend decisions.</p>
 </div>

 <div class='card'><h3>Recent activity</h3>
  <table><tr><th>#</th><th>strategy</th><th>action</th><th>status</th><th>cost</th></tr>
  {rows}</table></div>

 <div class='card'><h3>Skipped / rejected by guardrails</h3><ul>{rej}</ul></div>
 <div class='card'><h3>What it's learning</h3><ul>{les}</ul></div>
 <div class='card'><h3>Live error log <span class='muted'>(auto-debugger)</span></h3>
  <table><tr><th></th><th>type</th><th>message</th><th>resolution</th></tr>
  {err_rows}</table></div>
 <div class='card'><h3>Self-heal events</h3><ul>{heal_rows}</ul></div>
</div></body></html>"""


app = create_app()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    app.run(host="0.0.0.0", port=port)
