"""TemplateProvider: zero-ML, fully deterministic copy generation.

Fills text from templates keyed off the prompt's intent. Used as the default
provider so the entire system runs end to end with no model loaded, and as a
cheap fallback when inference budget is exhausted. Same input -> same output.
"""
from __future__ import annotations

import hashlib
import re
from typing import Any, Dict, Optional

from .provider import LanguageProvider


def _slug(text: str, n: int = 5) -> str:
    words = re.findall(r"[A-Za-z0-9]+", text.lower())
    return "-".join(words[:n]) or "item"


_TC_SMALL = {"a", "an", "the", "for", "of", "and", "to", "in", "on", "with", "+"}


def _cap_part(p: str) -> str:
    if p.upper() in {"SOP", "AR", "PDF", "EOB", "CMS"}:
        return p.upper()
    return p[:1].upper() + p[1:] if p else p


def _titlecase_words(text: str) -> str:
    words = (text or "").split()
    out = []
    for i, w in enumerate(words):
        if w.upper() in {"SOP", "AR", "PDF", "EOB", "CMS"}:
            out.append(w.upper())
        elif i > 0 and w.lower() in _TC_SMALL:
            out.append(w.lower())
        else:
            # capitalize each hyphen-separated part: "new-client" -> "New-Client"
            out.append("-".join(_cap_part(p) for p in w.split("-")))
    return " ".join(out)


def _stable_pick(options: list[str], seed_text: str) -> str:
    h = int(hashlib.sha256(seed_text.encode()).hexdigest(), 16)
    return options[h % len(options)]


def _section_body(heading: str, topic: str) -> str:
    """Distinct, section-appropriate body text (deterministic). Different section
    headings get different framing so a page never repeats one paragraph. This is
    still template-grade — real depth needs the local model via the bridge."""
    h = (heading or "").lower()
    t = topic
    if any(w in h for w in ("definition", "what it means", "what is", "glossary")):
        return (f"In plain terms, {t} is the repeatable way a team handles this "
                f"without reinventing it each time. It usually combines a short "
                f"process, a reusable template, and a check at the end so nothing "
                f"slips. Getting it defined once is what makes it fast later.")
    if any(w in h for w in ("why", "matters", "important")):
        return (f"When {t} is ad-hoc, small mistakes compound: rework, missed "
                f"steps, and time lost re-deciding the same things. Standardizing "
                f"it protects your hours and makes the output consistent even on a "
                f"busy day. That consistency is the real payoff.")
    if any(w in h for w in ("step", "how to", "quick start", "set it up", "setup")):
        return ("1) List the exact steps you take today, in order. "
                "2) Cut anything that isn't load-bearing. "
                "3) Turn what's left into a template you fill in. "
                "4) Add one final check before it goes out. "
                "5) Reuse it every time instead of starting from scratch.")
    if any(w in h for w in ("example", "walkthrough", "scenario", "use case", "real-world")):
        return (f"Say you're starting {t} on a Monday. You open the template, fill "
                f"the three fields that change each time, run the checklist, and "
                f"you're done in minutes — not the half-day it used to take. Same "
                f"quality, far less thinking.")
    if any(w in h for w in ("compare", "comparison", "vs", "choose", "shortlist", "roundup", "look for")):
        return (f"The options for {t} mostly differ on setup time, flexibility, and "
                f"how much they lock you in. Favor the one you'll actually keep "
                f"using: low friction beats feature lists you'll never touch. Pick "
                f"for the workflow you have, not the one you wish you had.")
    if any(w in h for w in ("problem", "fix", "trouble")):
        return (f"The problem usually shows up as {t} eating time it shouldn't — "
                f"redone work, inconsistent results, and no single source of truth. "
                f"The fix isn't more effort; it's doing it once, well, and reusing "
                f"that. Small system, big time-back.")
    if any(w in h for w in ("related", "terms")):
        return (f"Nearby ideas worth knowing: the checklist (the minimum steps you "
                f"never skip), the template (the reusable shell), and the review "
                f"(the final pass). Together they're what make {t} dependable "
                f"instead of a coin flip.")
    if any(w in h for w in ("template", "checklist", "core", "system", "what good")):
        return (f"The core of {t} is a short, reusable shell plus a checklist. Keep "
                f"the shell to the fields that actually change, and keep the "
                f"checklist to the steps you refuse to skip. If it's longer than a "
                f"page, it won't get used.")
    if any(w in h for w in ("next", "after")):
        return (f"From here, use it on the very next real task so it earns its keep. "
                f"Tweak it once after that first run, then leave it alone. The goal "
                f"isn't a perfect {t} system — it's one you'll actually reuse.")
    # fallback (still topic-specific, not a repeated boilerplate)
    return (f"Here's the practical part for {t}: keep it to a short, reusable "
            f"process you can run without thinking, and a final check so quality "
            f"stays even. Do it once properly and it pays back every time after.")


