"""Unit economics — force the math to clear before any dollar is deployed.

A $5 product loses ~6% to Stripe's fixed fee alone ($0.30 + 2.9%). Most cold,
saturated micro-plays are net ~$0 after fees and effort. This module makes
Centurion *prove* an opportunity clears a real margin, after fees, before it is
allowed to spend on it. If nothing clears, the correct move is to HOLD — which
this turns into a first-class decision rather than a reluctant pause.
"""
from __future__ import annotations

from dataclasses import dataclass

# Stripe standard pricing (US). Adjust per your account / region.
STRIPE_PCT = 0.029
STRIPE_FIXED = 0.30


def stripe_net(gross: float) -> float:
    """Net received after Stripe fees on a single charge of `gross`."""
    if gross <= 0:
        return 0.0
    return gross * (1.0 - STRIPE_PCT) - STRIPE_FIXED


@dataclass
class EconVerdict:
    clears: bool
    net_ev: float          # expected profit after fees and cost
    margin: float          # net_ev / cost (or net_ev if cost ~ 0)
    reason: str


class Economics:
    def __init__(self, config: dict | None = None):
        config = config or {}
        # Minimum profit (after fees) required before deploying capital.
        self.min_net_ev = float(config.get("min_net_ev", 1.0))
        # Minimum return-on-spend multiple for capital-deploying actions.
        self.min_margin = float(config.get("min_margin", 0.5))  # 50% over cost

    def evaluate(self, expected_gross_revenue: float, cost: float,
                 charges: int = 1) -> EconVerdict:
        """Expected net EV after Stripe fees on `charges` sales and the `cost`
        deployed. Conservative: fees are charged per expected sale."""
        per_sale_net = stripe_net(expected_gross_revenue / max(charges, 1))
        revenue_net = per_sale_net * max(charges, 1)
        net_ev = revenue_net - cost

        if cost <= 1e-9:
            # Zero-marginal-cost play: only needs to clear the min net EV.
            clears = net_ev >= self.min_net_ev
            return EconVerdict(clears, net_ev, net_ev,
                               "zero-cost play clears" if clears else
                               f"net EV ${net_ev:.2f} < min ${self.min_net_ev:.2f}")

        margin = net_ev / cost
        clears = net_ev >= self.min_net_ev and margin >= self.min_margin
        if clears:
            reason = f"clears: net EV ${net_ev:.2f}, margin {margin*100:.0f}%"
        elif net_ev < self.min_net_ev:
            reason = f"net EV ${net_ev:.2f} below min ${self.min_net_ev:.2f} after fees"
        else:
            reason = f"margin {margin*100:.0f}% below min {self.min_margin*100:.0f}%"
        return EconVerdict(clears, net_ev, margin, reason)
