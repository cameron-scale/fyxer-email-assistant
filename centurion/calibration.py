"""Decision-quality logging — measure whether the Decision Core is calibrated
or just lucky.

For every bet, log the predicted return alongside the realized net. Over time
this tells you whether predictions track reality (calibrated), run optimistic,
or are noise — which is the only honest basis for ever trusting the agent with
more than the seed. Balance going up is not the same as good decisions.
"""
from __future__ import annotations

import time
from dataclasses import dataclass
from typing import List, Optional

from ledger import Ledger

SCHEMA = """
CREATE TABLE IF NOT EXISTS predictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts REAL NOT NULL,
    strategy TEXT,
    predicted REAL NOT NULL,
    realized REAL NOT NULL,
    cost REAL NOT NULL DEFAULT 0
);
"""


@dataclass
class CalibrationStats:
    n: int
    mae: float           # mean absolute error
    bias: float          # mean(predicted - realized); >0 = optimistic
    verdict: str


class CalibrationLog:
    def __init__(self, ledger: Ledger):
        self.ledger = ledger
        with self.ledger._tx() as conn:
            conn.executescript(SCHEMA)

    def record(self, strategy: str, predicted: float, realized: float,
               cost: float = 0.0) -> None:
        with self.ledger._tx() as conn:
            conn.execute(
                "INSERT INTO predictions (ts, strategy, predicted, realized, cost) "
                "VALUES (?,?,?,?,?)",
                (time.time(), strategy, float(predicted), float(realized), float(cost)))

    def rows(self) -> List[dict]:
        return [dict(r) for r in self.ledger._conn().execute(
            "SELECT * FROM predictions ORDER BY id").fetchall()]

    def stats(self) -> CalibrationStats:
        rows = self.rows()
        n = len(rows)
        if n == 0:
            return CalibrationStats(0, 0.0, 0.0, "no bets logged yet")
        errs = [abs(r["predicted"] - r["realized"]) for r in rows]
        bias = sum(r["predicted"] - r["realized"] for r in rows) / n
        mae = sum(errs) / n
        if n < 5:
            verdict = f"too few bets ({n}) to judge calibration"
        elif bias > mae * 0.5:
            verdict = "systematically OPTIMISTIC — discount its forecasts"
        elif bias < -mae * 0.5:
            verdict = "systematically pessimistic"
        else:
            verdict = "reasonably calibrated"
        return CalibrationStats(n, round(mae, 2), round(bias, 2), verdict)
