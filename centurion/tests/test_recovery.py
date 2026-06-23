import pytest

from config import Config
from ledger import Ledger
from orchestrator import Orchestrator
from risk import RiskManager


def make_config(tmp_path, **overrides):
    raw = {
        "funded_capital": 100.0,
        "target_capital": 1000.0,
        "ultimate_target": 0,
        "autonomy_level": "full",
        "guarded_auto_approve_cap": 5.0,
        "per_action_cap": 10.0,
        "per_strategy_cap": 30.0,
        "drawdown_floor": 0.20,
        "diversification_limit": 0.50,
        "anti_escalation": True,
        "reinvest_earnings": True,
        "max_spend_per_hour": 15.0,
        "max_spend_per_day": 40.0,
        "anomaly_error_threshold": 3,
        "database_path": str(tmp_path / "rec.db"),
        "decision_seed": 42,
        "language_provider": "stub",
        "strategies": {k: {"enabled": True} for k in
                       ["digital_products", "service_arbitrage", "print_on_demand",
                        "content_affiliate", "reselling_research"]},
    }
    raw.update(overrides)
    return Config(raw=raw, root=tmp_path)


def test_recover_in_progress_already_applied_not_double_spent(tmp_path):
    o = Orchestrator(make_config(tmp_path))
    o.ledger.seed(100.0)
    # Simulate a crash AFTER the ledger effect was applied but before the action
    # was marked executed.
    idem = "crash-key-1"
    aid = o.ledger.record_action(strategy="digital_products", description="promo",
                                 cost=5.0, reversible=False, rationale="r",
                                 status="in_progress", idempotency_key=idem)
    o.ledger.debit(5.0, strategy="digital_products", description="promo (cost)",
                   external_ref=idem)
    balance_before = o.ledger.balance()
    assert balance_before == 95.0

    notes = o.recover()
    # action is reconciled to executed, NOT re-debited
    assert o.ledger.get_action(aid)["status"] == "executed"
    assert o.ledger.balance() == balance_before  # no double spend
    assert any("already applied" in n for n in notes)


def test_recover_in_progress_no_effect_marked_failed(tmp_path):
    o = Orchestrator(make_config(tmp_path))
    o.ledger.seed(100.0)
    idem = "crash-key-2"
    aid = o.ledger.record_action(strategy="digital_products", description="promo",
                                 cost=5.0, reversible=False, rationale="r",
                                 status="in_progress", idempotency_key=idem)
    # No transaction recorded -> crash happened before the spend.
    notes = o.recover()
    assert o.ledger.get_action(aid)["status"] == "failed"
    assert o.ledger.balance() == 100.0  # nothing spent
    assert any("no effect" in n for n in notes)


def test_velocity_caps_hold_across_cycles(tmp_path):
    # Tight daily cap; many cycles must never exceed it.
    o = Orchestrator(make_config(tmp_path, max_spend_per_day=12.0,
                                 max_spend_per_hour=12.0))
    o.ledger.seed(100.0)
    for _ in range(15):
        o.run_cycle()
    assert o.ledger.spend_since(86400) <= 12.0 + 1e-9


def test_capital_loss_never_exceeds_funded(tmp_path):
    # Drive many cycles; total realized loss can never exceed the funded seed.
    o = Orchestrator(make_config(tmp_path))
    o.ledger.seed(100.0)
    for _ in range(60):
        o.run_cycle()
    # Balance can never go below the floor (>=0 always; floor protects 20).
    assert o.ledger.balance() >= 0.0
    # Max loss from seed is bounded by funded capital.
    assert (100.0 - o.ledger.balance()) <= 100.0 + 1e-9
