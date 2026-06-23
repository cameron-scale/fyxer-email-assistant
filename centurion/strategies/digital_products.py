"""Digital Products: research a niche, generate a small digital product, build a
landing page, list it, collect via Stripe. Optional capped paid promotion."""
from __future__ import annotations

from typing import List

from guardrails import Action
from intelligence.decision_core.scoring import Opportunity
from strategies.base import Strategy


class DigitalProductsStrategy(Strategy):
    name = "digital_products"
    base_conversion = 0.12
    typical_sale = 19.0

    def plan(self, opportunity: Opportunity) -> List[Action]:
        topic = opportunity.brief
        # Build the actual product + landing page (free, value-first).
        self.assets.product_listing(topic, self.name)
        self.assets.landing_page(topic, self.name)
        actions = [Action(
            strategy=self.name,
            description=f"Generate product + landing page and list it: {topic}",
            cost=0.0, reversible=True, legality="clear", tos_compliant=True,
            rationale="Create a sellable digital asset before any spend.",
            meta={"phase": "build", "opp_type": opportunity.opp_type},
        )]
        if opportunity.est_capital > 0:
            actions.append(Action(
                strategy=self.name,
                description=f"Run capped paid promo for listing: {topic}",
                cost=round(opportunity.est_capital, 2),
                reversible=False, legality="clear", tos_compliant=True,
                rationale="Small ad test, funded from budget within per-strategy cap.",
                meta={"phase": "promote", "opp_type": opportunity.opp_type},
            ))
        return actions
