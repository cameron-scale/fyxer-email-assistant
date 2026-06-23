"""Print on Demand: generate design concepts and listings for a POD platform
with a real API. No inventory cost. Optional capped promotion.

If no POD API is configured, live execution surfaces the concept rather than
pretending it posted."""
from __future__ import annotations

from typing import List

from guardrails import Action
from intelligence.decision_core.scoring import Opportunity
from strategies.base import Strategy
from strategies.base import ExecutionResult


class PrintOnDemandStrategy(Strategy):
    name = "print_on_demand"
    base_conversion = 0.08
    typical_sale = 12.0

    def plan(self, opportunity: Opportunity) -> List[Action]:
        topic = opportunity.brief
        self.assets.design_prompt(topic)
        actions = [Action(
            strategy=self.name,
            description=f"Generate POD design concept + listing: {topic}",
            cost=0.0, reversible=True, legality="clear", tos_compliant=True,
            rationale="Zero inventory cost; create design + listing first.",
            meta={"phase": "build", "opp_type": opportunity.opp_type},
        )]
        if opportunity.est_capital > 0:
            actions.append(Action(
                strategy=self.name,
                description=f"Capped promo for POD listing: {topic}",
                cost=round(opportunity.est_capital, 2),
                reversible=False, legality="clear", tos_compliant=True,
                rationale="Small promotion within cap.",
                meta={"phase": "promote", "opp_type": opportunity.opp_type},
            ))
        return actions

    def _execute_live(self, action: Action, context: dict) -> ExecutionResult:
        if not context.get("pod_api_configured"):
            return ExecutionResult(False, detail="no POD API configured; surfacing concept")
        return ExecutionResult(False, detail="POD live execution not yet wired")
