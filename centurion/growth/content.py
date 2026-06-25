"""Content factory: SEO pages (Lane A) and third-party drafts (Lane B).

Every page must stand on its own as useful even if it never ranks (quality
floor), carry correct on-page SEO + schema, and link to the product. Lane B
drafts are never posted here — they are returned for approval.
"""
from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from typing import List, Optional

from . import guard

PAGE_TEMPLATES = ["comparison", "roundup", "problem-solution", "glossary", "use-case"]
LANE_B_KINDS = ["reddit_reply", "video_script", "outreach_pitch"]

_SECTIONS = {
    "comparison":      ["The honest comparison", "Where each one fits", "How to choose"],
    "roundup":         ["The shortlist", "What to look for", "Who each is for"],
    "problem-solution":["The problem, clearly", "Why it happens", "A practical fix", "Steps"],
    "glossary":        ["Definition", "Why it matters", "Related terms", "Example"],
    "use-case":        ["The scenario", "What good looks like", "How to set it up"],
}


def slugify(text: str, n: int = 7) -> str:
    words = re.findall(r"[A-Za-z0-9]+", (text or "").lower())
    return "-".join(words[:n]) or "page"


@dataclass
class Page:
    slug: str
    title: str
    meta: str
    html: str
    template: str
    cluster: str
    product_slug: str
    created: float = field(default_factory=lambda: 0.0)


class ContentFactory:
    def __init__(self, language):
        self.language = language

    def _gen(self, prompt: str) -> str:
        out = self.language.generate(prompt)
        return out if isinstance(out, str) else str(out)

    def page(self, cluster_keyword: str, template: str, product: dict) -> Optional[Page]:
        template = template if template in _SECTIONS else "problem-solution"
        title = self._title(cluster_keyword, template)
        meta = self._gen(f"Write a 150-character meta description for a page titled "
                         f"'{title}'. Plain, useful, no hype.")[:160]
        body_parts = []
        for h in _SECTIONS[template]:
            txt = self._gen(f"Write a concise, genuinely useful section '{h}' for an "
                            f"article titled '{title}'. 2-3 short paragraphs. No hype, "
                            f"no claims about income or results, no fake stats/reviews.")
            body_parts.append((h, txt))

        # Quality + compliance gate on the visible text.
        visible = title + " " + meta + " " + " ".join(t for _, t in body_parts)
        ok, reason = guard.check(visible)
        if not ok:
            # one sanitized retry: strip offending sentences
            body_parts = [(h, _scrub(t)) for h, t in body_parts]
            meta = _scrub(meta)
            ok, reason = guard.check(title + " " + meta + " " + " ".join(t for _, t in body_parts))
            if not ok:
                return None  # refuse to publish non-compliant content

        slug = slugify(title)
        html = self._render(title, meta, body_parts, slug, product)
        return Page(slug=slug, title=title, meta=meta, html=html, template=template,
                    cluster=cluster_keyword, product_slug=product.get("slug", ""),
                    created=time.time())

    def _title(self, keyword: str, template: str) -> str:
        k = keyword.strip().capitalize()
        return {
            "comparison": f"{k}: an honest comparison",
            "roundup": f"{k}: a practical shortlist",
            "problem-solution": f"{k} — and how to fix it",
            "glossary": f"{k}: what it means",
            "use-case": f"{k}: a real-world walkthrough",
        }.get(template, k)

    def _render(self, title, meta, parts, slug, product) -> str:
        secs = "".join(
            f"<h2>{h}</h2><p>{(b or '').strip().replace(chr(10), '</p><p>')}</p>"
            for h, b in parts)
        prod_title = product.get("title", "the toolkit")
        # Internal link to the product via the click-tracking redirect.
        cta = (f"<div class='cta'><p>Built a focused toolkit for this: "
               f"<a href='/go/{slug}'>{prod_title}</a>.</p></div>")
        schema = (
            '{"@context":"https://schema.org","@type":"Article",'
            f'"headline":{_json(title)},"description":{_json(meta)}}}')
        return (
            "<!doctype html><html lang='en'><head><meta charset='utf-8'>"
            "<meta name='viewport' content='width=device-width, initial-scale=1'>"
            f"<title>{title}</title><meta name='description' content=\"{meta}\">"
            f"<link rel='canonical' href='/c/{slug}'>"
            f"<script type='application/ld+json'>{schema}</script>"
            "<style>body{font-family:system-ui,Arial,sans-serif;max-width:740px;margin:0 auto;"
            "padding:28px;line-height:1.6;color:#15202b}h1{font-size:30px}h2{margin-top:26px;color:#0b6}"
            ".cta{margin-top:30px;padding:16px;background:#f3f7f5;border-radius:10px}"
            "a{color:#0a7}</style></head><body>"
            f"<h1>{title}</h1>{secs}{cta}</body></html>")

    # --- Lane B (draft only, never posted here) ---
    def lane_b_draft(self, kind: str, cluster_keyword: str, product: dict) -> dict:
        prod = product.get("title", "the toolkit")
        if kind == "reddit_reply":
            platform = "Reddit (relevant subreddit)"
            draft = self._gen(
                f"Write a genuinely helpful, on-topic reply to someone asking about "
                f"'{cluster_keyword}'. Give real advice first. Mention '{prod}' only "
                f"once, naturally, as one option. No hype, no claims, no fake stats.")
            reason = "answers the exact problem; product mentioned only where it fits"
        elif kind == "video_script":
            platform = "Short-form video (TikTok/Reels/Shorts), faceless"
            draft = self._gen(
                f"Write 5 punchy hooks and a 30-second faceless voiceover script about "
                f"'{cluster_keyword}'. Useful, no income/results claims, no fake proof.")
            reason = "high-volume faceless content; a few may carry reach"
        else:  # outreach_pitch
            platform = "Email (guest post / resource link / capped rev-share)"
            draft = self._gen(
                f"Write a short, personalized outreach pitch to a small relevant site/"
                f"creator about a guest post or resource link on '{cluster_keyword}'. "
                f"Polite, specific, no income claims, capped rev-share if relevant.")
            reason = "borrowed audience via organic partnership; no paid spend"
        ok, why = guard.check(draft)
        return {"kind": kind, "platform": platform, "draft": draft.strip(),
                "reason": reason, "compliant": ok, "compliance_note": why}


def _scrub(text: str) -> str:
    keep = []
    for sentence in re.split(r"(?<=[.!?])\s+", text or ""):
        ok, _ = guard.check(sentence)
        if ok:
            keep.append(sentence)
    return " ".join(keep)


def _json(s: str) -> str:
    return '"' + (s or "").replace('\\', '').replace('"', "'") + '"'
