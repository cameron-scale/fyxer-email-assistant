"""Regression tests for the $10->$100 supercharge: honest accounting, security,
compliance, and the quality gates that keep junk off the storefront."""
import os

import pytest

from ledger import Ledger
from integrations import stripe_webhook as W


@pytest.fixture
def ledger(tmp_path):
    led = Ledger(tmp_path / "t.db")
    led.seed(10.0)
    return led


def _sale_event(etype, eid, pi="pi_1", amount=2900, meta=None):
    return {"type": etype, "id": eid, "data": {"object": {
        "amount_total": amount, "payment_intent": pi,
        "metadata": meta or {"strategy": "digital_products"}}}}


def test_one_sale_credits_once_across_three_events(ledger):
    # A single Stripe payment emits 3 event types with different ids.
    W.handle_event(_sale_event("checkout.session.completed", "e1"), ledger)
    W.handle_event(_sale_event("payment_intent.succeeded", "e2"), ledger)
    W.handle_event(_sale_event("charge.succeeded", "e3"), ledger)
    assert ledger.balance() == pytest.approx(39.0)  # 10 seed + 29 once


def test_duplicate_checkout_event_not_double_credited(ledger):
    W.handle_event(_sale_event("checkout.session.completed", "e1"), ledger)
    W.handle_event(_sale_event("checkout.session.completed", "e1"), ledger)
    assert ledger.balance() == pytest.approx(39.0)


def test_refund_uses_amount_refunded(ledger):
    W.handle_event(_sale_event("checkout.session.completed", "e1"), ledger)  # +29
    evt = {"type": "charge.refunded", "id": "r1",
           "data": {"object": {"amount": 2900, "amount_refunded": 1000}}}
    W.handle_event(evt, ledger)  # refund only the $10 that was refunded
    assert ledger.balance() == pytest.approx(29.0)


def test_live_mode_requires_webhook_signature(monkeypatch):
    monkeypatch.setenv("CENTURION_LIVE_REVENUE", "1")
    monkeypatch.delenv("STRIPE_WEBHOOK_SECRET", raising=False)
    with pytest.raises(ValueError):
        W.verify_and_parse(b"{}", None, "")


def test_no_fabricated_passive_sales_in_live_mode(tmp_path):
    import random
    from orchestrator import Orchestrator
    from config import load_config
    os.environ["CENTURION_DATABASE_PATH"] = str(tmp_path / "live.db")
    try:
        o = Orchestrator(load_config())
        o.ledger.seed(10.0) if not o.ledger.is_seeded() else None
        o.sim = False  # LIVE
        from orchestrator import CycleReport
        rep = CycleReport(cycle=1, started=0, balance_before=10, balance_after=10)
        before = o.ledger.balance()
        o._operate_live_assets(random.Random(1), rep)
        assert o.ledger.balance() == before  # no invented revenue
    finally:
        os.environ.pop("CENTURION_DATABASE_PATH", None)


def test_guard_blocks_real_income_claims_and_cpt():
    from growth import guard
    for bad in ["make $5,000 a month", "guaranteed income", "get rich quick",
                "10% ROI", "cpt cheat sheet", "list of cpt codes",
                # harder claim forms surfaced by the adversarial review:
                "double your profits", "boost your profit margins",
                "profit from day one", "unlock your earning potential",
                "start earning today", "earn thousands each week",
                "$5,000 a year", "add $10,000 a year to your practice"]:
        assert guard.check(bad)[0] is False, bad


def test_guard_allows_legitimate_billing_vocab():
    from growth import guard
    for ok in ["reduce appeals per month", "a $25 copay applies",
               "improve denial results", "credentialing checklist for providers",
               "reduce profit leakage from denials", "revenue cycle management steps",
               "collection earnings tracking report", "timely filing appeal letter"]:
        assert guard.check(ok)[0] is True, ok


def test_refund_with_payment_intent_still_debits(ledger):
    # A real refund carries the SAME payment_intent as the sale — it must not be
    # swallowed by the sale-dedupe guard.
    W.handle_event(_sale_event("checkout.session.completed", "e1", pi="pi_R"), ledger)
    evt = {"type": "charge.refunded", "id": "r1", "data": {"object": {
        "payment_intent": "pi_R", "amount": 2900, "amount_refunded": 2900}}}
    r = W.handle_event(evt, ledger)
    assert r.handled and "refund" in r.detail
    assert ledger.balance() == pytest.approx(10.0)  # 10 + 29 sale - 29 refund


def test_guard_brand_safety():
    from growth import guard
    assert guard.brand_safe("a helpful guide", "ScaleMBS") is True
    assert guard.brand_safe("the ScaleMBS toolkit", "ScaleMBS") is False


def test_template_topic_extraction_is_specific():
    from intelligence.language.templates import TemplateProvider
    tp = TemplateProvider()
    topic = tp._extract_topic(
        "Write a digital product listing for digital_products about "
        "denial appeal letter template pack")
    assert "denial appeal" in topic
    assert "digital_products" not in topic


def test_template_output_has_no_provider_marker():
    from intelligence.language.templates import TemplateProvider
    body = TemplateProvider().generate("write a section titled 'Steps'", {"body": ""})["body"]
    assert "deterministic template output" not in body.lower()


def test_looks_sellable_rejects_junk():
    from storefront import _looks_sellable
    from intelligence.asset_factory import Asset
    junk = Asset(kind="product", title="The Complete Digital Toolkit",
                 body="<p>thin</p>", fields={})
    ok, _ = _looks_sellable(junk)
    assert ok is False


def test_looks_sellable_rejects_brand_named_product():
    from storefront import _looks_sellable
    from intelligence.asset_factory import Asset
    body = "<p>" + " ".join(["useful billing workflow content"] * 60) + "</p>"
    a = Asset(kind="product", title="ScaleMBS Denial Playbook", body=body, fields={})
    ok, why = _looks_sellable(a, brand="ScaleMBS")
    assert ok is False


def test_bridge_jobs_roundtrip(ledger):
    jid = ledger.add_bridge_job("product_upgrade", "slug-x", "improve it",
                                schema={"intro": "x"}, meta={"title": "T"})
    queued = ledger.bridge_jobs_by_status("queued")
    assert any(j["id"] == jid for j in queued)
    ledger.set_bridge_status(jid, "done", "{}")
    assert ledger.get_bridge_job(jid)["status"] == "done"
