"""Shorthand memory file — Centurion's own compact, append-and-reference brain.

A single plaintext file (default data/centurion.mem) that the agent reads at the
start of a cycle and appends to as it learns. It uses a deliberately terse,
self-defined shorthand so it is fast for the agent to parse and cheap on disk —
a few dozen bytes per memory instead of a verbose JSON row.

=== THE SHORTHAND (legend is written into the file header) ===
Each memory is ONE line:

    <t>|<k><s>[:<o>]|<w>|<txt>

  t   integer day-stamp (days since 2020-01-01) — coarse, tiny, sortable
  k   kind, one char:  F=fail  M=mistake  W=win  G=guardrail  R=research  I=insight
  s   strategy code:   dp dpr sa pod ca rr  (or '-' if none)
  o   optional opp-type code after ':'  (an comb fp cf tr pm  -> analogy, etc.)
  w   weight 0-9 (importance; higher = keep longer)
  txt compact free text, vowels optionally dropped, '~' = approx, '+'/'-' = up/down

Example line:
    2365|Wpod:cf|4|cnva tmplt etsy +20 lo-budgt angle wins

The file self-prunes: when it grows past `max_lines`, the lowest-weight, oldest
lines are dropped first, so the drive footprint stays bounded forever.
"""
from __future__ import annotations

import re
import time
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import List, Optional

_EPOCH = date(2020, 1, 1)

KIND_CODE = {"failure": "F", "mistake": "M", "success": "W", "win": "W",
             "guardrail": "G", "research": "R", "insight": "I"}
KIND_NAME = {"F": "fail", "M": "mistake", "W": "win", "G": "guardrail",
             "R": "research", "I": "insight"}

STRATEGY_CODE = {"digital_products": "dp", "service_arbitrage": "sa",
                 "print_on_demand": "pod", "content_affiliate": "ca",
                 "reselling_research": "rr"}
OPP_CODE = {"analogy": "an", "combination": "comb", "first-principles": "fp",
            "constraint-flip": "cf", "trend-riding": "tr", "pain-mining": "pm"}

HEADER = [
    "# Centurion shorthand memory. One memory per line:",
    "#   <t>|<k><s>[:<o>]|<w>|<txt>",
    "#   t=days-since-2020  k=F/M/W/G/R/I  s=dp/sa/pod/ca/rr/-  o=an/comb/fp/cf/tr/pm",
    "#   w=0-9 importance   txt=compact note (vowels may drop, ~approx, +/- up/down)",
    "# Append-only; self-prunes lowest-weight oldest lines past the cap.",
]
_HEADER_BLOCK = "\n".join(HEADER) + "\n"
_LINE_RE = re.compile(r"^(\d+)\|([FMWGRI])([a-z\-]+)(?::([a-z]+))?\|(\d)\|(.*)$")


def _daystamp(ts: Optional[float] = None) -> int:
    d = date.fromtimestamp(ts) if ts else date.today()
    return (d - _EPOCH).days


def _compact(text: str, limit: int = 80) -> str:
    """Lightly compress free text: collapse whitespace, drop most interior
    vowels from long words, trim. Keeps it readable but small."""
    text = re.sub(r"\s+", " ", text.strip())
    out_words = []
    for w in text.split(" "):
        if len(w) > 6 and w.isalpha():
            w = w[0] + re.sub(r"[aeiou]", "", w[1:])
        out_words.append(w)
    s = " ".join(out_words)
    return s[:limit]


@dataclass
class MemoryLine:
    t: int
    kind: str          # single char
    strategy: str      # code or '-'
    opp: Optional[str]
    weight: int
    text: str

    def encode(self) -> str:
        o = f":{self.opp}" if self.opp else ""
        return f"{self.t}|{self.kind}{self.strategy}{o}|{self.weight}|{self.text}"

    def human(self) -> str:
        o = f"/{self.opp}" if self.opp else ""
        return f"[{KIND_NAME.get(self.kind, self.kind)}] {self.strategy}{o} (w{self.weight}): {self.text}"


class ShorthandMemory:
    def __init__(self, path: str | Path, max_lines: int = 2000):
        self.path = Path(path)
        self.max_lines = max_lines
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if not self.path.exists():
            self.path.write_text(_HEADER_BLOCK)

    # --- append ---
    def add(self, kind: str, text: str, strategy: Optional[str] = None,
            opp_type: Optional[str] = None, weight: float = 1.0) -> MemoryLine:
        line = MemoryLine(
            t=_daystamp(),
            kind=KIND_CODE.get(kind.lower(), "I"),
            strategy=STRATEGY_CODE.get(strategy or "", strategy or "-") if strategy else "-",
            opp=OPP_CODE.get(opp_type or "", opp_type) if opp_type else None,
            weight=max(0, min(9, int(round(weight)))),
            text=_compact(text),
        )
        with self.path.open("a") as f:
            f.write(line.encode() + "\n")
        self._maybe_prune()
        return line

    # --- read / reference ---
    def lines(self) -> List[MemoryLine]:
        out = []
        for raw in self.path.read_text().splitlines():
            if raw.startswith("#") or not raw.strip():
                continue
            m = _LINE_RE.match(raw)
            if not m:
                continue
            t, k, s, o, w, txt = m.groups()
            out.append(MemoryLine(int(t), k, s, o, int(w), txt))
        return out

    def recall(self, strategy: Optional[str] = None, limit: int = 10) -> List[MemoryLine]:
        """Return the most useful memories (weight, then recency), optionally
        filtered to a strategy. This is what the agent references each cycle."""
        code = STRATEGY_CODE.get(strategy or "", strategy or None)
        items = self.lines()
        if code:
            items = [l for l in items if l.strategy == code or l.strategy == "-"]
        items.sort(key=lambda l: (l.weight, l.t), reverse=True)
        return items[:limit]

    def render_digest(self, limit: int = 10) -> str:
        return "\n".join(l.human() for l in self.recall(limit=limit))

    def size_bytes(self) -> int:
        return self.path.stat().st_size if self.path.exists() else 0

    # --- self-pruning to bound disk usage ---
    def _maybe_prune(self) -> None:
        lines = self.lines()
        if len(lines) <= self.max_lines:
            return
        # keep the highest-weight, most-recent lines
        lines.sort(key=lambda l: (l.weight, l.t), reverse=True)
        keep = lines[: self.max_lines]
        # restore chronological order for readability
        keep.sort(key=lambda l: l.t)
        self.path.write_text(_HEADER_BLOCK + "\n".join(l.encode() for l in keep) + "\n")
