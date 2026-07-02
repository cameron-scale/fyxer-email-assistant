"""Curated Reselling and Arbitrage: research under-priced-to-fair-priced
opportunities on legitimate marketplaces that expose a real API and a funded
payment method set up at onboarding.

If a marketplace has no API and would require the operator's manual action, the
agent SURFACES the candidate instead of pretending it can act. No scraping
behind auth, ever (the Guardrail Engine blocks it regardless)."""
from __future__ import annotations

from typing import List

from guardrails import Action
from intelligence.decision_core.scoring import Opportunity
from strategies.base import Strategy, ExecutionResult


class ResellingResearchStrategy(Strategy):
    name = "reselling_research"
    base_conversion = 0.10
    typical_sale = 22.0

    def plan(self, opportunity: Opportunity) -> List[Action]:
        topic = opportunity.brief
        actions = [Action(
            strategy=self.name,
            description=f"Research arbitrage candidate on API-backed marketplace: {topic}",
            cost=0.0, reversible=True, legality="clear", tos_compliant=True,
            rationale="Identify under-priced-to-fair-priced spread; no auth scraping.",
            meta={"phase": "build", "opp_type": opportunity.opp_type},
        )]
        if opportunity.est_capital > 0:
            actions.append(Action(
                strategy=self.name,
                description=f"Buy candidate within cap (API marketplace only): {topic}",
                cost=round(opportunity.est_capital, 2),
                reversible=True, legality="clear", tos_compliant=True,
                rationale="Transact autonomously only where a real API + funded method exist.",
                meta={"phase": "promote", "opp_type": opportunity.opp_type,
                      "requires_api": True},
            ))
        return actions

    def _execute_live(self, action: Action, context: dict) -> ExecutionResult:
        if action.meta.get("requires_api") and not context.get("marketplace_api_configured"):
            # No API -> surface for the operator instead of acting.
            return ExecutionResult(False,
                                   detail="no marketplace API; surfacing candidate for operator")
        return ExecutionResult(False, detail="marketplace live execution not yet wired")
