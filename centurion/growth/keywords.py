"""Keyword mapping for the Growth module.

From a product's job-to-be-done, expand into long-tail clusters across the five
intent types, and score each by intent strength x (1 - difficulty) so the
Decision Core can prioritize high-intent / low-difficulty clusters first.

Honest note: without a paid search-volume API this scoring is HEURISTIC
(deterministic from the phrase), not real search data. It's a sane prioritizer,
and `KeywordPlanner` exposes a hook to plug in real volume/difficulty later.
"""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from typing import List

INTENTS = ["problem", "comparison", "alternative", "best-for", "how-to"]

_TEMPLATES = {
    "problem":     ["how to fix {t}", "why does {t} keep happening", "{t} not working"],
    "comparison":  ["{t} vs {alt}", "{t} or {alt}"],
    "alternative": ["{t} alternatives", "free {t} alternative", "tools like {t}"],
    "best-for":    ["best {t} for beginners", "best {t} for small teams", "best {t} 2026"],
    "how-to":      ["how to {t}", "{t} step by step", "{t} checklist"],
}
_ALTS = ["spreadsheets", "doing it manually", "the usual way", "a generic template"]


def _h(s: str) -> int:
    return int(hashlib.sha256(s.encode()).hexdigest()[:8], 16)


@dataclass
class Cluster:
    intent: str
    keyword: str
    difficulty: float        # 0 (easy) .. 1 (hard)
    intent_strength: float   # 0 .. 1 (how purchase-ready)

    def ev(self) -> float:
        # high intent, low difficulty wins
        return round(self.intent_strength * (1.0 - self.difficulty), 4)


# Higher = more purchase-ready intent.
_INTENT_STRENGTH = {"problem": 0.6, "comparison": 0.85, "alternative": 0.8,
                    "best-for": 0.9, "how-to": 0.5}

# Curated real-world query banks by niche. Hand-picked queries beat title-
# mangled pseudo-keywords; these are things billers actually search. Copyright-
# and PHI-safe (process/workflow topics, not code lists). Keyed by niche substring.
NICHE_SEEDS = {
    "medical billing": [
        ("claim denial management checklist", "best-for", 0.86),
        ("how to appeal a denied insurance claim", "how-to", 0.7),
        ("timely filing appeal letter template", "how-to", 0.75),
        ("prior authorization request checklist", "best-for", 0.8),
        ("reduce AR days in medical billing", "problem", 0.72),
        ("medical credentialing checklist for new providers", "best-for", 0.82),
        ("patient statement workflow best practices", "how-to", 0.6),
        ("front desk insurance eligibility check steps", "how-to", 0.62),
        ("new client onboarding for billing companies", "best-for", 0.78),
        ("clean claim submission checklist", "best-for", 0.8),
    ],
}


class KeywordPlanner:
    def __init__(self, volume_fn=None):
        # volume_fn(keyword) -> (difficulty, strength) optional real-data hook.
        self.volume_fn = volume_fn

    def _core(self, topic: str) -> str:
        words = re.findall(r"[A-Za-z0-9]+", (topic or "").lower())
        # drop filler so the core "job" surfaces
        stop = {"a", "an", "the", "for", "to", "of", "and", "with", "who", "that",
                "your", "their", "in", "on"}
        core = [w for w in words if w not in stop][:4]
        return " ".join(core) or (topic or "this")

    def map(self, topic: str, per_intent: int = 2,
            niche: str = "") -> List[Cluster]:
        out: List[Cluster] = []
        # 1) Curated real queries for the niche come first (highest quality).
        nl = (niche or "").lower()
        for key, seeds in NICHE_SEEDS.items():
            if key in nl:
                for kw, intent, strength in seeds:
                    diff = 0.25 + (_h(kw) % 45) / 100.0     # curated => easier band
                    out.append(Cluster(intent, kw, round(diff, 2), round(strength, 2)))
                break
        # 2) Template expansion from the product's job-to-be-done (fills breadth).
        core = self._core(topic)
        for intent in INTENTS:
            tmpls = _TEMPLATES[intent]
            for i in range(min(per_intent, len(tmpls))):
                alt = _ALTS[_h(core + intent) % len(_ALTS)]
                kw = tmpls[i].format(t=core, alt=alt)
                if self.volume_fn:
                    diff, strength = self.volume_fn(kw)
                else:
                    diff = 0.2 + (_h(kw) % 70) / 100.0          # 0.2 .. 0.89
                    strength = _INTENT_STRENGTH[intent]
                out.append(Cluster(intent, kw, round(diff, 2), round(strength, 2)))
        out.sort(key=lambda c: c.ev(), reverse=True)
        return out
