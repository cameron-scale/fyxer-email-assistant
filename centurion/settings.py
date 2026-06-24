"""Integration settings store — lets the operator enter API keys in the
dashboard instead of editing .env by hand.

Values are persisted in the ledger's state table and mirrored into os.environ so
the existing integration clients (Stripe, Twilio/SMTP, local model) pick them up
with no other changes. Secret values are never returned to the UI in full —
only a masked hint and whether they're set.

NOTE: on a shared/free host this store is plaintext in SQLite — do not enter
real production keys there. Real keys belong on your own machine.
"""
from __future__ import annotations

import os
from typing import Optional

STATE_PREFIX = "setting:"

# Integration fields the dashboard can configure, grouped for display.
FIELDS = [
    {"env": "STRIPE_API_KEY",        "label": "Stripe secret key",            "secret": True,  "group": "Stripe (revenue)"},
    {"env": "STRIPE_WEBHOOK_SECRET", "label": "Stripe webhook signing secret","secret": True,  "group": "Stripe (revenue)"},
    {"env": "OLLAMA_HOST",           "label": "Local model host (Ollama URL)","secret": False, "group": "Local model"},
    {"env": "TWILIO_ACCOUNT_SID",    "label": "Twilio Account SID",           "secret": True,  "group": "Alerts · SMS"},
    {"env": "TWILIO_AUTH_TOKEN",     "label": "Twilio Auth Token",            "secret": True,  "group": "Alerts · SMS"},
    {"env": "TWILIO_FROM_NUMBER",    "label": "Twilio from number",           "secret": False, "group": "Alerts · SMS"},
    {"env": "OPERATOR_PHONE_NUMBER", "label": "Your phone number",            "secret": False, "group": "Alerts · SMS"},
    {"env": "SMTP_HOST",             "label": "SMTP host",                    "secret": False, "group": "Alerts · Email"},
    {"env": "SMTP_PORT",             "label": "SMTP port",                    "secret": False, "group": "Alerts · Email"},
    {"env": "SMTP_USER",             "label": "SMTP user",                    "secret": False, "group": "Alerts · Email"},
    {"env": "SMTP_PASSWORD",         "label": "SMTP password",                "secret": True,  "group": "Alerts · Email"},
    {"env": "OPERATOR_EMAIL",        "label": "Your email",                   "secret": False, "group": "Alerts · Email"},
    {"env": "POD_API_KEY",           "label": "Print-on-demand API key",      "secret": True,  "group": "Platforms"},
    {"env": "MARKETPLACE_API_KEY",   "label": "Marketplace API key",          "secret": True,  "group": "Platforms"},
]
KNOWN_ENVS = {f["env"] for f in FIELDS}
_BY_ENV = {f["env"]: f for f in FIELDS}


def load_into_env(ledger) -> None:
    """Copy any stored settings into os.environ so integration clients use them."""
    for env in KNOWN_ENVS:
        v = ledger.get_state(STATE_PREFIX + env)
        if v:
            os.environ[env] = v


def set_value(ledger, env: str, value: str) -> None:
    if env not in KNOWN_ENVS:
        raise ValueError(f"unknown setting {env}")
    value = (value or "").strip()
    ledger.set_state(STATE_PREFIX + env, value)
    if value:
        os.environ[env] = value
    else:
        os.environ.pop(env, None)


def apply(ledger, values: dict) -> list[str]:
    """Set multiple values; returns the list of envs changed. Empty string
    clears a value."""
    changed = []
    for env, val in (values or {}).items():
        if env in KNOWN_ENVS:
            set_value(ledger, env, val)
            changed.append(env)
    return changed


def _mask(value: str) -> str:
    if not value:
        return ""
    return ("••••" + value[-4:]) if len(value) >= 4 else "••••"


def status(ledger) -> list[dict]:
    """Grouped field status for the UI. Secret values are masked."""
    groups: dict[str, list] = {}
    for f in FIELDS:
        stored = ledger.get_state(STATE_PREFIX + f["env"]) or os.environ.get(f["env"], "") or ""
        item = {"env": f["env"], "label": f["label"], "secret": f["secret"],
                "isSet": bool(stored)}
        if f["secret"]:
            item["hint"] = _mask(stored)
        else:
            item["value"] = stored
        groups.setdefault(f["group"], []).append(item)
    return [{"group": g, "fields": items} for g, items in groups.items()]
