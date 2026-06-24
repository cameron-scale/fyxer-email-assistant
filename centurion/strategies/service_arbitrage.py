"""Productized Service Arbitrage — the recommended cold-start focus.

Why this one with no audience: a service MARKETPLACE is borrowed distribution —
buyers are already there searching, so you don't have to manufacture demand.
The ticket is high enough that Stripe's $0.30 + 2.9% doesn't eat the margin,
and capital is ~0 (the work is AI-assisted fulfillment). One narrow niche,
listed where buyers already look, fulfilled fast.

Posting happens under a fresh marketplace seller identity (a sandbox identity),
NOT the real brand — so it operates autonomously without risking your name.
"""
from __future__ import annotations

from typing import List

from guardrails import Action
from intelligence.decision_core.scoring import Opportunity
from strategies.base import Strategy


class ServiceArbitrageStrategy(Strategy):
    name = "service_arbitrage"
    # Higher-ticket, marketplace-driven: fewer orders, each clears fees cleanly.
    base_conversion = 0.12
    typical_sale = 75.0

    def plan(self, opportunity: Opportunity) -> List[Action]:
        topic = opportunity.brief
        self.assets.service_offer(topic, self.name)
        # Pure labor leverage: building/listing the offer costs no capital.
        return [Action(
            strategy=self.name,
            description=f"List narrow-niche service on a buyer-flow marketplace & "
                        f"fulfill orders: {topic}",
            cost=0.0, reversible=True, legality="clear", tos_compliant=True,
            rationale="Borrowed distribution (marketplace has buyers); ~0 capital; "
                      "higher ticket clears Stripe fees; fulfilled with AI.",
            meta={"phase": "promote", "opp_type": opportunity.opp_type,
                  "distribution": "marketplace-buyer-flow",
                  "identity": "sandbox-marketplace-seller"},
        )]
