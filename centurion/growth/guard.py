"""Content guardrails for the Growth module — enforced on EVERY generated asset.

Hard rules from the Growth spec:
  * No income / earnings / results claims (including implied).
  * No fabricated reviews, testimonials, ratings, social proof, or user counts.
  * No near-duplicate mass content (checked against what's already published).
"""
from __future__ import annotations

import re

# Income / results claims (and common implied forms).
_INCOME = [
    r"\$\s*\d", r"\bmake money\b", r"\bearn(ing)?\b", r"\bincome\b", r"\bprofit",
    r"\bpassive income\b", r"\bget rich\b", r"\bguarantee", r"\brefund.*if",
    r"\bper (day|week|month|year)\b", r"\b\d+\s*%\s*(roi|return)\b", r"\bresults\b",
    r"\bmillionaire\b", r"\bquit your job\b", r"\bfinancial freedom\b",
]
# Fabricated social proof.
_PROOF = [
    r"\b\d+[\d,]*\+?\s*(users|customers|sales|downloads|members|people)\b",
    r"\b\d(\.\d)?\s*(star|stars)\b", r"\btestimonial", r"\breviews? say\b",
    r"\brated\b", r"\bbestselling\b", r"\b#1\b", r"\bthousands of\b",
    r"\bloved by\b", r"\bas seen on\b",
]


def check(text: str) -> tuple[bool, str]:
    """Return (ok, reason). ok=False means the asset must NOT be published."""
    low = (text or "").lower()
    for pat in _INCOME:
        if re.search(pat, low):
            return False, f"income/results claim ({pat})"
    for pat in _PROOF:
        if re.search(pat, low):
            return False, f"fabricated social proof ({pat})"
    return True, "ok"


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9 ]", "", (text or "").lower())


def is_near_duplicate(text: str, existing: list[str], threshold: float = 0.8) -> bool:
    """Jaccard token overlap vs already-published assets — blocks mass-posting
    of identical/near-identical content."""
    toks = set(_norm(text).split())
    if not toks:
        return False
    for ex in existing:
        et = set(_norm(ex).split())
        if not et:
            continue
        inter = len(toks & et)
        union = len(toks | et) or 1
        if inter / union >= threshold:
            return True
    return False
