"""Autonomy Controller: the dial.

Decides whether a guardrail-and-capital-cleared action executes immediately or
is held for approval. The dial only ever ADDS friction — it can never loosen
the hard guardrails, which apply identically at every level.

  full    -> everything that passed checks executes immediately
  guarded -> spends <= cap execute; larger spends queue; non-spend runs free
  review  -> every spend and every external action queues
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Optional

from guardrails import Action


class AutonomyLevel(str, Enum):
    FULL = "full"
    GUARDED = "guarded"
    REVIEW = "review"


@dataclass
class AutonomyDecision:
    execute_now: bool
    reason: str


class AutonomyController:
    def __init__(self, level: str = "full", guarded_auto_approve_cap: float = 5.0):
        self.level = AutonomyLevel(level)
        self.guarded_cap = float(guarded_auto_approve_cap)

    def set_level(self, level: str) -> None:
        self.level = AutonomyLevel(level)

    def decide(self, action: Action) -> AutonomyDecision:
        is_spend = action.cost > 0
        is_external = bool(action.meta.get("external")) or is_spend

        if self.level == AutonomyLevel.FULL:
            return AutonomyDecision(True, "full autonomy: execute immediately")

        if self.level == AutonomyLevel.GUARDED:
            if not is_spend:
                return AutonomyDecision(True, "guarded: non-spend action runs free")
            if action.cost <= self.guarded_cap:
                return AutonomyDecision(True,
                                        f"guarded: spend {action.cost:.2f} <= "
                                        f"cap {self.guarded_cap:.2f}")
            return AutonomyDecision(False,
                                    f"guarded: spend {action.cost:.2f} exceeds cap "
                                    f"{self.guarded_cap:.2f} -> queue")

        # REVIEW
        if is_spend or is_external:
            return AutonomyDecision(False, "review: spend/external action -> queue")
        return AutonomyDecision(True, "review: internal non-spend action runs")
