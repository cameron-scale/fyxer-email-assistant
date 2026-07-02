"""Asset Factory: produces the actual work product (copy, landing pages, design
prompts, service offers, content).

Uses the Language Engine when words are needed, plain templates otherwise to
keep inference cheap. NOTHING here touches real money or posts externally — it
only creates assets. Posting/charging happens in the Execution Layer behind the
guardrails.
"""
from __future__ import annotations

import html
from dataclasses import dataclass, field
from typing import Any, Dict

from intelligence.language.provider import LanguageProvider

# Neutral, niche-agnostic disclaimer carried on every deliverable, so nothing
# reads as professional (legal/medical/financial) advice regardless of topic.
DISCLAIMER = (
    "This is a general educational resource provided as-is, with no guarantees. "
    "Use your own judgment and verify anything important for your situation "
    "before relying on it.")


def _esc(s: Any) -> str:
    """HTML-escape any model/template text before it enters a page served from
    the dashboard origin (prevents stored XSS from generated/bridged content)."""
    return html.escape(str(s or ""))


@dataclass
class Asset:
    kind: str                      # 'listing' | 'landing_page' | 'service_offer' | 'content'
    title: str
    body: str
    fields: Dict[str, Any] = field(default_factory=dict)


class AssetFactory:
    def __init__(self, language: LanguageProvider):
        self.language = language

    def product_listing(self, topic: str, strategy: str) -> Asset:
        schema = {
            "title": "product title",
            "description": "compelling product description, 2-3 sentences",
            "price": "suggested one-time price in USD, number only",
            "tags": "comma-separated keywords",
        }
        out = self.language.generate(
            f"Write a digital product listing for {strategy} about {topic}",
            schema=schema)
        out = out if isinstance(out, dict) else {"description": str(out)}
        return Asset(kind="listing", title=out.get("title", topic),
                     body=out.get("description", ""), fields=out)

    def landing_page(self, topic: str, strategy: str) -> Asset:
        schema = {
            "headline": "hero headline",
            "subheadline": "supporting subheadline",
            "body": "two short benefit paragraphs",
            "cta": "call to action button text",
        }
        out = self.language.generate(
            f"Write landing page copy for {strategy} about {topic}", schema=schema)
        out = out if isinstance(out, dict) else {"body": str(out)}
        html = self._render_landing_html(out, topic)
        return Asset(kind="landing_page", title=out.get("headline", topic),
                     body=html, fields=out)

    def service_offer(self, topic: str, strategy: str) -> Asset:
        schema = {
            "title": "service offer title",
            "description": "what the buyer gets, 2 sentences",
            "price": "one-time price in USD, number only",
            "turnaround": "delivery time",
        }
        out = self.language.generate(
            f"Write a productized service offer for {strategy} about {topic}",
            schema=schema)
        out = out if isinstance(out, dict) else {"description": str(out)}
        return Asset(kind="service_offer", title=out.get("title", topic),
                     body=out.get("description", ""), fields=out)

    def design_prompt(self, topic: str) -> Asset:
        """For print-on-demand: a DESCRIPTION / generation prompt, not a posted
        design. Real generation/posting happens later behind guardrails."""
        out = self.language.generate(
            f"Write a vivid design concept prompt for a print-on-demand product about {topic}")
        return Asset(kind="content", title=f"Design concept: {topic}",
                     body=out if isinstance(out, str) else str(out))

    def content_piece(self, topic: str) -> Asset:
        out = self.language.generate(
            f"Write a short, genuinely useful content piece about {topic} that could "
            f"host legitimate affiliate links per program rules")
        return Asset(kind="content", title=f"Content: {topic}",
                     body=out if isinstance(out, str) else str(out))

    def product_document(self, topic: str, strategy: str = "digital_products") -> Asset:
        """Generate the actual DELIVERABLE the buyer receives — a real multi-
        section guide/toolkit as a self-contained HTML document."""
        listing = self.product_listing(topic, strategy)
        title = listing.title
        sections = []
        for heading in ["What this solves", "Quick start (5 steps)",
                        "The core system", "Templates & checklist", "Next steps"]:
            out = self.language.generate(
                f"Write a concise, genuinely useful section titled '{heading}' for a "
                f"product about {topic}. 2-4 short paragraphs or a tight list.")
            body = out if isinstance(out, str) else str(out)
            sections.append((heading, body))
        html = self._render_product_html(title, listing.body, sections)
        return Asset(kind="product", title=title, body=html,
                     fields={"price": listing.fields.get("price", "19"),
                             "description": listing.body,
                             "tags": listing.fields.get("tags", "")})

    @staticmethod
    def _render_product_html(title, intro, sections) -> str:
        # NOTE: static so bridge.py can call it without an AssetFactory instance.
        # (self._render_product_html(...) still works — staticmethods bind fine.)
        secs = "".join(
            f"<h2>{_esc(h)}</h2><div>{_esc(b).replace(chr(10), '<br>')}</div>"
            for h, b in sections)
        return (
            "<!doctype html><html><head><meta charset='utf-8'>"
            "<meta name='viewport' content='width=device-width, initial-scale=1'>"
            f"<title>{_esc(title)}</title>"
            "<style>body{font-family:system-ui,Arial,sans-serif;max-width:760px;margin:0 auto;"
            "padding:28px;line-height:1.6;color:#16202b}h1{font-size:30px}h2{margin-top:28px;"
            "color:#0b6}div{color:#2a3a4a}.tag{color:#7a8699;font-size:13px}"
            ".disc{margin-top:32px;padding:12px;background:#f6f8fa;border-radius:8px;"
            "color:#66707a;font-size:12px}</style></head><body>"
            f"<h1>{_esc(title)}</h1><p class='tag'>Your purchased copy — thank you!</p>"
            f"<p>{_esc(intro)}</p>{secs}"
            f"<p class='disc'>{_esc(DISCLAIMER)}</p></body></html>"
        )

    def _render_landing_html(self, fields: Dict[str, Any], topic: str) -> str:
        return (
            "<!doctype html><html><head><meta charset='utf-8'>"
            f"<title>{fields.get('headline', topic)}</title></head><body>"
            f"<h1>{fields.get('headline', topic)}</h1>"
            f"<h2>{fields.get('subheadline', '')}</h2>"
            f"<p>{fields.get('body', '')}</p>"
            f"<a href='#buy' class='cta'>{fields.get('cta', 'Buy now')}</a>"
            "</body></html>"
        )
