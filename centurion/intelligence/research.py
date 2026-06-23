"""Opportunity Research + creative ideation.

Two jobs:
  1. Gather demand/competition/pricing signals (web search + parsing hooks)
     and have the Language Engine summarize them into structured briefs.
  2. Ideate — generate genuinely varied candidate opportunities using
     human-style creative heuristics rather than a single rigid formula.

The heuristics deliberately mirror how strong human founders think:
  * Analogy        — port a proven pattern from one niche into another.
  * Combination     — fuse two unrelated demands into one product.
  * First-principles— strip a need to its core and rebuild it cheaply.
  * Constraint flip — invert a usual constraint to find an unserved angle.
  * Trend-riding    — attach to a rising interest signal.
  * Pain-mining     — solve a sharp, specific frustration.

Crucially, ideation is divergent (the Language Engine / templates produce many
angles) but selection is convergent and numeric: the Decision Core scores and
ranks. Creativity proposes; the auditable math disposes. The numeric scoring
and ranking are NOT done by the language model.
"""
from __future__ import annotations

import hashlib
import random
from dataclasses import dataclass
from typing import List, Optional

from intelligence.decision_core.scoring import Opportunity
from intelligence.language.provider import LanguageProvider

# Seed material for divergent ideation. Real signals (web search, trends) can be
# merged into these pools at runtime; defaults keep the system productive offline.
NICHES = [
    "freelance designers", "indie game devs", "real-estate agents", "yoga studios",
    "newsletter writers", "Etsy sellers", "podcast hosts", "dog trainers",
    "Notion power users", "small law firms", "wedding planners", "Shopify owners",
    "coffee roasters", "personal trainers", "bookkeepers", "tattoo artists",
]
PAINS = [
    "wastes hours on repetitive setup", "struggles to price their work",
    "can't write compelling copy", "has no system for follow-ups",
    "loses leads in a messy inbox", "dreads invoicing", "fears blank-page syndrome",
    "can't keep content consistent", "reinvents the same doc every week",
]
FORMATS = [
    "Notion template system", "prompt pack", "fill-in-the-blank guide",
    "swipe file", "spreadsheet toolkit", "checklist bundle", "mini-course outline",
    "canva-style template set", "SOP playbook", "email sequence pack",
]
LENSES = ["analogy", "combination", "first-principles", "constraint-flip",
          "trend-riding", "pain-mining"]


@dataclass
class ResearchSignal:
    topic: str
    demand: str
    competition: str
    pricing: str
    source: str = "offline-prior"


