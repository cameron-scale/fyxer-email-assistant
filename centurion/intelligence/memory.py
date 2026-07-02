"""Learning memory: Centurion's persistent experience.

This is what makes the agent "constantly learning from its own failures and
mistakes". Two complementary mechanisms:

  1. The Thompson bandit (decision_core/bandit.py) learns the *numbers* —
     which strategies and opportunity types actually return capital.
  2. This module learns the *lessons* — durable, human-readable notes drawn
     from real outcomes (a guardrail trip, a failed listing, a flat strategy,
     a winning angle) plus any external research worth remembering.

Every cycle, the orchestrator records what happened here and pulls back the
lessons most relevant to what it is about to attempt, so mistakes are not
repeated and wins are reinforced. It is grounded, auditable learning — not a
claim of literal consciousness, but a real, improving feedback loop.

Stored in SQLite alongside the ledger so it survives restarts on your PC.
"""
from __future__ import annotations

import json
import time
from dataclasses import dataclass
from typing import List, Optional

from ledger import Ledger

LESSONS_SCHEMA = """
CREATE TABLE IF NOT EXISTS lessons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts REAL NOT NULL,
    kind TEXT NOT NULL,            -- failure | mistake | success | research | guardrail
    strategy TEXT,
    opp_type TEXT,
    lesson TEXT NOT NULL,          -- the durable takeaway
    weight REAL NOT NULL DEFAULT 1.0,
    evidence TEXT                  -- json blob: what produced this lesson
);
CREATE INDEX IF NOT EXISTS idx_lessons_strategy ON lessons(strategy);
CREATE INDEX IF NOT EXISTS idx_lessons_kind ON lessons(kind);
"""


@dataclass
class Lesson:
    kind: str
    lesson: str
    strategy: Optional[str] = None
    opp_type: Optional[str] = None
    weight: float = 1.0
    evidence: Optional[dict] = None


class LearningMemory:
    def __init__(self, ledger: Ledger, shorthand_path=None):
        self.ledger = ledger
        with self.ledger._tx() as conn:  # reuse the ledger's connection mgmt
            conn.executescript(LESSONS_SCHEMA)
        # Compact, append-and-reference shorthand memory file (see
        # shorthand_memory.py). Lives next to the DB by default.
        self.shorthand = None
        try:
            from intelligence.shorthand_memory import ShorthandMemory
            from pathlib import Path
            path = shorthand_path or Path(ledger.db_path).with_suffix(".mem")
            self.shorthand = ShorthandMemory(path)
        except Exception:
            self.shorthand = None

    def record(self, lesson: Lesson) -> int:
        with self.ledger._tx() as conn:
            cur = conn.execute(
                "INSERT INTO lessons (ts, kind, strategy, opp_type, lesson, weight, "
                "evidence) VALUES (?,?,?,?,?,?,?)",
                (time.time(), lesson.kind, lesson.strategy, lesson.opp_type,
                 lesson.lesson, float(lesson.weight),
                 json.dumps(lesson.evidence or {})),
            )
            lid = int(cur.lastrowid)
        # Mirror into the shorthand file the agent reads each cycle.
        if self.shorthand is not None:
            try:
                self.shorthand.add(lesson.kind, lesson.lesson, lesson.strategy,
                                   lesson.opp_type, lesson.weight)
            except Exception:
                pass
        return lid

    # --- convenience recorders the orchestrator uses every cycle ---
    def learn_failure(self, strategy: str, detail: str, evidence: dict | None = None,
                      opp_type: str | None = None) -> None:
        self.record(Lesson("failure", detail, strategy, opp_type, weight=1.5,
                           evidence=evidence))

    def learn_mistake(self, strategy: str, detail: str, evidence: dict | None = None) -> None:
        self.record(Lesson("mistake", detail, strategy, weight=2.0, evidence=evidence))

    def learn_success(self, strategy: str, detail: str, evidence: dict | None = None,
                      opp_type: str | None = None) -> None:
        self.record(Lesson("success", detail, strategy, opp_type, weight=1.2,
                           evidence=evidence))

    def learn_guardrail(self, strategy: str, reason: str, evidence: dict | None = None) -> None:
        self.record(Lesson("guardrail", f"Blocked: {reason}", strategy, weight=3.0,
                           evidence=evidence))

    def learn_research(self, topic: str, insight: str, evidence: dict | None = None) -> None:
        self.record(Lesson("research", insight, weight=1.0,
                           evidence={"topic": topic, **(evidence or {})}))

    def note(self, text: str, strategy: str | None = None, weight: float = 1.0) -> None:
        """Free-form notebook entry — a thought, plan, or observation Centurion
        jots for itself to read back later."""
        self.record(Lesson("insight", text, strategy, weight=weight))

    # --- the notebook (compact shorthand file) ---
    def notebook_digest(self, limit: int = 10) -> str:
        if self.shorthand is None:
            return "(notebook unavailable)"
        return self.shorthand.render_digest(limit=limit)

    def notebook_path(self):
        return getattr(self.shorthand, "path", None)

    def notebook_size(self) -> int:
        return self.shorthand.size_bytes() if self.shorthand else 0

    # --- retrieval used to inform the next decision ---
    def relevant(self, strategy: Optional[str] = None, limit: int = 8) -> List[dict]:
        """Return the most relevant, recent, heavily-weighted lessons. Recency
        and weight both matter so painful mistakes stay salient."""
        if strategy:
            rows = self.ledger._conn().execute(
                "SELECT * FROM lessons WHERE strategy=? OR strategy IS NULL "
                "ORDER BY (weight * (1.0 / (1.0 + (? - ts)/86400.0))) DESC, id DESC "
                "LIMIT ?", (strategy, time.time(), limit)
            ).fetchall()
        else:
            rows = self.ledger._conn().execute(
                "SELECT * FROM lessons ORDER BY "
                "(weight * (1.0 / (1.0 + (? - ts)/86400.0))) DESC, id DESC LIMIT ?",
                (time.time(), limit)
            ).fetchall()
        return [dict(r) for r in rows]

    def count(self, kind: Optional[str] = None) -> int:
        if kind:
            row = self.ledger._conn().execute(
                "SELECT COUNT(*) AS c FROM lessons WHERE kind=?", (kind,)).fetchone()
        else:
            row = self.ledger._conn().execute(
                "SELECT COUNT(*) AS c FROM lessons").fetchone()
        return int(row["c"])

    def summary(self) -> str:
        kinds = {}
        for r in self.ledger._conn().execute(
                "SELECT kind, COUNT(*) AS c FROM lessons GROUP BY kind").fetchall():
            kinds[r["kind"]] = r["c"]
        return ", ".join(f"{k}: {v}" for k, v in sorted(kinds.items())) or "no lessons yet"
