import yaml
import pytest

from orchestrator import Orchestrator
from config import load_config


def _write_cfg(tmp_path):
    cfg = {
        "funded_capital": 100.0, "target_capital": 1000.0, "ultimate_target": 0,
        "autonomy_level": "guarded", "guarded_auto_approve_cap": 5.0,
        "per_action_cap": 10.0, "per_strategy_cap": 30.0, "drawdown_floor": 0.20,
        "diversification_limit": 0.50, "anti_escalation": True,
        "reinvest_earnings": True, "max_spend_per_hour": 15.0,
        "max_spend_per_day": 40.0, "anomaly_error_threshold": 3,
        "require_organic_proof": False, "brand_human_gate": True,
        "focus_strategy": None, "language_provider": "template",
        "model_name": "test", "monthly_compute_budget": 20.0,
        "cycle_interval_minutes": 45, "decision_seed": 42,
        "database_path": str(tmp_path / "dash.db"),
        "strategies": {k: {"enabled": True} for k in
                       ["digital_products", "service_arbitrage", "print_on_demand",
                        "content_affiliate", "reselling_research"]},
    }
    p = tmp_path / "config.yaml"
    p.write_text(yaml.safe_dump(cfg))
    return str(p)


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("CENTURION_DASHBOARD_TOKEN", "tok123")
    cfg_path = _write_cfg(tmp_path)
    # seed + run a couple cycles so there's data
    o = Orchestrator(load_config(cfg_path))
    o.ledger.seed(100.0)
    for _ in range(8):
        o.run_cycle()
    from dashboard.app import create_app
    app = create_app(cfg_path)
    app.config.update(TESTING=True)
    return app.test_client()


def test_state_endpoint_shape(client):
    s = client.get("/api/state").get_json()
    for key in ["balance", "mode", "systemState", "strategies", "activity",
                "pending", "vel", "history", "system", "missionPct"]:
        assert key in s
    assert len(s["strategies"]) == 5
    assert s["vel"]["hourCap"] == 15.0


def test_control_requires_token(client):
    assert client.post("/api/control/pause", json={}).status_code == 401


def test_pause_resume_flow(client):
    assert client.post("/api/control/pause", json={"token": "tok123"}).status_code == 200
    assert client.get("/api/state").get_json()["systemState"] == "paused"
    assert client.post("/api/control/resume", json={"token": "tok123"}).status_code == 200
    assert client.get("/api/state").get_json()["systemState"] == "live"


def test_autonomy_change(client):
    r = client.post("/api/control/autonomy", json={"token": "tok123", "level": "review"})
    assert r.status_code == 200
    assert client.get("/api/state").get_json()["mode"] == "review"


def test_strategy_toggle(client):
    r = client.post("/api/control/strategy",
                    json={"token": "tok123", "name": "pod", "enabled": False})
    assert r.status_code == 200
    pod = [x for x in client.get("/api/state").get_json()["strategies"] if x["id"] == "pod"][0]
    assert pod["enabled"] is False


def test_fallback_html_when_no_build(client):
    # dist may or may not exist depending on whether the UI was built; either a
    # built app or the fallback page must return 200 at /.
    assert client.get("/").status_code == 200
