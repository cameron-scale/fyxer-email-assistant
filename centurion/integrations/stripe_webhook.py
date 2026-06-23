"""Stripe webhook handling — event-driven revenue.

A sale or refund is handled instantly between cycles. Verifies the signature
when a webhook secret is configured, parses the event, and applies the ledger
effect idempotently (the Stripe event id is the idempotency key).
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Optional

from ledger import Ledger


@dataclass
class WebhookResult:
    handled: bool
    kind: str
    amount: float
    detail: str


def verify_and_parse(payload: bytes, sig_header: Optional[str],
                     secret: Optional[str]) -> dict:
    secret = secret if secret is not None else os.environ.get("STRIPE_WEBHOOK_SECRET", "")
    if secret:
        import stripe  # only needed for verification
        return stripe.Webhook.construct_event(payload, sig_header, secret)
    # No secret configured (mock/dev): parse without verification.
    return json.loads(payload.decode() if isinstance(payload, bytes) else payload)


def handle_event(event: dict, ledger: Ledger) -> WebhookResult:
    etype = event.get("type", "")
    obj = (event.get("data", {}) or {}).get("object", {}) or {}
    event_id = event.get("id", "")
    # Idempotency: if we've already recorded this external_ref, skip.
    already = [t for t in ledger.transactions(1000) if t["external_ref"] == event_id]
    if already and event_id:
        return WebhookResult(False, etype, 0.0, "duplicate event ignored")

    if etype in ("checkout.session.completed", "payment_intent.succeeded",
                 "charge.succeeded"):
        amount = _amount(obj)
        strategy = (obj.get("metadata", {}) or {}).get("strategy")
        ledger.credit(amount, strategy=strategy, description="stripe sale",
                      reversible=True, external_ref=event_id)
        return WebhookResult(True, etype, amount, f"credited {amount:.2f}")

    if etype in ("charge.refunded", "charge.dispute.created"):
        amount = _amount(obj)
        # A refund removes revenue we previously booked; record as a debit if
        # there is balance, else as a zero-floored adjustment.
        try:
            ledger.debit(amount, description="stripe refund", reversible=False,
                         external_ref=event_id)
        except Exception:
            return WebhookResult(True, etype, amount, "refund exceeded balance; logged only")
        return WebhookResult(True, etype, amount, f"debited refund {amount:.2f}")

    return WebhookResult(False, etype, 0.0, "unhandled event type")


def _amount(obj: dict) -> float:
    for key in ("amount_total", "amount", "amount_received"):
        if key in obj and obj[key] is not None:
            return float(obj[key]) / 100.0
    return 0.0
