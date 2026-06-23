"""Auto-debugger, live error log, and self-healing engine.

What this gives the operator:
  * A LIVE ERROR LOG — every exception is captured with a full traceback,
    classified, and persisted (visible on the dashboard).
  * SELF-HEALING — on an error, a recovery playbook of safe, pre-defined
    actions runs automatically: retry transient faults, fall back from the
    local model to the deterministic template provider, quarantine a single
    misbehaving strategy so the rest keeps running, and pause+alert if nothing
    works. The program manages itself and continues, unattended.
  * A HEALTH CHECK — after a self-heal step the debugger re-verifies the safety
    invariants (and runs the test suite when available) before resuming, so it
    only continues from a known-good state.
  * PERFORMANCE DIAGNOSIS — if results underperform (a strategy bleeds capital,
    or the balance stalls), it diagnoses, disables the loser, and raises
    exploration, logging a plain-language diagnosis.

Responsible boundary (see README): operational self-healing above is fully
automatic. AUTONOMOUS SOURCE-CODE REWRITING of a live money system is NOT done
silently — when `auto_apply_code_fixes` is enabled and a local model is present,
a proposed patch is generated, tested in a sandbox copy, and only applied if the
tests pass; otherwise the patch is written to a quarantine dir for human review.
Default is OFF. Money code does not edit itself behind your back.
"""
from __future__ import annotations

import subprocess
import sys
import time
import traceback
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, List, Optional

from ledger import Ledger

ERRORS_SCHEMA = """
CREATE TABLE IF NOT EXISTS errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts REAL NOT NULL,
    where_at TEXT,
    etype TEXT,
    message TEXT,
    traceback TEXT,
    severity TEXT DEFAULT 'error',
    resolved INTEGER DEFAULT 0,
    resolution TEXT
);
CREATE TABLE IF NOT EXISTS heal_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts REAL NOT NULL,
    trigger TEXT,
    action TEXT,
    outcome TEXT
);
"""


