import pytest

from config import Config
from orchestrator import Orchestrator
from autodebug import AutoDebugger, ErrorLog, PerformanceMonitor


def make_config(tmp_path, **overrides):
    raw = {
        "funded_capital": 100.0, "target_capital": 1000.0,
        "autonomy_level": "full", "per_action_cap": 10.0, "per_strategy_cap": 30.0,
        "drawdown_floor": 0.20, "diversification_limit": 0.50,
        "anti_escalation": True, "reinvest_earnings": True,
        "max_spend_per_hour": 15.0, "max_spend_per_day": 40.0,
        "anomaly_error_threshold": 3, "database_path": str(tmp_path / "ad.db"),
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


def test_error_log_records_and_resolves(orch):
    log = ErrorLog(orch.ledger)
    try:
        raise ValueError("boom")
    except ValueError as e:
        eid = log.record("somewhere", e)
    assert log.unresolved_count() >= 1
    log.resolve(eid, "fixed")
    rec = log.recent(5)[0]
    assert rec["etype"] == "ValueError"
    assert rec["resolved"] == 1


def test_language_failure_falls_back_to_template(orch):
    dbg = orch.autodebugger
    err = ConnectionError("ollama connection refused")
    res = dbg.diagnose_and_heal(err)
    assert res.healed
    assert "template" in res.action
    assert orch.language.name == "template"


def test_strategy_fault_is_quarantined(orch):
    dbg = orch.autodebugger
    # craft an exception whose traceback mentions a strategy module
    try:
        from strategies import digital_products  # noqa
        raise RuntimeError("digital_products exploded")
    except RuntimeError as e:
        res = dbg.diagnose_and_heal(e)
    # message contains 'digital_products' so it should be quarantined
    assert "quarantine" in res.action
    assert "digital_products" not in orch.strategies


def test_health_check_passes_on_good_state(orch):
    assert orch.autodebugger.health_check() is True


def test_guarded_cycle_never_raises(orch, monkeypatch):
    # Force run_cycle to throw; the auto-debugger must swallow + heal/pause.
    def boom():
        raise RuntimeError("ollama down")
    monkeypatch.setattr(orch, "run_cycle", boom)
    result = orch.autodebugger.run_cycle()   # must not raise
    assert result is None
    # an error was logged
    assert orch.error_log.recent(1)[0]["etype"] == "RuntimeError"
    # a heal event recorded
    assert orch.error_log.heal_events(1)


def test_performance_monitor_disables_loser(orch):
    pm = PerformanceMonitor(orch, orch.error_log)
    # make a strategy clearly bleed capital
    orch.ledger.debit(10.0, strategy="content_affiliate", description="loss")
    notes = pm.evaluate_and_tune()
    assert any("content_affiliate" in n for n in notes)
    assert "content_affiliate" not in orch.strategies


def test_unrecovered_error_pauses_system(orch, monkeypatch):
    def boom():
        raise KeyError("totally unknown failure xyz")
    monkeypatch.setattr(orch, "run_cycle", boom)
    # KeyError is unclassified -> not healed -> system pauses, fail safe
    orch.autodebugger.run_cycle()
    assert orch.risk.is_paused()
