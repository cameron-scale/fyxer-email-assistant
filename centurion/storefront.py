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


def publish_product(ledger, assets, stripe, topic: str,
                    public_url: str | None = None) -> dict:
    """Create + store a real product and a delivering payment link. Returns the
    product dict (also recorded in the ledger). Safe to call repeatedly: same
    topic -> same slug, refreshed."""
    asset = assets.product_document(topic)
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
        redirect_url=redirect)

    product = {
        "slug": slug, "title": title, "price": price,
        "pay_url": link.url, "deliver_token": token,
        "file": str(path), "created": time.time(),
        "mock": getattr(link, "mock", False),
    }
    ledger.record_product(product)
    ledger.add_payment_link(link.url, title)  # keep the simple storefront panel populated
    return product
