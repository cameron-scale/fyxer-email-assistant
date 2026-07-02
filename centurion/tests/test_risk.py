import pytest

from ledger import Ledger
from risk import RiskManager

BASE_CFG = {
    "funded_capital": 100.0,
    "per_action_cap": 10.0,
    "per_strategy_cap": 30.0,
    "drawdown_floor": 0.20,
    "diversification_limit": 0.50,
    "anti_escalation": True,
    "max_spend_per_hour": 15.0,
    "max_spend_per_day": 40.0,
    "anomaly_error_threshold": 3,
}


@pytest.fixture
def rm(tmp_path):
    ledger = Ledger(tmp_path / "risk.db")
    ledger.seed(100.0)
    return RiskManager(ledger, dict(BASE_CFG))


def test_allows_normal_spend(rm):
    d = rm.check_spend(5.0, strategy="digital_products")
    assert d.allowed, d.reason


def test_capital_ceiling_blocks_overspend(rm):
    # per-action cap (10) is hit first, but ceiling also holds for big asks
    d = rm.check_spend(150.0)
    assert not d.allowed


def test_per_action_cap_blocks(rm):
    d = rm.check_spend(10.01)
    assert not d.allowed
    assert "per-action cap" in d.reason


def test_balance_zero_halts_spending(rm):
    # drive balance down to the floor via debits, then any spend is blocked
    rm.ledger.debit(80.0)  # balance now 20 == floor
    assert rm.capital_exhausted()
    d = rm.check_spend(1.0)
    assert not d.allowed


def test_anti_escalation_cap_never_rises(tmp_path):
    """The core ethos test: as drawdown deepens, the per-action cap shrinks and
    never grows. An oversized catch-up bet is blocked by construction.

    Velocity/strategy caps are loosened here so we isolate the per-action cap;
    those caps are exercised in their own tests above.
    """
    cfg = dict(BASE_CFG, max_spend_per_hour=1000.0, max_spend_per_day=1000.0,
               per_strategy_cap=1000.0, diversification_limit=1.0)
    ledger = Ledger(tmp_path / "esc.db")
    ledger.seed(100.0)
    rm = RiskManager(ledger, cfg)

    full_cap = rm.effective_per_action_cap()
    assert full_cap == pytest.approx(10.0)

    # Simulate a loss: balance falls to 50 (50% drawdown).
    rm.ledger.debit(50.0)
    drawdown_cap = rm.effective_per_action_cap()
    assert drawdown_cap == pytest.approx(5.0)        # tightened, did not rise
    assert drawdown_cap < full_cap

    # A "catch-up" bet at the original cap is now rejected.
    d = rm.check_spend(10.0)
    assert not d.allowed

    # Even a bet equal to the OLD cap is blocked; only the tightened cap clears.
    assert rm.check_spend(5.0).allowed
    assert not rm.check_spend(6.0).allowed


def test_reinvestment_scales_cap_with_profit(rm):
    # Default mode: reinvest earnings. The per-action cap is a fixed 10% of the
    # CURRENT balance, so genuine profit compounds into larger deployments while
    # the *fraction* (discipline) is unchanged — this is not escalation.
    rm.ledger.credit(900.0)  # balance now 1000, a 10x
    cap = rm.effective_per_action_cap()
    assert cap == pytest.approx(100.0)  # 10% of 1000
    # The fraction is constant: 10% at $100 and 10% at $1000.
    assert rm.per_action_cap / rm.funded_capital() == pytest.approx(0.10)


def test_conservative_mode_clamps_cap_on_profit(tmp_path):
    ledger = Ledger(tmp_path / "cons.db")
    ledger.seed(100.0)
    rm = RiskManager(ledger, dict(BASE_CFG, reinvest_earnings=False))
    ledger.credit(900.0)  # balance 1000
    assert rm.effective_per_action_cap() == pytest.approx(10.0)  # clamped at base


def test_loss_floor_pinned_to_seed_after_profit(rm):
    rm.ledger.credit(900.0)  # balance 1000 after big profit
    # The loss floor stays pinned to the funded seed (0.20 * 100 = 20),
    # so total loss can never exceed the funded amount even after profits.
    assert rm.floor_amount() == pytest.approx(20.0)


def test_drawdown_floor_blocks(rm):
    # balance 100, floor 20. A spend that lands below floor is blocked.
    d = rm.check_spend(85.0)  # would leave 15 < 20
    assert not d.allowed
    assert "floor" in d.reason


def test_per_strategy_cap(rm):
    rm.ledger.debit(28.0, strategy="s")
    d = rm.check_spend(3.0, strategy="s")  # would total 31 > 30
    assert not d.allowed
    assert "per-strategy" in d.reason


def test_velocity_hourly_cap(rm):
    rm.ledger.debit(9.0)
    rm.ledger.debit(5.0)  # 14 spent this hour
    d = rm.check_spend(2.0)  # 16 > 15
    assert not d.allowed
    assert "hourly" in d.reason


def test_kill_switch_blocks_everything(rm):
    rm.pause("operator")
    assert rm.is_paused()
    d = rm.check_spend(1.0)
    assert not d.allowed
    assert "paused" in d.reason
    rm.resume()
    assert not rm.is_paused()
    assert rm.check_spend(1.0).allowed


def test_anomaly_auto_pause(rm):
    assert not rm.record_error()  # 1
    assert not rm.record_error()  # 2
    assert rm.record_error()      # 3 -> auto-pause
    assert rm.is_paused()
    rm.resume()
    assert rm.anomaly_count() == 0


def test_record_success_resets_anomaly(rm):
    rm.record_error()
    rm.record_error()
    rm.record_success()
    assert rm.anomaly_count() == 0
