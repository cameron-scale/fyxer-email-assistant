import pytest

import preflight
from config import Config
from orchestrator import Orchestrator


def make_config(tmp_path, **overrides):
    raw = {
        "funded_capital": 100.0, "target_capital": 1000.0,
        "autonomy_level": "full", "per_action_cap": 10.0, "per_strategy_cap": 30.0,
        "drawdown_floor": 0.20, "diversification_limit": 0.50, "anti_escalation": True,
        "reinvest_earnings": True, "max_spend_per_hour": 15.0, "max_spend_per_day": 40.0,
        "anomaly_error_threshold": 3, "database_path": str(tmp_path / "pf.db"),
        "decision_seed": 42, "language_provider": "template",
        "strategies": {k: {"enabled": True} for k in
                       ["digital_products", "service_arbitrage", "print_on_demand",
                        "content_affiliate", "reselling_research"]},
    }
    raw.update(overrides)
    return Config(raw=raw, root=tmp_path)


@pytest.fixture
def orch(tmp_path):
    o = Orchestrator(make_config(tmp_path))
    o.ledger.seed(100.0)
    return o


def test_dry_run_checks_pass(orch):
    checks = preflight.run_checks(orch.config, orch.ledger, orch.risk, orch.language,
                                  live=False)
    assert preflight.is_go(checks)


def test_live_blocks_without_stripe_or_card(orch, monkeypatch):
    monkeypatch.delenv("STRIPE_API_KEY", raising=False)
    checks = preflight.run_checks(orch.config, orch.ledger, orch.risk, orch.language,
                                  live=True)
    # missing Stripe key and unacknowledged card are critical -> not go
    assert not preflight.is_go(checks)
    names = {c.name for c in checks if c.critical and not c.ok}
    assert "Stripe API key" in names
    assert "funded-card cap acknowledged" in names


def test_live_go_when_requirements_met(orch, monkeypatch):
    monkeypatch.setenv("STRIPE_API_KEY", "sk_test_123")
    orch.ledger.set_state("funded_card_ack", "1")
    checks = preflight.run_checks(orch.config, orch.ledger, orch.risk, orch.language,
                                  live=True)
    assert preflight.is_go(checks), preflight.report(checks)


def test_report_renders(orch):
    checks = preflight.run_checks(orch.config, orch.ledger, orch.risk, orch.language,
                                  live=False)
    text = preflight.report(checks)
    assert "Centurion preflight" in text
    assert "READY" in text
