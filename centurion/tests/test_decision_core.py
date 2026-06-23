import pytest

from intelligence.decision_core.bandit import ThompsonBandit
from intelligence.decision_core.scoring import Opportunity, ScoringModel
from intelligence.decision_core.allocator import (Allocator, AllocationCaps,
                                                  AllocationRequest)


# --- bandit ---
def test_bandit_deterministic_with_seed():
    b1 = ThompsonBandit(seed=7)
    b2 = ThompsonBandit(seed=7)
    for name in ["a", "b", "c"]:
        b1.ensure_arm(name); b2.ensure_arm(name)
    s1 = [b1.select(["a", "b", "c"]) for _ in range(20)]
    s2 = [b2.select(["a", "b", "c"]) for _ in range(20)]
    assert s1 == s2


def test_bandit_learns_from_realized_returns():
    b = ThompsonBandit(seed=1)
    # arm 'win' consistently returns +10, arm 'lose' returns -5
    for _ in range(40):
        b.update("win", 10.0)
        b.update("lose", -5.0)
    picks = [b.select(["win", "lose"]) for _ in range(50)]
    assert picks.count("win") > picks.count("lose")
    assert b.select(["win", "lose"]) == "win"


def test_bandit_persistence_roundtrip():
    b = ThompsonBandit(seed=3)
    for _ in range(5):
        b.update("x", 2.0)
    blob = b.to_json()
    b2 = ThompsonBandit.from_json(blob)
    assert b2.arms["x"].n == 5
    assert b2.arms["x"].mean == pytest.approx(2.0)


# --- scoring ---
def test_scoring_prefers_high_ev_low_risk():
    s = ScoringModel()
    good = Opportunity("digital_products", "good", est_return=80, est_capital=2,
                       est_build_hours=1, time_to_revenue_days=1)
    bad = Opportunity("digital_products", "bad", est_return=20, est_capital=40,
                      est_build_hours=8, time_to_revenue_days=12)
    assert s.score(good, 100) > s.score(bad, 100)


def test_scoring_deterministic():
    s = ScoringModel()
    o = Opportunity("x", "b", 50, 5, 2, 3)
    assert s.score(o, 100) == s.score(o, 100)


# --- allocator ---
def test_allocator_respects_all_caps():
    a = Allocator()
    reqs = [
        AllocationRequest("s1", "s1", requested_capital=50, expected_return=100, score=0.9),
        AllocationRequest("s2", "s2", requested_capital=50, expected_return=80, score=0.8),
    ]
    caps = AllocationCaps(available_capital=100, per_action_cap=10,
                          per_strategy_cap=30, diversification_cap=50,
                          hourly_remaining=15, daily_remaining=40, floor_amount=20)
    allocs = a.allocate(reqs, caps)
    total = sum(x.amount for x in allocs)
    # bounded by hourly_remaining (15) and per_action_cap (10 each)
    assert total <= 15 + 1e-9
    for x in allocs:
        assert x.amount <= 10 + 1e-9


def test_allocator_never_exceeds_available_minus_floor():
    a = Allocator()
    reqs = [AllocationRequest("s1", "s1", 100, 200, 1.0)]
    caps = AllocationCaps(available_capital=30, per_action_cap=100,
                          per_strategy_cap=100, diversification_cap=100,
                          hourly_remaining=100, daily_remaining=100, floor_amount=20)
    allocs = a.allocate(reqs, caps)
    # spendable = 30 - 20 = 10
    assert sum(x.amount for x in allocs) <= 10 + 1e-9


def test_allocator_zero_capital_opportunity_allowed():
    a = Allocator()
    reqs = [AllocationRequest("svc", "service_arbitrage", 0.0, 25.0, 0.9)]
    caps = AllocationCaps(available_capital=100, per_action_cap=10,
                          per_strategy_cap=30, diversification_cap=50,
                          hourly_remaining=15, daily_remaining=40, floor_amount=20)
    allocs = a.allocate(reqs, caps)
    assert len(allocs) == 1
    assert allocs[0].amount == 0.0
