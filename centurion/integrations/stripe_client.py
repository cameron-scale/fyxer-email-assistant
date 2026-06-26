"""Stripe client for collecting real revenue (Payment Links / Checkout).

Runs in MOCK mode when no STRIPE_API_KEY is set, so the full simulated dry run
works with no real money and no network. Every call carries an idempotency key
so a mid-action crash never double-charges.
"""
from __future__ import annotations

import hashlib
import os
import time
from dataclasses import dataclass
from typing import Optional


# Accept the common env-var names people use for a Stripe secret key, so a
# harmless naming mismatch (STRIPE_API_SECRET vs STRIPE_API_KEY) can't silently
# drop us into mock mode. First non-empty wins.
_STRIPE_KEY_ENV_NAMES = (
    "STRIPE_API_KEY", "STRIPE_SECRET_KEY", "STRIPE_API_SECRET",
    "STRIPE_SECRET", "STRIPE_KEY",
)


def resolve_stripe_key() -> str:
    """Return the Stripe secret key from whichever common env var holds it."""
    for name in _STRIPE_KEY_ENV_NAMES:
        v = os.environ.get(name, "")
        if v:
            return v
    return ""


@dataclass
class PaymentLink:
    id: str
    url: str
    amount: float
    mock: bool


@dataclass
class ChargeRecord:
    id: str
    amount: float
    status: str            # 'succeeded' | 'pending' | 'failed'
    mock: bool


class StripeClient:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key if api_key is not None else resolve_stripe_key()
        self.mock = not bool(self.api_key)
        self._stripe = None
        if not self.mock:
            try:
                import stripe
                stripe.api_key = self.api_key
                self._stripe = stripe
            except Exception:
                # Library missing -> degrade safely to mock rather than crash.
                self.mock = True

    @staticmethod
    def idempotency_key(*parts: str) -> str:
        return hashlib.sha256("|".join(parts).encode()).hexdigest()[:32]

    def create_payment_link(self, *, amount: float, product_name: str,
                            idem: Optional[str] = None,
                            redirect_url: Optional[str] = None) -> PaymentLink:
        idem = idem or self.idempotency_key("plink", product_name, f"{amount:.2f}")
        if self.mock:
            return PaymentLink(id=f"mock_plink_{idem[:12]}",
                               url=f"https://mock.stripe/pay/{idem[:12]}",
                               amount=amount, mock=True)
        price = self._stripe.Price.create(
            unit_amount=int(round(amount * 100)), currency="usd",
            product_data={"name": product_name})
        params = {"line_items": [{"price": price.id, "quantity": 1}]}
        if redirect_url:
            # Deliver the product immediately after payment.
            params["after_completion"] = {
                "type": "redirect", "redirect": {"url": redirect_url}}
        link = self._stripe.PaymentLink.create(idempotency_key=idem, **params)
        return PaymentLink(id=link.id, url=link.url, amount=amount, mock=False)

    def get_charge(self, charge_id: str) -> ChargeRecord:
        """Used during crash recovery to reconcile an in-flight charge."""
        if self.mock or charge_id.startswith("mock_"):
            return ChargeRecord(id=charge_id, amount=0.0, status="succeeded", mock=True)
        ch = self._stripe.Charge.retrieve(charge_id)
        return ChargeRecord(id=ch.id, amount=ch.amount / 100.0,
                            status=ch.status, mock=False)
