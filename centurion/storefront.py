"""Storefront: turn an idea into a real, sellable, deliverable product.

Generates an actual product document, saves it, prices it, creates a real Stripe
payment link that redirects the buyer to a delivery page after payment, and
records it. This is what makes Centurion a real micro-business loop rather than a
bare payment link: pay -> receive the product.
"""
from __future__ import annotations

import hashlib
import re
import time
from pathlib import Path


def slugify(text: str, n: int = 6) -> str:
    words = re.findall(r"[A-Za-z0-9]+", (text or "").lower())
    return "-".join(words[:n]) or "product"


def products_dir(ledger) -> Path:
    d = Path(ledger.db_path).resolve().parent / "products"
    d.mkdir(parents=True, exist_ok=True)
    return d


class NotSellable(Exception):
    """Raised when a generated product isn't good enough to charge for."""


def _looks_sellable(asset, brand: str = "") -> tuple[bool, str]:
    """Refuse to put a Stripe link on junk. Blocks the old placeholder title,
    provider markers, too-thin bodies, compliance-failing copy, and anything
    carrying the operator's real brand name (that routes to a human instead)."""
    from growth import guard
    title = (asset.title or "").strip()
    body = asset.body or ""
    visible = re.sub(r"<[^>]+>", " ", body)
    if not title or "the complete digital toolkit" in title.lower():
        return False, "placeholder title"
    if "deterministic template output" in body.lower():
        return False, "contains provider marker"
    if len(visible.split()) < 120:
        return False, "deliverable too thin"
    # Compliance-check the WHOLE visible body — a claim can hide past any offset.
    ok, why = guard.check(f"{title} {visible}")
    if not ok:
        return False, why
    if not guard.brand_safe(f"{title} {visible}", brand):
        return False, "names the operator brand (needs human review)"
    return True, "ok"


def publish_product(ledger, assets, stripe, topic: str,
                    public_url: str | None = None, brand: str = "") -> dict:
    """Create + store a real product and a delivering payment link. Returns the
    product dict (also recorded in the ledger). Safe to call repeatedly: same
    topic -> same slug, refreshed. Raises NotSellable rather than charge for
    junk — a bad product burns trust and warm-audience goodwill."""
    asset = assets.product_document(topic)
    ok, why = _looks_sellable(asset, brand)
    if not ok:
        raise NotSellable(why)
    title = asset.title
    slug = slugify(title)
    try:
        price = float(str(asset.fields.get("price", "19")).replace("$", "") or 19)
    except Exception:
        price = 19.0
    price = max(price, 5.0)

    # Save the deliverable.
    path = products_dir(ledger) / f"{slug}.html"
    path.write_text(asset.body, encoding="utf-8")

    # Non-guessable delivery token (only buyers get it via the post-payment redirect).
    token = hashlib.sha256(f"{slug}|{time.time()}".encode()).hexdigest()[:24]
    redirect = f"{public_url.rstrip('/')}/deliver/{token}" if public_url else None

    link = stripe.create_payment_link(
        amount=price, product_name=title,
        idem=stripe.idempotency_key("prod", slug),
        redirect_url=redirect,
        # Rides Stripe metadata onto every Checkout Session for this product, so
        # the webhook can attribute the sale to the strategy (real-dollar reward
        # for the bandit) and to the exact product.
        metadata={"strategy": "digital_products", "slug": slug})

    product = {
        "slug": slug, "title": title, "price": price,
        "pay_url": link.url, "deliver_token": token,
        "file": str(path), "created": time.time(),
        "mock": getattr(link, "mock", False),
        "description": (asset.fields.get("description") or "").strip()[:300],
    }
    ledger.record_product(product)
    ledger.add_payment_link(link.url, title)  # keep the simple storefront panel populated
    try:
        # Queue a local-model quality upgrade (worked by the operator's own
        # machine via the Ollama bridge; the template version ships meanwhile).
        import bridge
        bridge.enqueue_product_upgrade(ledger, product)
    except Exception:
        pass
    return product