class TemplateProvider(LanguageProvider):
    name = "template"

    def generate(self, prompt: str, schema: Optional[Dict[str, Any]] = None
                 ) -> Dict[str, Any] | str:
        topic = self._extract_topic(prompt)
        if schema:
            return {key: self._field(key, topic, prompt) for key in schema}
        return self._field("text", topic, prompt)

    def _extract_topic(self, prompt: str) -> str:
        # Prefer the LAST "about …" — asset prompts read "… for {strategy}
        # about {topic}", so a greedy first match on "for" used to grab the
        # strategy name and every product came out titled the same. Quoted
        # titles ('…') beat everything when present.
        q = re.findall(r"[\"']([^\"']{3,80})[\"']", prompt)
        if q:
            return q[-1].strip().rstrip(".")
        m = re.findall(r"\babout\s+([A-Za-z0-9 ,'&-]{3,80})", prompt)
        if m:
            return m[-1].strip().rstrip(".")
        m = re.findall(r"\b(?:for|on)\s+([A-Za-z0-9 ,'&-]{3,80})", prompt)
        if m:
            return m[-1].strip().rstrip(".")
        return " ".join(prompt.split()[:6]) or "your niche"

    def _field(self, key: str, topic: str, prompt: str) -> str:
        key_l = key.lower()
        if "title" in key_l or "headline" in key_l or "name" in key_l:
            t = topic.strip()
            # If the topic already reads as a finished product name, use it as-is
            # (title-cased) — don't wrap it into "The … Toolkit" gibberish.
            if re.search(r"\b(pack|kit|toolkit|checklist|sop|template|templates|"
                         r"tracker|bundle|guide|script|scripts|playbook|planner|"
                         r"worksheet|system|set|cheatsheet)s?\b", t, re.I):
                return _titlecase_words(t)
            adj = _stable_pick(["Essential", "Practical", "Complete", "Pro"], topic)
            return f"The {adj} {topic.title()} Toolkit"
        if "summary" in key_l or "brief" in key_l:
            return (f"A focused offering targeting demand around {topic}. "
                    f"Low capital to launch, clear value, fast to publish.")
        if "description" in key_l or "copy" in key_l or "body" in key_l:
            return (f"Save hours on {topic}. This pack gives you a ready-to-use "
                    f"system: clear templates, step-by-step guidance, and examples "
                    f"you can apply today. One-time purchase, yours to keep.")
        if "price" in key_l:
            return _stable_pick(["9", "12", "19", "24"], topic)
        if "tags" in key_l or "keywords" in key_l:
            base = _slug(topic, 3).split("-")
            return ", ".join(base + ["template", "guide", "digital"])
        if "slug" in key_l or "handle" in key_l:
            return _slug(topic)
        if "cta" in key_l or "call_to_action" in key_l:
            return f"Get the {topic.title()} Toolkit"
        # generic body text — SECTION-SPECIFIC so different headings never
        # produce the identical paragraph (that reads as spam and never ranks).
        # The section heading is the FIRST quoted string in the prompt; the topic
        # is the last. Still template-grade, but distinct and clean.
        quoted = re.findall(r"'([^']{2,80})'", prompt)
        heading = quoted[0].strip() if len(quoted) >= 2 else ""
        return _section_body(heading, topic)

    def available(self) -> bool:
        return True
