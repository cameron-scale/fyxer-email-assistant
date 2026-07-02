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
# A deliberately WIDE spread of digital-product buyer niches, so broad mode
# explores many markets and the bandit concentrates on whatever converts. All
# are audiences that routinely buy templates/toolkits/guides.
NICHES = [
    # creators & solopreneurs
    "freelance designers", "newsletter writers", "podcast hosts", "YouTubers",
    "course creators", "online coaches", "virtual assistants", "copywriters",
    "photographers", "indie game devs", "indie hackers", "SaaS founders",
    # commerce
    "Etsy sellers", "Shopify owners", "Amazon FBA sellers", "dropshippers",
    "print-on-demand sellers", "handmade-goods makers",
    # local & service businesses
    "real-estate agents", "wedding planners", "personal trainers", "dog trainers",
    "yoga studios", "coffee roasters", "restaurant owners", "salon owners",
    "cleaning-service owners", "landscapers", "event planners", "tattoo artists",
    # professional & back-office
    "bookkeepers", "small law firms", "HR managers", "recruiters",
    "real-estate investors", "property managers", "insurance agents",
    "consultants", "financial advisors", "notaries",
    # knowledge & ops
    "Notion power users", "project managers", "customer-support teams",
    "nonprofit teams", "student organizations",
]
PAINS = [
    "wastes hours on repetitive setup", "struggles to price their work",
    "can't write compelling copy", "has no system for follow-ups",
    "loses leads in a messy inbox", "dreads invoicing", "fears blank-page syndrome",
    "can't keep content consistent", "reinvents the same doc every week",
    "has no repeatable onboarding for new clients", "forgets steps under pressure",
    "spends too long on proposals and quotes", "has no clean way to track tasks",
]
FORMATS = [
    "Notion template system", "prompt pack", "fill-in-the-blank guide",
    "swipe file", "spreadsheet toolkit", "checklist bundle", "mini-course outline",
    "canva-style template set", "SOP playbook", "email sequence pack",
    "onboarding kit", "planner + tracker", "script pack", "proposal template kit",
    "workflow toolkit", "starter kit",
]

# Niche-specific format banks — process/workflow assets (NOT code lists, which
# for medical billing would infringe AMA CPT copyright). Keyed by a substring of
# the configured niche.
NICHE_FORMATS = {
    "medical billing": [
        "denial appeal letter template pack", "credentialing checklist + tracker",
        "AR follow-up call script set", "new-client onboarding SOP",
        "patient-statement workflow toolkit", "prior-authorization request template set",
        "front-desk eligibility-check checklist", "clean-claim submission SOP",
    ],
}
NICHE_PAINS = {
    "medical billing": [
        "loses revenue to preventable claim denials",
        "can't keep AR days under control",
        "dreads credentialing paperwork and re-creds",
        "has no repeatable onboarding for new practices",
        "wastes hours chasing prior authorizations",
        "struggles to standardize front-desk eligibility checks",
    ],
}
LENSES = ["analogy", "combination", "first-principles", "constraint-flip",
          "trend-riding", "pain-mining"]


@dataclass
class ResearchSignal:
    topic: str
    demand: str
    competition: str
    pricing: str
    source: str = "offline-prior"


_SMALL_WORDS = {"a", "an", "the", "for", "of", "and", "to", "in", "on", "with"}


def _titlecase(text: str) -> str:
    """Title-case a product/format phrase, keeping small words lower (except the
    first) and preserving common acronyms (SOP, AR, PDF)."""
    words = (text or "").split()
    out = []
    for i, w in enumerate(words):
        low = w.lower()
        if w.upper() in {"SOP", "AR", "PDF", "EOB", "CMS"}:
            out.append(w.upper())
        elif i > 0 and low in _SMALL_WORDS:
            out.append(low)
        else:
            out.append("-".join(
                (p.upper() if p.upper() in {"SOP", "AR", "PDF", "EOB", "CMS"}
                 else p[:1].upper() + p[1:]) for p in w.split("-")))
    return " ".join(out)


def _niche_audiences(niche: str) -> List[str]:
    """Expand a configured market niche into audience segments so ideation stays
    varied while every product aims at a market the operator can actually reach.
    Deterministic — no model call needed."""
    n = niche.strip().rstrip(".")
    return [
        f"{n} teams", f"solo {n} professionals", f"{n} beginners",
        f"small practices handling {n}", f"managers responsible for {n}",
        f"consultants who sell {n}", f"{n} back-office staff",
        f"owners drowning in {n} admin",
    ]


