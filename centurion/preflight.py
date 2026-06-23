"""Preflight checks — the go/no-go gate before Centurion touches real money.

`python main.py doctor` runs these and prints a readiness report. Going live
with `--live` runs them too and REFUSES to start if a critical check fails, so
the system never autonomously spends real money from a half-configured host.

Checks are deliberately conservative: when in doubt, it blocks and tells you
exactly what to fix.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import List

from config import Config


@dataclass
class Check:
    name: str
    ok: bool
    critical: bool
    detail: str


def run_checks(config: Config, ledger, risk, language, live: bool) -> List[Check]:
    checks: List[Check] = []
    raw = config.raw

    # 1. Ledger seeded with exactly the funded capital.
    seeded = ledger.is_seeded()
    bal = ledger.balance() if seeded else 0.0
    checks.append(Check(
        "ledger seeded", seeded, critical=True,
        detail=(f"balance ${bal:,.2f}" if seeded else "run `python main.py --init`")))

    # 2. Hard caps are sane and present.
    funded = config.funded_capital
    floor_ok = 0 < risk.drawdown_floor < 1
    checks.append(Check(
        "loss floor configured", floor_ok, critical=True,
        detail=f"max loss capped at ~${funded - risk.floor_amount():,.2f} "
               f"(floor ${risk.floor_amount():,.2f})"))
    vel_ok = risk.max_spend_per_hour > 0 and risk.max_spend_per_day > 0
    checks.append(Check(
        "velocity caps set", vel_ok, critical=True,
        detail=f"${risk.max_spend_per_hour:.0f}/hr, ${risk.max_spend_per_day:.0f}/day"))

    # 3. Language Engine reachable (only critical when provider == local).
    provider = (raw.get("language_provider") or "template").lower()
    if provider == "local":
        avail = language.available()
        checks.append(Check(
            "local model reachable", avail, critical=live,
            detail=("Ollama answered" if avail else
                    f"cannot reach {os.environ.get('OLLAMA_HOST','localhost')}; "
                    "is `ollama serve` running and the model pulled?")))
    else:
        checks.append(Check(
            "language provider", True, critical=False,
            detail=f"using '{provider}' (no model needed)"))

    # 4. Stripe — required for live revenue; mock is fine for dry runs.
    stripe_key = os.environ.get("STRIPE_API_KEY", "")
    if live:
        checks.append(Check(
            "Stripe API key", bool(stripe_key), critical=True,
            detail=("present" if stripe_key else "set STRIPE_API_KEY in .env to collect money")))
        wh = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
        checks.append(Check(
            "Stripe webhook secret", bool(wh), critical=False,
            detail=("present" if wh else
                    "no STRIPE_WEBHOOK_SECRET; sales won't be auto-credited in real time")))
    else:
        checks.append(Check(
            "Stripe mode", True, critical=False,
            detail=("LIVE key present" if stripe_key else "MOCK mode (no real money)")))

    # 5. Funded-card acknowledgement (belt-and-suspenders hard cap at the card).
    card_ack = ledger.get_state("funded_card_ack") == "1"
    checks.append(Check(
        "funded-card cap acknowledged", card_ack, critical=live,
        detail=("confirmed" if card_ack else
                "load a prepaid/virtual card with ONLY the funded amount, then run "
                "`python main.py confirm-card`")))

    # 6. Kill switch reachable / dashboard token set.
    token = os.environ.get("CENTURION_DASHBOARD_TOKEN", "")
    checks.append(Check(
        "dashboard kill-switch token", bool(token) and token != "change-me",
        critical=False,
        detail=("set" if token and token != "change-me" else
                "set CENTURION_DASHBOARD_TOKEN in .env so the remote kill switch is secured")))

    # 7. Not already paused.
    checks.append(Check(
        "system not paused", not risk.is_paused(), critical=False,
        detail=(risk.pause_reason() or "running") if risk.is_paused() else "ok"))

    return checks


def report(checks: List[Check]) -> str:
    lines = ["Centurion preflight:"]
    for c in checks:
        mark = "✅" if c.ok else ("❌" if c.critical else "⚠️ ")
        tag = " (critical)" if c.critical and not c.ok else ""
        lines.append(f"  {mark} {c.name}{tag}: {c.detail}")
    blocking = [c for c in checks if c.critical and not c.ok]
    lines.append("")
    if blocking:
        lines.append(f"NOT READY: {len(blocking)} critical check(s) failing. "
                     f"Fix the above before going live.")
    else:
        lines.append("READY: all critical checks pass.")
    return "\n".join(lines)


def is_go(checks: List[Check]) -> bool:
    return not any(c.critical and not c.ok for c in checks)
