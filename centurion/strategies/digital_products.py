"""Digital Products: research a niche, generate a small digital product, build a
landing page, list it, collect via Stripe. Optional capped paid promotion."""
from __future__ import annotations

from typing import List

from guardrails import Action
from intelligence.decision_core.scoring import Opportunity
from strategies.base import Strategy, ExecutionResult


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
            meta={"phase": "build", "opp_type": opportunity.opp_type,
                  "publishes_under_brand": True},
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

    def _execute_live(self, action: Action, context: dict) -> ExecutionResult:
        """Live path. The BUILD phase creates a real Stripe Payment Link to
        collect money — this never risks capital. Revenue arrives later via the
        Stripe webhook when a customer actually pays. The PROMOTE phase needs a
        real ad-platform API; absent one, it does NOT spend (capital-safe), it
        just reports that paid promo is not wired."""
        stripe = context.get("stripe")
        phase = action.meta.get("phase", "build")
        if phase == "build" and stripe is not None:
            try:
                fields = self.assets.product_listing(action.description, self.name).fields
                price = float(str(fields.get("price", "19")).replace("$", "") or 19)
                link = stripe.create_payment_link(
                    amount=price, product_name=action.description[:120],
                    idem=stripe.idempotency_key("dp", action.description))
                # Surface the link on the dashboard so the operator can open/share
                # it and actually receive money.
                self.ledger.add_payment_link(link.url, action.description[:80])
                return ExecutionResult(True, cost=0.0, revenue=0.0,
                                       external_ref=link.id, reversible=True,
                                       detail=f"listed; pay link {link.url}")
            except Exception as e:
                return ExecutionResult(False, detail=f"stripe link failed: {e}")
        if phase == "promote":
            return ExecutionResult(False, cost=0.0,
                                   detail="no ad-platform API configured; skipping paid "
                                          "promo (capital-safe)")
        return ExecutionResult(False, detail="no live integration for this action")
