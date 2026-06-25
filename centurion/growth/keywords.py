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

    def map(self, topic: str, per_intent: int = 2) -> List[Cluster]:
        core = self._core(topic)
        out: List[Cluster] = []
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
