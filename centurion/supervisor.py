"""Supervisor: heartbeat writer + watchdog + anomaly auto-pause helper.

For 24/7 unattended operation. Silence is never assumed to mean health: a
watchdog alerts the operator if the heartbeat goes stale, if the system
auto-pauses, or if an anomaly trips.
"""
from __future__ import annotations

import time
from typing import Callable, Optional

from ledger import Ledger

HEARTBEAT_KEY = "heartbeat_ts"
HEARTBEAT_MSG = "heartbeat_msg"


class Supervisor:
    def __init__(self, ledger: Ledger, config: dict, alerter=None):
        self.ledger = ledger
        self.cfg = config
        self.alerter = alerter  # AlertClient or None
        self.stale_after = float(config.get("heartbeat_stale_after_minutes", 20)) * 60
        self.heartbeat_interval = float(config.get("heartbeat_interval_minutes", 5)) * 60

    def heartbeat(self, message: str = "ok") -> None:
        self.ledger.set_state(HEARTBEAT_KEY, str(time.time()))
        self.ledger.set_state(HEARTBEAT_MSG, message)

    def last_heartbeat(self) -> float:
        v = self.ledger.get_state(HEARTBEAT_KEY)
        return float(v) if v else 0.0

    def heartbeat_age(self) -> float:
        last = self.last_heartbeat()
        return (time.time() - last) if last else float("inf")

    def is_stale(self) -> bool:
        return self.heartbeat_age() > self.stale_after

    def check_and_alert(self) -> Optional[str]:
        """Called by an external timer / uptime pinger. Returns an alert message
        if one was raised, else None."""
        msgs = []
        if self.is_stale():
            msgs.append(f"Centurion heartbeat STALE ({self.heartbeat_age()/60:.0f} min). "
                        f"Process may be down.")
        if self.ledger.get_state("paused", "0") == "1":
            reason = self.ledger.get_state("pause_reason", "") or "unknown"
            msgs.append(f"Centurion is PAUSED: {reason}")
        if not msgs:
            return None
        text = " | ".join(msgs)
        if self.alerter:
            self.alerter.alert(text)
        return text

    def run_watchdog(self, check_interval: float = 60.0,
                     max_checks: Optional[int] = None) -> None:
        """Standalone watchdog loop. Run as a separate process/timer in prod."""
        n = 0
        while True:
            self.check_and_alert()
            n += 1
            if max_checks is not None and n >= max_checks:
                break
            time.sleep(check_interval)
