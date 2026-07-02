import pytest

from ledger import Ledger, InsufficientCapital, SEED_DESCRIPTION


@pytest.fixture
def ledger(tmp_path):
    return Ledger(tmp_path / "test.db")


def test_seed_creates_single_credit(ledger):
    bal = ledger.seed(100.0)
    assert bal == 100.0
    txns = ledger.transactions()
    assert len(txns) == 1
    assert txns[0]["type"] == "credit"
    assert txns[0]["description"] == SEED_DESCRIPTION
    assert ledger.funded_capital() == 100.0


def test_cannot_seed_twice(ledger):
    ledger.seed(100.0)
    with pytest.raises(RuntimeError):
        ledger.seed(100.0)


def test_reset_seed_on_fresh_ledger(ledger):
    ledger.seed(100.0)
    bal = ledger.reset_seed(10.0)
    assert bal == 10.0
    assert ledger.balance() == 10.0
    assert ledger.funded_capital() == 10.0
    txns = ledger.transactions()
    assert len(txns) == 1
    assert txns[0]["description"] == SEED_DESCRIPTION


def test_reset_seed_refuses_after_activity(ledger):
    ledger.seed(100.0)
    ledger.debit(5.0, strategy="x", description="ad spend")
    with pytest.raises(RuntimeError):
        ledger.reset_seed(10.0)
    assert ledger.balance() == 95.0


def test_set_funded_capital_keeps_history(ledger):
    ledger.seed(100.0)
    ledger.debit(5.0, strategy="x", description="ad spend")
    ledger.set_funded_capital(25.0)
    assert ledger.funded_capital() == 25.0
    assert ledger.balance() == 95.0


def test_credit_and_debit_update_balance(ledger):
    ledger.seed(100.0)
    assert ledger.debit(30.0, strategy="x", description="ad spend") == 70.0
    assert ledger.credit(50.0, strategy="x", description="sale") == 120.0
    assert ledger.balance() == 120.0


def test_debit_cannot_go_negative(ledger):
    ledger.seed(100.0)
    with pytest.raises(InsufficientCapital):
        ledger.debit(100.01)
    # balance unchanged
    assert ledger.balance() == 100.0


def test_balance_to_zero_then_blocked(ledger):
    ledger.seed(100.0)
    ledger.debit(100.0)
    assert ledger.balance() == 0.0
    with pytest.raises(InsufficientCapital):
        ledger.debit(0.01)


def test_spend_since_tracks_debits_and_fees(ledger):
    ledger.seed(100.0)
    ledger.debit(10.0, kind="debit")
    ledger.debit(2.0, kind="fee")
    ledger.credit(5.0)  # credits don't count as spend
    assert ledger.spend_since(3600) == 12.0


def test_strategy_spend(ledger):
    ledger.seed(100.0)
    ledger.debit(10.0, strategy="a")
    ledger.debit(5.0, strategy="b")
    ledger.debit(3.0, strategy="a")
    assert ledger.strategy_spend("a") == 13.0
    assert ledger.strategy_spend("b") == 5.0


def test_action_state_machine(ledger):
    ledger.seed(100.0)
    aid = ledger.record_action(strategy="a", description="buy", cost=5.0,
                               reversible=False, rationale="why", status="planned",
                               idempotency_key="k1")
    assert ledger.get_action(aid)["status"] == "planned"
    ledger.update_action_status(aid, "in_progress")
    assert ledger.get_action(aid)["status"] == "in_progress"
    ledger.update_action_status(aid, "executed", external_ref="ext_1")
    a = ledger.get_action(aid)
    assert a["status"] == "executed"
    assert a["external_ref"] == "ext_1"


def test_state_get_set(ledger):
    ledger.set_state("autonomy_level", "full")
    assert ledger.get_state("autonomy_level") == "full"
    assert ledger.get_state("missing", "default") == "default"
