import pytest

from economics import Economics, stripe_net
from calibration import CalibrationLog
from ledger import Ledger
from risk import RiskManager


def test_stripe_fee_eats_small_tickets():
    # $5 charge: 5 - (5*0.029 + 0.30) = 4.555
    assert stripe_net(5.0) == pytest.approx(4.555, abs=1e-3)
    # the fixed fee alone is 6% of a $5 sale
    assert (5.0 - stripe_net(5.0)) / 5.0 > 0.08


def test_economics_holds_when_margin_thin():
    e = Economics({"min_net_ev": 1.0, "min_margin": 0.5})
    # spend $5 to make $6 gross -> after fees ~5.53 net -> net EV ~0.53, fails
    v = e.evaluate(expected_gross_revenue=6.0, cost=5.0)
    assert not v.clears


def test_economics_clears_high_margin():
    e = Economics({"min_net_ev": 1.0, "min_margin": 0.5})
    v = e.evaluate(expected_gross_revenue=40.0, cost=5.0)
    assert v.clears
    assert v.net_ev > 1.0


def test_economics_zero_cost_play():
    e = Economics({"min_net_ev": 1.0})
    v = e.evaluate(expected_gross_revenue=20.0, cost=0.0)
    assert v.clears
    v2 = e.evaluate(expected_gross_revenue=0.5, cost=0.0)
    assert not v2.clears  # below min net EV after fee


def test_organic_proof_gate_blocks_then_allows(tmp_path):
    ledger = Ledger(tmp_path / "og.db")
    ledger.seed(100.0)
    rm = RiskManager(ledger, {"funded_capital": 100.0, "per_action_cap": 10.0,
                              "per_strategy_cap": 30.0, "drawdown_floor": 0.20,
                              "diversification_limit": 0.5, "max_spend_per_hour": 15,
                              "max_spend_per_day": 40, "require_organic_proof": True})
    # no organic revenue yet -> spend blocked
    d = rm.check_spend(2.0, "digital_products")
    assert not d.allowed and "organic" in d.reason
    # earn a real organic dollar
    ledger.credit(3.0, strategy="digital_products", description="stripe sale")
    assert rm.organic_dollar_proven()
    assert rm.check_spend(2.0, "digital_products").allowed


def test_calibration_detects_optimism(tmp_path):
    ledger = Ledger(tmp_path / "cal.db")
    ledger.seed(100.0)
    cal = CalibrationLog(ledger)
    for _ in range(6):
        cal.record("digital_products", predicted=20.0, realized=2.0)
    stats = cal.stats()
    assert stats.n == 6
    assert "OPTIMISTIC" in stats.verdict


def test_calibration_few_bets_verdict(tmp_path):
    ledger = Ledger(tmp_path / "cal2.db")
    ledger.seed(100.0)
    cal = CalibrationLog(ledger)
    cal.record("x", 5.0, 5.0)
    assert "too few" in cal.stats().verdict
