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
    if os.environ.get("CENTURION_LIVE_REVENUE") == "1":
        # The webhook URL is public. Unsigned events on a LIVE ledger would let
        # anyone mint credits with a curl — refuse instead of trusting.
        raise ValueError("live mode requires STRIPE_WEBHOOK_SECRET; "
                         "unsigned webhook events are rejected")
    # No secret configured (mock/dev): parse without verification.
    return json.loads(payload.decode() if isinstance(payload, bytes) else payload)


def handle_event(event: dict, ledger: Ledger) -> WebhookResult:
    etype = event.get("type", "")
    obj = (event.get("data", {}) or {}).get("object", {}) or {}
    event_id = event.get("id", "")
    # Idempotency across BOTH the event id and the underlying payment: one sale
    # fires several event types (checkout.session.completed AND
    # payment_intent.succeeded AND charge.succeeded), each with its own event
    # id — crediting per event id alone would book the same sale up to 3x.
    _SALE_TYPES = ("checkout.session.completed", "payment_intent.succeeded",
                   "charge.succeeded")
    pay_ref = (obj.get("payment_intent") or obj.get("id") or "")
    seen = {t["external_ref"] for t in ledger.transactions(1000) if t["external_ref"]}
    if event_id and event_id in seen:
        return WebhookResult(False, etype, 0.0, "duplicate event ignored")
    # The payment-level dedupe applies ONLY to sale events. A refund/dispute
    # carries the SAME payment_intent as the original sale, so applying it there
    # would silently swallow every refund.
    if etype in _SALE_TYPES and pay_ref and f"pay:{pay_ref}" in seen:
        return WebhookResult(False, etype, 0.0, "payment already credited")

    if etype == "checkout.session.completed":
        # Credit ONLY on the session completion (payment links always produce
        # one); the payment_intent/charge events for the same payment dedupe
        # against pay_ref above.
        amount = _amount(obj)
        ref = f"pay:{pay_ref}" if pay_ref else event_id
        meta = obj.get("metadata", {}) or {}
        strategy = meta.get("strategy")
        ledger.credit(amount, strategy=strategy, description="stripe sale",
                      reversible=True, external_ref=ref)
        return WebhookResult(True, etype, amount, f"credited {amount:.2f}")

    if etype in ("payment_intent.succeeded", "charge.succeeded"):
        # Informational for payment-link flows; the session event carries the
        # credit. Record nothing so one sale can never double-book.
        return WebhookResult(False, etype, 0.0,
                             "payment event acknowledged; credit rides checkout.session.completed")

    if etype in ("charge.refunded", "charge.dispute.created"):
        # Use the actually-refunded amount, not the original charge amount.
        amount = (float(obj.get("amount_refunded")) / 100.0
                  if obj.get("amount_refunded") is not None else _amount(obj))
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
