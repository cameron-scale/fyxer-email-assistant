import pytest
from config import Config
from orchestrator import Orchestrator


def cfg(tmp_path, **ov):
    raw = {"funded_capital": 10.0, "target_capital": 1000.0, "autonomy_level": "guarded",
           "per_action_cap": 10.0, "per_strategy_cap": 30.0, "drawdown_floor": 0.20,
           "diversification_limit": 0.5, "reinvest_earnings": True, "max_spend_per_hour": 15.0,
           "max_spend_per_day": 40.0, "anomaly_error_threshold": 3,
           "database_path": str(tmp_path / "ls.db"), "language_provider": "template",
           "strategies": {k: {"enabled": True} for k in
                          ["digital_products", "service_arbitrage", "print_on_demand",
                           "content_affiliate", "reselling_research"]}}
    raw.update(ov)
    return Config(raw=raw, root=tmp_path)


def test_live_spend_blocked_until_armed(tmp_path):
    o = Orchestrator(cfg(tmp_path)); o.ledger.seed(10.0)
    o.sim = False  # live mode -> risk.live_mode True
    assert o.risk.live_mode is True
    # danger switch off by default -> spend blocked
    assert not o.risk.check_spend(2.0, "digital_products").allowed
    assert "danger switch" in o.risk.check_spend(2.0, "digital_products").reason
    # arm it -> spend allowed (within caps)
    o.ledger.set_state("live_spend_enabled", "1")
    assert o.risk.check_spend(2.0, "digital_products").allowed
    # disarm -> blocked again
    o.ledger.set_state("live_spend_enabled", "0")
    assert not o.risk.check_spend(2.0, "digital_products").allowed


def test_sim_mode_not_gated_by_switch(tmp_path):
    o = Orchestrator(cfg(tmp_path)); o.ledger.seed(10.0)
    o.sim = True  # simulation -> switch does not gate fake spends
    assert o.risk.live_mode is False
    assert o.risk.check_spend(2.0, "digital_products").allowed
