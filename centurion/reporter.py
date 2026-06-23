"""Reporter: daily plain-language report + CLI summary.

Readable in under a minute: current balance, percent to goal, today's net,
active strategies and their performance, anything skipped or rejected and why,
a data-driven ETA projection (honest about uncertainty), and the next plan.
"""
from __future__ import annotations

import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from ledger import Ledger


class Reporter:
    def __init__(self, ledger: Ledger, config: dict, memory=None, risk=None,
                 calibration=None):
        self.ledger = ledger
        self.cfg = config
        self.memory = memory
        self.risk = risk
        self.calibration = calibration
        self.target = float(config.get("target_capital", 1000.0))
        self.ultimate = float(config.get("ultimate_target", 0) or 0)
        self.funded = float(config.get("funded_capital", 100.0))

    # --- projections (honest, data-driven) ---
    def growth_stats(self) -> dict:
        """Realized growth rate from the transaction history -> ETA to target.

        Returns conservative figures and is explicit when there is not yet
        enough data to project. Never fabricates certainty."""
        txns = self.ledger.transactions(5000)
        if len(txns) < 2:
            return {"enough_data": False}
        txns = sorted(txns, key=lambda t: t["ts"])
        first = txns[0]
        elapsed_days = (time.time() - first["ts"]) / 86400.0
        start_bal = self.funded
        balance = self.ledger.balance()
        if start_bal <= 0 or balance <= 0:
            return {"enough_data": False}
        # Need a meaningful window before annualizing a rate, or the exponent
        # explodes. Below the threshold we report net only, no projection.
        if elapsed_days < 0.25:
            return {"enough_data": False, "elapsed_days": round(elapsed_days, 4),
                    "net": round(balance - start_bal, 2)}
        # daily multiplicative growth rate
        daily_growth = (balance / start_bal) ** (1.0 / elapsed_days)
        net = balance - start_bal
        eta_days = None
        if daily_growth > 1.0 and balance < self.target:
            import math
            eta_days = math.log(self.target / balance) / math.log(daily_growth)
        return {
            "enough_data": elapsed_days >= 0.5,
            "elapsed_days": round(elapsed_days, 2),
            "daily_growth_pct": round((daily_growth - 1.0) * 100, 2),
            "net": round(net, 2),
            "eta_days_to_target": round(eta_days, 1) if eta_days else None,
        }

    def milestone(self) -> str:
        b = self.ledger.balance()
        x = b / self.funded if self.funded else 0
        return f"{x:.2f}x seed"

    # --- the report ---
    def build(self) -> str:
        balance = self.ledger.balance()
        pct = (balance / self.target * 100) if self.target else 0
        today_net = self._net_since(86400)
        stats = self.growth_stats()
        lines = []
        d = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        lines.append(f"# Centurion Daily Report — {d}")
        lines.append("")
        lines.append(f"- **Balance:** ${balance:,.2f}  ({self.milestone()})")
        lines.append(f"- **Mission (10x = ${self.target:,.0f}):** {pct:.1f}%")
        if self.ultimate:
            lines.append(f"- **Stretch target:** ${self.ultimate:,.0f} "
                         f"(keeps compounding; does not stop at 10x)")
        lines.append(f"- **Net last 24h:** ${today_net:,.2f}")
        if self.risk:
            lines.append(f"- **Spendable floor (max loss protection):** "
                         f"balance may not fall below ${self.risk.floor_amount():,.2f}")
            lines.append(f"- **Current per-action cap:** ${self.risk.effective_per_action_cap():,.2f}")
            if self.risk.is_paused():
                lines.append(f"- **STATUS: PAUSED** — {self.risk.pause_reason()}")

        # projection
        lines.append("")
        lines.append("## Trajectory")
        if stats.get("enough_data"):
            lines.append(f"- Realized daily growth: {stats['daily_growth_pct']}%/day "
                         f"over {stats['elapsed_days']} days")
            eta = stats.get("eta_days_to_target")
            if eta:
                lines.append(f"- Projected ETA to 10x at current rate: ~{eta} days "
                             f"(projection, not a guarantee — markets vary)")
            else:
                lines.append("- Not currently on a growth trajectory to the target; "
                             "the agent is iterating to find an edge.")
        else:
            lines.append("- Not enough realized data yet for an honest projection.")

        # decision quality (calibration) — are predictions tracking reality?
        if self.calibration is not None:
            cs = self.calibration.stats()
            lines.append("")
            lines.append("## Decision quality (predicted vs realized)")
            lines.append(f"- {cs.n} bets logged · MAE ${cs.mae} · bias ${cs.bias} "
                         f"→ {cs.verdict}")

        # strategy performance
        lines.append("")
        lines.append("## Strategies")
        for row in self._strategy_perf():
            lines.append(f"- **{row['strategy']}**: spent ${row['spent']:.2f}, "
                         f"earned ${row['revenue']:.2f}, net ${row['net']:.2f}")

        # skipped / rejected
        rejected = self.ledger.actions_by_status("rejected")
        lines.append("")
        lines.append("## Skipped / rejected by guardrails or risk")
        if not rejected:
            lines.append("- None this period.")
        for a in rejected[-10:]:
            lines.append(f"- [{a['strategy']}] {a['description']} — rationale: {a['rationale']}")

        # learning
        if self.memory:
            lines.append("")
            lines.append("## What it learned")
            lines.append(f"- Lessons on file: {self.memory.summary()}")
            for l in self.memory.relevant(limit=5):
                lines.append(f"  - ({l['kind']}) {l['lesson']}")
            # Centurion's notebook (compact shorthand file it reads + appends to)
            nb = self.memory.notebook_digest(limit=8)
            if nb and "unavailable" not in nb:
                size = self.memory.notebook_size()
                lines.append("")
                lines.append(f"## Centurion's notebook ({size} bytes on disk)")
                for entry in nb.splitlines():
                    lines.append(f"- {entry}")

        # plan
        lines.append("")
        lines.append("## Plan for next cycle")
        lines.append("- Continue exploiting the best-performing arms, keep exploring new "
                     "angles, reinvest earnings within the disciplined caps.")
        lines.append("")
        return "\n".join(lines)

    def write_daily(self, out_dir: Optional[Path] = None) -> Path:
        out_dir = Path(out_dir) if out_dir else Path(self.cfg.get("report_dir", "data/reports"))
        out_dir.mkdir(parents=True, exist_ok=True)
        d = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        path = out_dir / f"report_{d}.md"
        path.write_text(self.build())
        return path

    def cli_summary(self) -> str:
        balance = self.ledger.balance()
        pct = (balance / self.target * 100) if self.target else 0
        return (f"Balance ${balance:,.2f} | {self.milestone()} | "
                f"{pct:.1f}% to 10x | net24h ${self._net_since(86400):,.2f}")

    # --- helpers ---
    def _net_since(self, seconds: float) -> float:
        cutoff = time.time() - seconds
        net = 0.0
        for t in self.ledger.transactions(5000):
            if t["ts"] < cutoff:
                continue
            if t["type"] == "credit":
                net += t["amount"]
            else:
                net -= t["amount"]
        return round(net, 2)

    def _strategy_perf(self) -> list[dict]:
        perf = {}
        for t in self.ledger.transactions(5000):
            s = t["strategy"] or "—"
            p = perf.setdefault(s, {"strategy": s, "spent": 0.0, "revenue": 0.0})
            if t["type"] == "credit":
                p["revenue"] += t["amount"]
            else:
                p["spent"] += t["amount"]
        for p in perf.values():
            p["net"] = round(p["revenue"] - p["spent"], 2)
            p["spent"] = round(p["spent"], 2)
            p["revenue"] = round(p["revenue"], 2)
        return sorted(perf.values(), key=lambda x: x["net"], reverse=True)
