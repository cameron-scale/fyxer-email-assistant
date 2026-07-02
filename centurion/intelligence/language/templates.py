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


_TITLE_SUFFIXES = (
    ": an honest comparison", ": a practical shortlist", " — and how to fix it",
    " - and how to fix it", ": what it means", ": a real-world walkthrough",
    ": a real world walkthrough",
)


def _short_subject(topic: str) -> str:
    """Turn a long page TITLE into a short, readable subject noun so section
    bodies don't jam the whole headline into every sentence. Strips the template
    suffix, then trims at the first natural break so it reads as a thing, not a
    sentence. Deterministic."""
    t = (topic or "").strip()
    low = t.lower()
    for suf in _TITLE_SUFFIXES:
        if low.endswith(suf):
            t = t[: len(t) - len(suf)].strip()
            break
    # Cut at the first connector so "X or Y", "X for Z", "X vs Y" -> "X".
    for sep in (" or ", " vs ", " versus ", " for ", ": ", " — ", " – "):
        i = t.lower().find(sep)
        if i > 4:
            t = t[:i].strip()
            break
    words = t.split()
    if len(words) > 6:
        t = " ".join(words[:6])
    return (t or "this").rstrip(",.").lower()


def _section_body(heading: str, topic: str) -> str:
    """Distinct, section-appropriate body text (deterministic). Every section
    heading used by the content templates gets its OWN body, so a page never
    repeats a paragraph. Uses a short subject (not the full title) so sentences
    read naturally. Still template-grade — real depth needs the local model via
    the bridge."""
    h = (heading or "").lower()
    s = _short_subject(topic)

    # --- glossary ---
    if "definition" in h or "what it means" in h or "what is" in h:
        return (f"Put simply, {s} is the repeatable way you handle a recurring task "
                f"without reinventing it each time. In practice it's a short process "
                f"plus a reusable template and a final check, so the result comes out "
                f"the same whether you're fresh or slammed. Defining it once is what "
                f"makes every run after it fast.")
    if "related" in h or "terms" in h:
        return ("A few neighbouring ideas are worth knowing. The checklist is the "
                "minimum set of steps you never skip. The template is the reusable "
                "shell you fill in. The review is the quick final pass before "
                "anything goes out. Used together, they're what turn a one-off effort "
                "into something dependable.")

    # --- problem-solution (problem and fix must NOT collide) ---
    if "problem" in h:
        return (f"The pain usually looks familiar: {s} takes longer than it should, "
                f"the output isn't consistent, and there's no single source of truth "
                f"to point to. Every round starts a little from scratch, so small "
                f"mistakes creep back in. The cost isn't one big failure — it's the "
                f"steady drip of redone work.")
    if "why" in h and ("happen" in h or "it" in h):
        return (f"It happens because the process lives in your head, not on paper. "
                f"When {s} is ad-hoc, each person does it slightly differently and "
                f"details get re-decided every time. That's fine once; across a busy "
                f"month it quietly eats hours and makes quality a coin flip.")
    if "fix" in h or "solution" in h:
        return ("The fix isn't more effort — it's doing it once, well, and reusing "
                "that. Write the process down, cut it to the steps that actually "
                "matter, and turn the repeatable part into a template. From then on "
                "you're filling in blanks instead of starting cold, and the result "
                "stays even no matter who runs it.")

    # --- steps / setup / how-to ---
    if "step" in h or "set it up" in h or "setup" in h or "how to" in h or "quick start" in h:
        return ("1) Write down the exact steps you take today, in order. "
                "2) Cut anything that isn't load-bearing. "
                "3) Turn what's left into a template you fill in. "
                "4) Add one final check before it ships. "
                "5) Reuse it every time instead of rebuilding from memory. "
                "Fifteen minutes now saves the same fifteen on every future run.")

    # --- use-case ---
    if "scenario" in h:
        return (f"Picture a normal Monday with {s} on your plate. Instead of staring "
                f"at a blank page, you open the template, fill the two or three fields "
                f"that change this time, and run the checklist. What used to be a "
                f"half-day of deciding-as-you-go becomes a few focused minutes.")
    if "what good" in h or "good looks" in h:
        return (f"Good {s} is boring in the best way: predictable, quick, and easy to "
                f"hand off. You can tell it's working when someone else could pick it "
                f"up and get the same result without asking you a dozen questions. "
                f"If it still needs your head every time, it isn't finished.")

    # --- comparison ---
    if "honest comparison" in h or ("compar" in h and "how" not in h):
        return (f"The realistic options for {s} mostly differ on three things: how "
                f"long they take to set up, how much they bend to your workflow, and "
                f"how locked-in you get. There's rarely a single winner — there's the "
                f"one that fits how you actually work, and several that look good on "
                f"paper but sit unused.")
    if "where" in h and "fit" in h:
        return (f"Each approach has a sweet spot. The lightweight one wins when you "
                f"value speed and low friction over bells and whistles. The heavier "
                f"one earns its keep only if you'll genuinely use the extra features. "
                f"Match the choice to your volume and how often {s} actually comes up.")
    if "how to choose" in h or "choose" in h:
        return ("Choose for the workflow you have, not the one you wish you had. "
                "Favour whatever you'll still be using in a month over the longest "
                "feature list. If two options are close, pick the one with less setup "
                "— low friction is what keeps a system alive.")

    # --- roundup ---
    if "shortlist" in h:
        return (f"Here's the short version for {s}: a handful of solid options cover "
                f"almost everyone, and the rest is noise. This shortlist sticks to "
                f"ones that are quick to start and easy to keep using, rather than "
                f"whatever happens to be trending this week.")
    if "look for" in h or "what to look" in h:
        return ("When you're weighing options, look for three things: how fast you "
                "can get going, whether it fits your existing workflow, and how easy "
                "it is to walk away if it's not working. Anything that scores well on "
                "all three tends to stick; anything that fails one usually gets "
                "abandoned.")
    if "who" in h and ("for" in h or "each" in h):
        return ("Who each one is for comes down to volume and taste. If you only do "
                "this occasionally, the simplest option is plenty. If it's a core "
                "part of your week, it's worth the one that scales. Be honest about "
                "which camp you're in — most people over-buy.")

    # --- example ---
    if "example" in h or "walkthrough" in h:
        return (f"Here's it in action. You start {s}, open the template, and fill "
                f"only the parts that change this time. You run the short checklist, "
                f"catch the one thing you'd otherwise forget, and you're done — same "
                f"quality, a fraction of the thinking.")

    # --- generic fallback (still subject-specific, never a repeated boilerplate) ---
    return (f"The practical takeaway for {s}: keep it to a short, reusable process "
            f"you can run on autopilot, with one final check so quality stays even. "
            f"Do it properly once and it quietly pays you back on every run after.")


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
