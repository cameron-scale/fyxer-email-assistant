"""Constrained capital allocator.

Maximizes expected return subject to the hard ceiling, per-action caps,
per-strategy caps, a diversification limit, and remaining velocity headroom.
Deterministic greedy: sort candidates by expected-return-per-dollar and fill
under all constraints. Simple, auditable, and provably cap-respecting.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional


@dataclass
class AllocationRequest:
    id: str
    strategy: str
    requested_capital: float
    expected_return: float
    score: float = 0.0


@dataclass
class AllocationCaps:
    available_capital: float          # current spendable balance
    per_action_cap: float             # effective (anti-escalation) per-spend cap
    per_strategy_cap: float           # cumulative cap per strategy
    diversification_cap: float        # max capital on any single strategy
    hourly_remaining: float           # remaining hourly velocity headroom
    daily_remaining: float            # remaining daily velocity headroom
    floor_amount: float = 0.0         # may not spend below this balance
    already_spent: Dict[str, float] = field(default_factory=dict)


@dataclass
class Allocation:
    id: str
    strategy: str
    amount: float
    expected_return: float


class Allocator:
    def allocate(self, requests: List[AllocationRequest],
                 caps: AllocationCaps) -> List[Allocation]:
        # Greedy by expected return per dollar (efficiency), then raw score.
        def efficiency(r: AllocationRequest) -> float:
            denom = r.requested_capital if r.requested_capital > 0 else 1e-9
            return (r.expected_return / denom, r.score)

        ordered = sorted(requests, key=efficiency, reverse=True)

        spendable = max(0.0, caps.available_capital - caps.floor_amount)
        spendable = min(spendable, caps.hourly_remaining, caps.daily_remaining)
        strategy_spent = dict(caps.already_spent)
        allocations: List[Allocation] = []

        for r in ordered:
            if spendable <= 1e-9:
                break
            want = max(0.0, r.requested_capital)
            if want <= 0:
                # zero-capital opportunity (pure labor) — always allowable
                allocations.append(Allocation(r.id, r.strategy, 0.0, r.expected_return))
                continue

            prior = strategy_spent.get(r.strategy, 0.0)
            strat_headroom = min(
                caps.per_strategy_cap - prior,
                caps.diversification_cap - prior,
            )
            amount = min(want, caps.per_action_cap, strat_headroom, spendable)
            if amount <= 1e-9:
                continue

            allocations.append(Allocation(r.id, r.strategy, round(amount, 2),
                                          r.expected_return))
            spendable -= amount
            strategy_spent[r.strategy] = prior + amount

        return allocations
