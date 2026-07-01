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
        # A clean, customer-facing topic from the raw idea (strip lens tag + the
        # demand/competition annotation), used for the asset and the Stripe product.
        topic = opportunity.brief.split("|")[0].split("]")[-1].strip() or opportunity.brief
        self.assets.product_listing(topic, self.name)
        self.assets.landing_page(topic, self.name)
        actions = [Action(
            strategy=self.name,
            description=f"Generate product + landing page and list it: {topic}",
            cost=0.0, reversible=True, legality="clear", tos_compliant=True,
            rationale="Create a sellable digital asset before any spend.",
            meta={"phase": "build", "opp_type": opportunity.opp_type,
                  "publishes_under_brand": True, "topic": topic},
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
                import os
                import storefront
                topic = action.meta.get("topic") or action.description
                public_url = os.environ.get("CENTURION_PUBLIC_URL") \
                    or os.environ.get("RENDER_EXTERNAL_URL")
                brand = os.environ.get("CENTURION_BRAND", "") or self.config.get("brand_identity", "")
                product = storefront.publish_product(
                    self.ledger, self.assets, stripe, topic,
                    public_url=public_url, brand=brand)
                return ExecutionResult(True, cost=0.0, revenue=0.0,
                                       external_ref=product["pay_url"], reversible=True,
                                       detail=f"published '{product['title']}' @ ${product['price']:.0f}")
            except storefront.NotSellable as e:
                return ExecutionResult(False, detail=f"held back low-quality product: {e}")
            except Exception as e:
                self.ledger.set_state("last_stripe_error", str(e)[:300])
                return ExecutionResult(False, detail=f"product publish failed: {e}")
        if phase == "promote":
            return ExecutionResult(False, cost=0.0,
                                   detail="no ad-platform API configured; skipping paid "
                                          "promo (capital-safe)")
        return ExecutionResult(False, detail="no live integration for this action")
