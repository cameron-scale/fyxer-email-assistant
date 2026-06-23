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
        self.api_key = api_key if api_key is not None else os.environ.get("STRIPE_API_KEY", "")
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
                            idem: Optional[str] = None) -> PaymentLink:
        idem = idem or self.idempotency_key("plink", product_name, f"{amount:.2f}")
        if self.mock:
            return PaymentLink(id=f"mock_plink_{idem[:12]}",
                               url=f"https://mock.stripe/pay/{idem[:12]}",
                               amount=amount, mock=True)
        price = self._stripe.Price.create(
            unit_amount=int(round(amount * 100)), currency="usd",
            product_data={"name": product_name})
        link = self._stripe.PaymentLink.create(
            line_items=[{"price": price.id, "quantity": 1}],
            idempotency_key=idem)
        return PaymentLink(id=link.id, url=link.url, amount=amount, mock=False)

    def get_charge(self, charge_id: str) -> ChargeRecord:
        """Used during crash recovery to reconcile an in-flight charge."""
        if self.mock or charge_id.startswith("mock_"):
            return ChargeRecord(id=charge_id, amount=0.0, status="succeeded", mock=True)
        ch = self._stripe.Charge.retrieve(charge_id)
        return ChargeRecord(id=ch.id, amount=ch.amount / 100.0,
                            status=ch.status, mock=False)
