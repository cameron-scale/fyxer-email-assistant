"""Approval queue — only used below full autonomy.

Queued requests are persisted as actions with status 'queued'. An operator
approves/rejects via CLI (and optionally SMS/email). At full autonomy this is
never exercised. Queuing NEVER overrides a guardrail rejection — only actions
that already passed the guardrails can be queued.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional

from guardrails import Action
from ledger import Ledger


@dataclass
class ApprovalRequest:
    action_id: int
    strategy: str
    description: str
    cost: float
    expected_return: float
    reversible: bool
    rationale: str


class ApprovalQueue:
    def __init__(self, ledger: Ledger):
        self.ledger = ledger

    def enqueue(self, action: Action, expected_return: float = 0.0) -> int:
        action_id = self.ledger.record_action(
            strategy=action.strategy, description=action.description,
            cost=action.cost, reversible=action.reversible,
            rationale=action.rationale, status="queued",
        )
        return action_id

    def pending(self) -> List[ApprovalRequest]:
        out = []
        for a in self.ledger.actions_by_status("queued"):
            out.append(ApprovalRequest(
                action_id=a["id"], strategy=a["strategy"] or "",
                description=a["description"] or "", cost=a["cost"],
                expected_return=0.0, reversible=bool(a["reversible"]),
                rationale=a["rationale"] or "",
            ))
        return out

    def approve(self, action_id: int) -> None:
        self.ledger.update_action_status(action_id, "approved")

    def reject(self, action_id: int) -> None:
        self.ledger.update_action_status(action_id, "rejected")

    def render(self, req: ApprovalRequest) -> str:
        return (f"[#{req.action_id}] {req.strategy}: {req.description}\n"
                f"   cost=${req.cost:.2f}  reversible={req.reversible}\n"
                f"   rationale: {req.rationale}")