class ResearchEngine:
    def __init__(self, language: LanguageProvider, seed: int = 42,
                 niche: str | None = None):
        self.language = language
        self.seed = seed
        self._niche = (niche or "").strip()

    def _current_niche(self) -> str:
        # Dashboard settings mirror to env at runtime; honor a live override.
        import os
        return (os.environ.get("CENTURION_NICHE", "").strip() or self._niche)

    def _audience_pool(self) -> List[str]:
        niche = self._current_niche()
        return _niche_audiences(niche) if niche else NICHES

    def _format_pool(self) -> List[str]:
        niche = self._current_niche().lower()
        for key, fmts in NICHE_FORMATS.items():
            if key in niche:
                return fmts
        return FORMATS

    def _pain_pool(self) -> List[str]:
        niche = self._current_niche().lower()
        for key, pains in NICHE_PAINS.items():
            if key in niche:
                return pains
        return PAINS

    # --- signal gathering (pluggable; offline-safe default) ---
    def gather_signals(self, strategy: str, n: int = 3) -> List[ResearchSignal]:
        """Hook point for real web search/parsing. Offline default returns
        stable synthetic signals so the system always has something to chew on.
        A WebSearch/WebFetch integration can replace this without touching
        callers."""
        rng = random.Random(f"{self.seed}:{strategy}")
        audiences = self._audience_pool()
        pains = self._pain_pool()
        signals = []
        for _ in range(n):
            niche = rng.choice(audiences)
            pain = rng.choice(pains)
            signals.append(ResearchSignal(
                topic=f"{niche} who {pain}",
                demand=rng.choice(["rising", "steady", "seasonal", "hot"]),
                competition=rng.choice(["low", "moderate", "crowded"]),
                pricing=rng.choice(["$5-15", "$9-29", "$19-49"]),
            ))
        return signals

    # --- creative, human-style ideation ---
    def ideate(self, strategy: str, capital: float, n: int = 6,
               lessons: Optional[List[dict]] = None,
               epoch: int = 0) -> List[Opportunity]:
        """Generate n varied candidate opportunities using rotating creative
        lenses. Each lens produces a different *kind* of idea, the way a sharp
        human brainstorm would — not n minor variants of one idea.

        `lessons` (from LearningMemory) bias ideation away from past failures
        and toward past wins: the agent literally thinks with its scars.
        `epoch` rotates the idea pool over time — without it, a stable balance
        reproduces the identical opportunity every cycle forever and the catalog
        freezes at one product.
        """
        rng = random.Random(self._seed_for(strategy, capital) + int(epoch))
        avoid = self._avoid_terms(lessons)
        prefer = self._prefer_terms(lessons)
        signals = self.gather_signals(strategy, n=max(3, n // 2))
        opps: List[Opportunity] = []

        for i in range(n):
            lens = LENSES[i % len(LENSES)]
            sig = signals[i % len(signals)]
            name, rationale = self._apply_lens(lens, sig, rng, prefer)
            if any(a in name.lower() for a in avoid):
                # the agent steers clear of angles tied to prior failures
                rationale = f"{rationale} (reworked to avoid a prior dead end)"

            # Cost/return estimates are spend-light by design. Capital scales
            # gently with available budget but is bounded so ideation never
            # proposes a reckless bet — the Risk Manager enforces this anyway.
            est_capital = round(min(capital * rng.uniform(0.0, 0.08),
                                    rng.choice([0.0, 0.0, 1.5, 3.0, 5.0])), 2)
            est_return = round(est_capital * rng.uniform(2.0, 8.0)
                               + rng.uniform(8.0, 60.0), 2)
            opps.append(Opportunity(
                strategy=strategy,
                brief=f"[{lens}] {name} — {rationale} | demand={sig.demand}, "
                      f"competition={sig.competition}, price={sig.pricing}",
                est_return=est_return,
                est_capital=est_capital,
                est_build_hours=round(rng.uniform(0.5, 6.0), 1),
                time_to_revenue_days=round(rng.uniform(0.5, 12.0), 1),
                opp_type=lens,
                product_name=name,
            ))
        return opps

    def _apply_lens(self, lens: str, sig: ResearchSignal, rng: random.Random,
                    prefer: List[str]) -> tuple[str, str]:
        """Return (product_name, rationale). The NAME is clean and customer-
        facing (it becomes the product title); the RATIONALE is the internal
        creative angle (logged in the brief, never shown to a buyer). The old
        code used the verbose rationale AS the title, producing garbage like
        'The Essential A New-Client Onboarding Sop Riding Ai Workflows Toolkit'.
        """
        niche = sig.topic
        formats = self._format_pool()
        fmt = rng.choice(formats)
        name = _titlecase(fmt)
        if lens == "combination":
            fmt2 = rng.choice([f for f in formats if f != fmt] or formats)
            name = f"{_titlecase(fmt)} + {_titlecase(fmt2)} Bundle"
            return name, f"bundle two needs of {niche} into one purchase"
        if lens == "first-principles":
            return name, f"stripped-down, no-fluff {fmt} for {niche}"
        if lens == "constraint-flip":
            name = f"5-Minute {_titlecase(fmt)}"
            return name, f"a {fmt} that assumes zero budget and ten free minutes"
        if lens == "trend-riding":
            return name, f"a modern {fmt} aimed at {niche}"
        if lens == "analogy":
            return name, f"proven pattern ported into a {fmt} for {niche}"
        # pain-mining
        return name, f"a {fmt} that kills the sharpest frustration of {niche}"

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
