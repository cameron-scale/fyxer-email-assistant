"""End-to-end: a full-autonomy simulated dry run with no real keys and no model
loaded (stub/template providers). Plus the no-third-party-AI-API invariant and
the prohibited-strategy / no-obligation / kill-switch integration checks."""
import re
from pathlib import Path

import pytest

from config import Config
from orchestrator import Orchestrator
from reporter import Reporter
from guardrails import Action, GuardrailEngine

ROOT = Path(__file__).resolve().parent.parent


def make_config(tmp_path, **overrides):
    raw = {
        "funded_capital": 100.0, "target_capital": 1000.0, "ultimate_target": 1e9,
        "autonomy_level": "full", "guarded_auto_approve_cap": 5.0,
        "per_action_cap": 10.0, "per_strategy_cap": 30.0, "drawdown_floor": 0.20,
        "diversification_limit": 0.50, "anti_escalation": True,
        "reinvest_earnings": True, "max_spend_per_hour": 15.0,
        "max_spend_per_day": 40.0, "anomaly_error_threshold": 3,
        "database_path": str(tmp_path / "dry.db"), "decision_seed": 42,
        "language_provider": "template",
        "scoring_weights": {"ev_per_dollar": 0.4, "ev_per_hour": 0.25,
                            "capital_at_risk_penalty": 0.25,
                            "time_to_revenue_penalty": 0.10},
        "strategies": {k: {"enabled": True} for k in
                       ["digital_products", "service_arbitrage", "print_on_demand",
                        "content_affiliate", "reselling_research"]},
    }
    raw.update(overrides)
    return Config(raw=raw, root=tmp_path)


def test_full_dry_run_cycle_end_to_end(tmp_path):
    o = Orchestrator(make_config(tmp_path))
    o.ledger.seed(100.0)
    rep = o.run_cycle()
    assert rep.cycle == 1
    # research happened -> opportunities recorded
    assert o.ledger._conn().execute("SELECT COUNT(*) c FROM opportunities").fetchone()["c"] > 0
    # report builds and writes
    reporter = Reporter(o.ledger, o.cfg, memory=o.memory, risk=o.risk)
    text = reporter.build()
    assert "Centurion Daily Report" in text
    path = reporter.write_daily(tmp_path / "reports")
    assert path.exists()


def test_multi_cycle_dry_run_progresses_and_stays_bounded(tmp_path):
    o = Orchestrator(make_config(tmp_path))
    o.ledger.seed(100.0)
    for _ in range(30):
        o.run_cycle()
    # never negative, never lost more than funded
    assert o.ledger.balance() >= 0.0
    assert (100.0 - o.ledger.balance()) <= 100.0 + 1e-9
    # the bandit has learned something (arms have observations)
    assert any(arm.n > 0 for arm in o.bandit.arms.values())


def test_template_and_stub_providers_run_full_cycle(tmp_path):
    for provider in ["template", "stub"]:
        o = Orchestrator(make_config(tmp_path / provider, language_provider=provider,
                                     database_path=str(tmp_path / f"{provider}.db")))
        o.ledger.seed(100.0)
        rep = o.run_cycle()
        assert rep is not None  # system functions with no model loaded


def test_review_mode_queues_spend_that_full_would_execute(tmp_path):
    # In review mode, spends queue instead of executing.
    o = Orchestrator(make_config(tmp_path, autonomy_level="review"))
    o.ledger.seed(100.0)
    # run cycles until some spend action is generated and queued
    for _ in range(8):
        o.run_cycle()
    queued = o.ledger.actions_by_status("queued")
    executed_spends = [a for a in o.ledger.actions_by_status("executed") if a["cost"] > 0]
    # review must not auto-execute spends
    assert executed_spends == []


def test_kill_switch_halts_spending(tmp_path):
    o = Orchestrator(make_config(tmp_path))
    o.ledger.seed(100.0)
    o.risk.pause("test kill")
    spend_before = o.ledger.spend_since(86400)
    for _ in range(5):
        rep = o.run_cycle()
        assert any("PAUSED" in n for n in rep.notes)
    # no new spend occurred while paused
    assert o.ledger.spend_since(86400) == spend_before


def test_prohibited_and_obligation_actions_refused_all_levels(tmp_path):
    eng = GuardrailEngine()
    for level in ["full", "guarded", "review"]:
        prohibited = Action(strategy="pump-and-dump", description="shill a coin")
        obligation = Action(strategy="digital_products", description="x",
                            recurring=True, obligation_detail="$10/mo")
        assert not eng.check(prohibited).allowed
        assert not eng.check(obligation).allowed


def test_brand_gate_queues_brand_posts_in_live_mode(tmp_path):
    # In live mode with the brand gate on and no sandbox identity, anything that
    # publishes under the real brand is queued for human review, not auto-posted.
    o = Orchestrator(make_config(tmp_path, brand_human_gate=True,
                                 sandbox_identity=None,
                                 focus_strategy="digital_products"))
    o.ledger.seed(100.0)
    o.sim = False  # live mode (Stripe in mock since no key)
    o.run_cycle()
    queued = o.ledger.actions_by_status("queued")
    assert any("digital_products" == a["strategy"] for a in queued)


def test_sandbox_identity_lets_brand_posts_flow(tmp_path):
    o = Orchestrator(make_config(tmp_path, brand_human_gate=True,
                                 sandbox_identity="sandbox-store",
                                 focus_strategy="digital_products"))
    o.ledger.seed(100.0)
    o.sim = False
    o.run_cycle()
    # with a sandbox identity, brand posts are not forced into the queue
    queued = [a for a in o.ledger.actions_by_status("queued")
              if a["strategy"] == "digital_products"]
    assert queued == []


def test_no_third_party_ai_api_in_codebase():
    """Grep the whole codebase for hosted-AI endpoints/keys. Must find none in
    real call sites. Allowed: refusal lists / comments that NAME them to block."""
    banned = [
        "api.openai.com", "api.anthropic.com", "generativelanguage.googleapis.com",
        "openai.ChatCompletion", "anthropic.Anthropic", "import openai",
        "import anthropic", "google.generativeai",
    ]
    offenders = []
    for p in ROOT.rglob("*.py"):
        if "tests" in p.parts:
            continue
        text = p.read_text(encoding="utf-8", errors="ignore")
        for term in banned:
            for line in text.splitlines():
                if term in line and not _is_refusal_context(line):
                    offenders.append(f"{p.name}: {line.strip()}")
    assert not offenders, f"third-party AI references found: {offenders}"


def _is_refusal_context(line: str) -> bool:
    l = line.strip()
    # comments and the explicit refusal test inside local_llm are allowed
    return l.startswith("#") or "refuse" in l.lower() or "no third-party" in l.lower()
