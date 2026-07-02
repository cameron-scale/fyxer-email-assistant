"""Content guardrails for the Growth module — enforced on EVERY generated asset.

Hard rules from the Growth spec:
  * No income / earnings / results claims (including implied).
  * No fabricated reviews, testimonials, ratings, social proof, or user counts.
  * No near-duplicate mass content (checked against what's already published).
"""
from __future__ import annotations

import re

# Income / results CLAIMS. Tightened to income FRAMING (a promise of money to
# the reader), so legitimate operational vocabulary in a billing niche — "$25
# copay", "appeals per month", "denial results" — is not falsely gutted, while
# real claims ("make $5,000 a month", "guaranteed income") still hard-fail.
_INCOME = [
    # $ / number framed as money made (any period, incl. year).
    r"\b(make|earn|generate|pocket|bank|add|save)\s+\$?\s*\d",
    r"\$\s*\d[\d,]*\s*(?:\+|k)?\s*(?:a|per|/)\s*(?:day|week|month|hour|year)",
    # income CLAIM: a promise verb applied to the reader's money/profit/revenue.
    r"\b(make|earn|boost|increase|double|triple|grow|maximize|unlock|generate|drive|explode)\s+"
    r"(?:you\s+|your\s+|more\s+|extra\s+|big\s+){0,2}"
    r"(money|profit|profits|income|revenue|earnings|earning|cash|sales)\b",
    # earning-* forms and start/keep earning.
    r"\b(start|begin|keep|start\s+to)\s+earning\b",
    r"\bearn(?:ing)?\s+(?:thousands|hundreds|millions|money|more|passive|big|\$)\b",
    r"\bearning potential\b",
    # profit/results framed as a promised outcome.
    r"\bprofits?\s+(?:from day one|on autopilot|guaranteed|immediately|fast|overnight)\b",
    r"\b(profit|income|earnings|revenue|returns?)\s+(guarantee|guaranteed|explosion|on autopilot)\b",
    r"\bmake money\b", r"\bpassive income\b", r"\bget rich\b", r"\bget paid\b",
    r"\bguaranteed (?:income|profit|results|returns?)\b",
    r"\b(?:proven|guaranteed|real|life-changing)\s+results\b",
    r"\b\d+\s*%\s*(roi|return|more revenue|more profit|more income)\b", r"\bmillionaire\b",
    r"\bquit your job\b", r"\bfinancial freedom\b",
]

# Regulated-niche prohibitions. CPT is AMA-copyrighted IP — auto-generated code
# lists/cheat-sheets are an infringement risk a claim guard can't see. We also
# refuse anything implying handling of patient data (PHI/BAA territory), which is
# never something an autonomous agent should offer.
_REGULATED = [
    r"\bcpt\b.{0,20}(cheat\s*sheet|code list|codes list|lookup table|master list)",
    r"\b(list|table|sheet) of cpt codes?\b", r"\bcpt code (list|table|database)\b",
    r"\bhcpcs\b.{0,20}(list|table|cheat)", r"\b(icd-?10)\b.{0,20}(full list|complete list|database)",
    r"\bwe(?:'ll| will)? (?:work|handle|manage|process) your (?:claims?|denials?|patient)",
    r"\bsend us your (?:patient|phi|claim) data\b",
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
    for pat in _REGULATED:
        if re.search(pat, low):
            return False, f"regulated-content risk ({pat})"
    return True, "ok"


def brand_safe(text: str, brand: str) -> bool:
    """False if the operator's real brand name appears in publishable text — that
    must route to a human, never auto-publish (protects the operator's name)."""
    b = (brand or "").strip().lower()
    return not b or b not in (text or "").lower()


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
