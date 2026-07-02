"""Content and Affiliate: build a small content asset around a real interest,
monetize with legitimate affiliate links per program rules. Long fuse, low
cost, compounding."""
from __future__ import annotations

from typing import List

from guardrails import Action
from intelligence.decision_core.scoring import Opportunity
from strategies.base import Strategy


class ContentAffiliateStrategy(Strategy):
    name = "content_affiliate"
    base_conversion = 0.05      # affiliate is a long fuse; low immediate conversion
    typical_sale = 8.0

    def plan(self, opportunity: Opportunity) -> List[Action]:
        topic = opportunity.brief
        self.assets.content_piece(topic)
        # Content + legitimate affiliate links cost no capital to publish.
        return [Action(
            strategy=self.name,
            description=f"Publish content asset with compliant affiliate links: {topic}",
            cost=0.0, reversible=True, legality="clear", tos_compliant=True,
            rationale="Compounding asset; must follow each affiliate program's rules.",
            meta={"phase": "promote", "opp_type": opportunity.opp_type,
                  "publishes_under_brand": True,
                  "affiliate_rules": "must disclose, no incentivized clicks"},
        )]
