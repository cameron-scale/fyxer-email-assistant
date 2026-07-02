"""Content factory: SEO pages (Lane A) and third-party drafts (Lane B).

Every page must stand on its own as useful even if it never ranks (quality
floor), carry correct on-page SEO + schema, and link to the product. Lane B
drafts are never posted here — they are returned for approval.
"""
from __future__ import annotations

import html
import re
import time
from dataclasses import dataclass, field
from typing import List, Optional

from . import guard

# Neutral, niche-agnostic educational line (kept generic so it fits any topic).
PAGE_DISCLAIMER = ("General information provided as-is, with no guarantees — "
                   "use your own judgment and verify anything important.")


def _e(s) -> str:
    return html.escape(str(s or ""))

PAGE_TEMPLATES = ["comparison", "roundup", "problem-solution", "glossary", "use-case"]
# Warm-channel kinds come FIRST — a short, honest note to the operator's own
# audience (list / LinkedIn) is the highest-EV first-customer path, far above
# cold SEO or forum replies. They queue for one-tap approval like everything else.
LANE_B_KINDS = ["warm_email", "linkedin_post", "reddit_reply",
                "video_script", "outreach_pitch"]

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

    @staticmethod
    def _render(title, meta, parts, slug, product) -> str:
        # Emits an ARTICLE FRAGMENT (no <html>/<head>/<style>) — the dashboard
        # wraps it in the shared site shell at serve time so every guide carries
        # the site's header, nav and footer. Static so bridge.py can re-render an
        # upgraded page. All model/template text is HTML-escaped before it enters
        # a page on the dashboard origin.
        secs = "".join(
            f"<h2>{_e(h)}</h2><p>{_e((b or '').strip()).replace(chr(10), '</p><p>')}</p>"
            for h, b in parts)
        prod_title = product.get("title", "the toolkit")
        # Internal link to the product via the click-tracking redirect.
        cta = (f"<div class='cta'><p>Built a focused resource for this: "
               f"<a href='/go/{_e(slug)}'>{_e(prod_title)}</a>.</p></div>")
        schema = (
            '{"@context":"https://schema.org","@type":"Article",'
            f'"headline":{_json(title)},"description":{_json(meta)}}}')
        return (
            f"<article class='guide'>"
            f"<script type='application/ld+json'>{schema}</script>"
            f"<p class='crumb'><a href='/guides'>Guides</a> › {_e(title)}</p>"
            f"<h1>{_e(title)}</h1>{secs}{cta}"
            f"<p class='disc'>{_e(PAGE_DISCLAIMER)}</p></article>")

    # --- Lane B (draft only, never posted here) ---
    def lane_b_draft(self, kind: str, cluster_keyword: str, product: dict) -> dict:
        import os
        prod = product.get("title", "the toolkit")
        slug = product.get("slug", "")
        base = os.environ.get("CENTURION_PUBLIC_URL", "").rstrip("/")
        link = f"{base}/product/{slug}" if base else f"/product/{slug}"
        niche = (os.environ.get("CENTURION_NICHE", "") or "your work").strip()
        niche_short = niche.split(" for ")[0].strip() or niche  # "medical billing"
        if kind == "warm_email":
            platform = "Warm email to your own list/clients (you send it)"
            # Hand-built so it reads like a real, sendable note even on the
            # template engine (this is the highest-EV content in the system).
            draft = (
                f"Hi [first name],\n\n"
                f"Quick one — I put together a resource I thought might be useful "
                f"for your {niche_short} work: the {prod}.\n\n"
                f"It's a ready-to-use pack (templates + a short step-by-step) meant "
                f"to save you some back-and-forth. If it's handy, it's here:\n"
                f"{link}\n\n"
                f"No pressure at all — just sharing in case it helps. Happy to hear "
                f"what you think.\n\n"
                f"Best,\n[your name]")
            reason = "your warmest audience; you send from your own address"
        elif kind == "linkedin_post":
            platform = "LinkedIn post (you post from your account)"
            draft = (
                f"One thing that quietly eats time in {niche_short}: {cluster_keyword}.\n\n"
                f"A simple way to get ahead of it is to standardize it once — a clear "
                f"template and a short checklist you reuse every time, instead of "
                f"rebuilding it under pressure.\n\n"
                f"I packaged the full version as the {prod} if it's useful to anyone:\n"
                f"{link}")
            reason = "professional reach you already have; one tap to post"
        elif kind == "reddit_reply":
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
    # Neutralize quotes, backslashes, and angle brackets so a title/meta can't
    # break out of the JSON string or the surrounding <script> block.
    safe = (s or "").replace('\\', '').replace('"', "'").replace('<', ' ').replace('>', ' ')
    return '"' + safe + '"'
