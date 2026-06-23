"""Asset Factory: produces the actual work product (copy, landing pages, design
prompts, service offers, content).

Uses the Language Engine when words are needed, plain templates otherwise to
keep inference cheap. NOTHING here touches real money or posts externally — it
only creates assets. Posting/charging happens in the Execution Layer behind the
guardrails.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict

from intelligence.language.provider import LanguageProvider


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