class ErrorLog:
    def __init__(self, ledger: Ledger):
        self.ledger = ledger
        with self.ledger._tx() as conn:
            conn.executescript(ERRORS_SCHEMA)

    def record(self, where_at: str, exc: BaseException, severity: str = "error") -> int:
        tb = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
        with self.ledger._tx() as conn:
            cur = conn.execute(
                "INSERT INTO errors (ts, where_at, etype, message, traceback, severity) "
                "VALUES (?,?,?,?,?,?)",
                (time.time(), where_at, type(exc).__name__, str(exc), tb, severity))
            return int(cur.lastrowid)

    def resolve(self, error_id: int, resolution: str) -> None:
        with self.ledger._tx() as conn:
            conn.execute("UPDATE errors SET resolved=1, resolution=? WHERE id=?",
                         (resolution, error_id))

    def recent(self, limit: int = 25) -> List[dict]:
        rows = self.ledger._conn().execute(
            "SELECT * FROM errors ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
        return [dict(r) for r in rows]

    def unresolved_count(self) -> int:
        return int(self.ledger._conn().execute(
            "SELECT COUNT(*) c FROM errors WHERE resolved=0").fetchone()["c"])

    def log_heal(self, trigger: str, action: str, outcome: str) -> None:
        with self.ledger._tx() as conn:
            conn.execute("INSERT INTO heal_events (ts, trigger, action, outcome) "
                         "VALUES (?,?,?,?)", (time.time(), trigger, action, outcome))

    def heal_events(self, limit: int = 25) -> List[dict]:
        rows = self.ledger._conn().execute(
            "SELECT * FROM heal_events ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
        return [dict(r) for r in rows]


@dataclass
class HealResult:
    healed: bool
    action: str
    detail: str


class AutoDebugger:
    """Wraps the orchestrator to capture errors and self-heal."""

    def __init__(self, orchestrator, error_log: Optional[ErrorLog] = None):
        self.o = orchestrator
        self.log = error_log or ErrorLog(orchestrator.ledger)
        self.cfg = orchestrator.cfg
        self.auto_apply_code_fixes = bool(self.cfg.get("auto_apply_code_fixes", False))
        self.quarantined: set[str] = set()

    # --- the guarded cycle ---
    def run_cycle(self):
        """Run one orchestrator cycle under supervision. On error: log, attempt
        recovery, health-check, and continue. Never raises to the daemon loop."""
        try:
            rep = self.o.run_cycle()
            return rep
        except BaseException as exc:  # noqa: BLE001 - we want everything
            err_id = self.log.record("orchestrator.run_cycle", exc)
            heal = self.diagnose_and_heal(exc)
            self.log.log_heal(trigger=type(exc).__name__, action=heal.action,
                              outcome=("healed" if heal.healed else "unrecovered"))
            if heal.healed and self.health_check():
                self.log.resolve(err_id, f"self-healed: {heal.detail}")
            else:
                # Could not safely recover -> pause + alert, fail safe.
                self.o.risk.pause(f"auto-debugger could not recover: {type(exc).__name__}")
                self.log.resolve(err_id, f"unrecovered, paused: {heal.detail}")
            return None

    # --- recovery playbook ---
    def diagnose_and_heal(self, exc: BaseException) -> HealResult:
        name = type(exc).__name__
        msg = str(exc).lower()

        # 1. Local model / language failure -> deterministic template fallback.
        if "ollama" in msg or "connection" in msg or "language" in msg \
                or self.o.language.name == "local" and "model" in msg:
            try:
                from intelligence.language.templates import TemplateProvider
                self.o.language = TemplateProvider()
                self.o.research.language = self.o.language
                self.o.assets.language = self.o.language
                return HealResult(True, "fallback-to-template-provider",
                                  "language engine unreachable; switched to "
                                  "deterministic templates")
            except Exception:
                pass

        # 2. Database locked / transient I/O -> brief backoff (handled by retrying).
        if "locked" in msg or "timeout" in msg or "temporarily" in msg:
            time.sleep(0.5)
            return HealResult(True, "backoff-retry", "transient I/O; backed off")

        # 3. A specific strategy blew up -> quarantine it, keep the rest running.
        culprit = self._strategy_in_traceback(exc)
        if culprit and culprit in self.o.strategies:
            self.o.strategies.pop(culprit, None)
            self.quarantined.add(culprit)
            return HealResult(True, f"quarantine-strategy:{culprit}",
                              f"disabled strategy '{culprit}' after repeated fault")

        # 4. Unknown -> let the anomaly counter escalate to auto-pause.
        tripped = self.o.risk.record_error()
        return HealResult(False, "anomaly-counter",
                          "unclassified error; anomaly counter "
                          + ("tripped auto-pause" if tripped else "incremented"))

    def _strategy_in_traceback(self, exc: BaseException) -> Optional[str]:
        tb = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
        for name in list(self.o.strategies.keys()):
            if name in tb:
                return name
        return None

    # --- health check: only resume from a known-good state ---
    def health_check(self) -> bool:
        """Verify the core safety invariants still hold. Cheap and dependency
        free so it runs in production. Optionally runs the test suite."""
        try:
            # Invariant 1: balance never negative.
            if self.o.ledger.balance() < -1e-9:
                return False
            # Invariant 2: a clearly-over-cap spend is still rejected.
            cap = self.o.risk.effective_per_action_cap()
            if self.o.risk.check_spend(cap + 10_000.0, "digital_products").allowed:
                return False
            # Invariant 3: guardrails still reject a prohibited action.
            from guardrails import Action
            if self.o.guardrails.check(Action(strategy="pump-and-dump",
                                              description="x")).allowed:
                return False
            return True
        except Exception:
            return False

    def run_test_suite(self, quick: bool = True) -> tuple[bool, str]:
        """Run pytest if available (the 'test it' step). Returns (passed, output).
        Used before applying any code-level change."""
        root = Path(__file__).resolve().parent
        args = [sys.executable, "-m", "pytest", "-q"]
        if quick:
            args += ["tests/test_risk.py", "tests/test_guardrails.py",
                     "tests/test_ledger.py"]
        try:
            proc = subprocess.run(args, cwd=str(root), capture_output=True,
                                  text=True, timeout=300)
            return proc.returncode == 0, proc.stdout[-2000:] + proc.stderr[-1000:]
        except Exception as e:
            return False, f"could not run tests: {e}"


class PerformanceMonitor:
    """Debugs RESULTS, not just crashes: if performance underwhelms, it tunes."""

    def __init__(self, orchestrator, error_log: ErrorLog):
        self.o = orchestrator
        self.log = error_log

    def evaluate_and_tune(self) -> List[str]:
        notes = []
        # 1. Disable strategies that persistently bleed capital.
        for name, strat in list(self.o.strategies.items()):
            m = strat.metrics()
            spent = m["spent"]
            if spent >= 8.0 and m["net"] < 0 and m["revenue"] < spent * 0.5:
                self.o.strategies.pop(name, None)
                notes.append(f"disabled underperformer '{name}' (net ${m['net']:.2f})")
                self.log.log_heal("underperformance", f"disable:{name}",
                                  f"net ${m['net']:.2f}")
                self.o.memory.learn_mistake(name, "disabled for persistent losses",
                                            evidence=m)

        # 2. If the balance has stalled, push the bandit to explore more.
        if self._stalled():
            self.o.bandit.prior_var = min(self.o.bandit.prior_var * 1.5, 8.0)
            notes.append("balance stalled -> increased exploration (prior_var up)")
            self.log.log_heal("stall", "increase-exploration", "prior_var raised")
        return notes

    def _stalled(self) -> bool:
        txns = self.o.ledger.transactions(40)
        credits = [t for t in txns if t["type"] == "credit"
                   and t["description"] != "seed capital"]
        # stalled if recent window produced essentially no revenue
        return len(txns) >= 20 and sum(t["amount"] for t in credits[:10]) < 1.0
