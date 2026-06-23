"""Guardrail Engine: legal / ToS, no-obligation, and prohibited-strategy checks.

Runs before any action executes, at EVERY autonomy level. An action that fails
any check is rejected and logged — never queued for a human to override. The
ranking is absolute: guardrails outrank the goal, always.

An Action is a lightweight dict-like with fields:
  strategy, description, cost, recurring (bool), creates_obligation (bool),
  obligation_detail (str), legality (str: 'clear'|'unclear'|'prohibited'),
  tos_compliant (bool|None where None == unknown), reversible (bool),
  rationale (str)
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

# Hard-blocked regardless of autonomy level or profitability.
PROHIBITED_STRATEGIES = {
    "fraud", "deception", "fake reviews", "fake engagement", "review fraud",
    "scraping behind auth", "auth scraping", "spam", "spam blasting",
    "market manipulation", "pump and dump", "pump-and-dump", "mlm",
    "multi-level marketing", "pyramid", "counterfeit", "impersonation",
    "phishing", "stolen", "carding", "money laundering", "ponzi",
}

# Substrings that, if found in an action description, signal a prohibited tactic.
PROHIBITED_KEYWORDS = [
    "fake review", "fake reviews", "fake engagement", "buy followers",
    "bot follower", "pump and dump", "pump-and-dump", "scrape behind login",
    "scrape behind auth", "bypass login", "spam blast", "mass dm", "mass email blast",
    "impersonate", "counterfeit", "phishing", "fake testimonial", "astroturf",
    "click farm", "credential stuffing", "stolen card", "launder",
]

# Words that suggest an ongoing financial obligation beyond a one-time spend.
OBLIGATION_KEYWORDS = [
    "subscription", "subscribe", "recurring", "monthly plan", "annual plan",
    "auto-renew", "autorenew", "credit line", "loan", "financing", "installment",
    "contract", "retainer", "lease", "per month", "/mo", "billed monthly",
    "billed annually",
]


@dataclass
class Action:
    strategy: str
    description: str
    cost: float = 0.0
    recurring: bool = False
    creates_obligation: bool = False
    obligation_detail: str = ""
    legality: str = "clear"            # 'clear' | 'unclear' | 'prohibited'
    tos_compliant: Optional[bool] = True  # None == genuinely unknown -> skip
    reversible: bool = False
    rationale: str = ""
    meta: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "Action":
        known = {f for f in cls.__dataclass_fields__ if f != "meta"}
        kwargs = {k: v for k, v in d.items() if k in known}
        meta = {k: v for k, v in d.items() if k not in known}
        return cls(meta=meta, **kwargs)


@dataclass
class GuardrailResult:
    allowed: bool
    reason: str
    skipped: bool = False  # True when we deliberately skip (unclear) vs hard-reject

    def __bool__(self) -> bool:
        return self.allowed


class GuardrailEngine:
    def __init__(self, config: Optional[dict] = None):
        self.cfg = config or {}

    def check(self, action: Action) -> GuardrailResult:
        text = f"{action.strategy} {action.description} {action.obligation_detail}".lower()

        # 1. Prohibited strategy — hard block, any autonomy level.
        for name in PROHIBITED_STRATEGIES:
            if name in action.strategy.lower():
                return GuardrailResult(False, f"prohibited strategy: '{name}'")
        for kw in PROHIBITED_KEYWORDS:
            if kw in text:
                return GuardrailResult(False, f"prohibited tactic detected: '{kw}'")

        # 2. Explicit legality flag.
        if action.legality == "prohibited":
            return GuardrailResult(False, "action flagged as illegal")
        if action.legality == "unclear":
            # Skip and move on; never block waiting on a human.
            return GuardrailResult(False, "legality unclear — skipping and logging", skipped=True)

        # 3. ToS compliance. None == genuinely unknown -> skip.
        if action.tos_compliant is None:
            return GuardrailResult(False, "ToS compliance unknown — skipping and logging",
                                   skipped=True)
        if action.tos_compliant is False:
            return GuardrailResult(False, "violates platform terms of service")

        # 4. No obligation beyond funded capital.
        if action.recurring or action.creates_obligation:
            return GuardrailResult(False,
                                   "creates recurring charge / obligation beyond capital: "
                                   f"{action.obligation_detail or 'unspecified'}")
        for kw in OBLIGATION_KEYWORDS:
            if kw in text:
                return GuardrailResult(False,
                                       f"action implies ongoing obligation ('{kw}'); "
                                       "only one-time spends within budget are allowed")

        return GuardrailResult(True, "ok")
