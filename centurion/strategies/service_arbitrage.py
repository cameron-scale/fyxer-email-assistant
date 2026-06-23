"""Productized Service Arbitrage: identify an in-demand service, produce the
deliverable with the Language Engine, fulfill small paid orders. Capital ~0;
upside is labor leverage."""
from __future__ import annotations

from typing import List

from guardrails import Action
from intelligence.decision_core.scoring import Opportunity
from strategies.base import Strategy


class ServiceArbitrageStrategy(Strategy):
    name = "service_arbitrage"
    base_conversion = 0.18      # service offers convert better but earn per-order
    typical_sale = 25.0

    def plan(self, opportunity: Opportunity) -> List[Action]:
        topic = opportunity.brief
        self.assets.service_offer(topic, self.name)
        # Pure labor leverage: building/listing the offer costs no capital.
        return [Action(
            strategy=self.name,
            description=f"Publish productized service offer & fulfill orders: {topic}",
            cost=0.0, reversible=True, legality="clear", tos_compliant=True,
            rationale="Near-zero capital; revenue from AI-assisted fulfillment.",
            meta={"phase": "promote", "opp_type": opportunity.opp_type},
        )]