class ResearchEngine:
    def __init__(self, language: LanguageProvider, seed: int = 42):
        self.language = language
        self.seed = seed

    # --- signal gathering (pluggable; offline-safe default) ---
    def gather_signals(self, strategy: str, n: int = 3) -> List[ResearchSignal]:
        """Hook point for real web search/parsing. Offline default returns
        stable synthetic signals so the system always has something to chew on.
        A WebSearch/WebFetch integration can replace this without touching
        callers."""
        rng = random.Random(f"{self.seed}:{strategy}")
        signals = []
        for _ in range(n):
            niche = rng.choice(NICHES)
            pain = rng.choice(PAINS)
            signals.append(ResearchSignal(
                topic=f"{niche} who {pain}",
                demand=rng.choice(["rising", "steady", "seasonal", "hot"]),
                competition=rng.choice(["low", "moderate", "crowded"]),
                pricing=rng.choice(["$5-15", "$9-29", "$19-49"]),
            ))
        return signals

    # --- creative, human-style ideation ---
    def ideate(self, strategy: str, capital: float, n: int = 6,
               lessons: Optional[List[dict]] = None) -> List[Opportunity]:
        """Generate n varied candidate opportunities using rotating creative
        lenses. Each lens produces a different *kind* of idea, the way a sharp
        human brainstorm would — not n minor variants of one idea.

        `lessons` (from LearningMemory) bias ideation away from past failures
        and toward past wins: the agent literally thinks with its scars.
        """
        rng = random.Random(self._seed_for(strategy, capital))
        avoid = self._avoid_terms(lessons)
        prefer = self._prefer_terms(lessons)
        signals = self.gather_signals(strategy, n=max(3, n // 2))
        opps: List[Opportunity] = []

        for i in range(n):
            lens = LENSES[i % len(LENSES)]
            sig = signals[i % len(signals)]
            idea = self._apply_lens(lens, sig, rng, prefer)
            if any(a in idea.lower() for a in avoid):
                # the agent steers clear of angles tied to prior failures
                idea = f"{idea} (reworked to avoid a prior dead end)"

            # Cost/return estimates are spend-light by design. Capital scales
            # gently with available budget but is bounded so ideation never
            # proposes a reckless bet — the Risk Manager enforces this anyway.
            est_capital = round(min(capital * rng.uniform(0.0, 0.08),
                                    rng.choice([0.0, 0.0, 1.5, 3.0, 5.0])), 2)
            est_return = round(est_capital * rng.uniform(2.0, 8.0)
                               + rng.uniform(8.0, 60.0), 2)
            opps.append(Opportunity(
                strategy=strategy,
                brief=f"[{lens}] {idea} | demand={sig.demand}, "
                      f"competition={sig.competition}, price={sig.pricing}",
                est_return=est_return,
                est_capital=est_capital,
                est_build_hours=round(rng.uniform(0.5, 6.0), 1),
                time_to_revenue_days=round(rng.uniform(0.5, 12.0), 1),
                opp_type=lens,
            ))
        return opps

    def _apply_lens(self, lens: str, sig: ResearchSignal, rng: random.Random,
                    prefer: List[str]) -> str:
        niche = sig.topic
        fmt = rng.choice(FORMATS)
        if lens == "analogy":
            other = rng.choice(NICHES)
            return f"Port the playbook that works for {other} into a {fmt} for {niche}"
        if lens == "combination":
            fmt2 = rng.choice(FORMATS)
            return f"Fuse a {fmt} with a {fmt2} so {niche} solve two problems in one buy"
        if lens == "first-principles":
            return f"Strip the need of {niche} to its core and rebuild it as a lean {fmt}"
        if lens == "constraint-flip":
            return f"A {fmt} for {niche} that assumes zero budget and ten free minutes"
        if lens == "trend-riding":
            hot = prefer[0] if prefer else "AI workflows"
            return f"A {fmt} riding {hot}, aimed squarely at {niche}"
        # pain-mining
        return f"A {fmt} that kills the single sharpest frustration of {niche}"

    def brief_for(self, opp: Opportunity) -> str:
        """Use the Language Engine to turn a raw idea into a tighter brief.
        Numeric scoring stays in the Decision Core; this only sharpens words."""
        schema = {"summary": "one-sentence opportunity summary",
                  "headline": "punchy product headline"}
        out = self.language.generate(
            f"Summarize this micro-business opportunity for {opp.strategy}: {opp.brief}",
            schema=schema)
        if isinstance(out, dict):
            return f"{out.get('headline','')} — {out.get('summary','')}".strip(" —")
        return str(out)

    # --- lesson-aware steering ---
    def _avoid_terms(self, lessons: Optional[List[dict]]) -> List[str]:
        terms = []
        for l in (lessons or []):
            if l.get("kind") in ("failure", "mistake", "guardrail"):
                terms += [w for w in (l.get("opp_type") or "").split() if w]
        return [t.lower() for t in terms]

    def _prefer_terms(self, lessons: Optional[List[dict]]) -> List[str]:
        return [l.get("opp_type") for l in (lessons or [])
                if l.get("kind") == "success" and l.get("opp_type")]

    def _seed_for(self, strategy: str, capital: float) -> int:
        h = hashlib.sha256(f"{self.seed}:{strategy}:{int(capital)}".encode()).hexdigest()
        return int(h[:8], 16)
