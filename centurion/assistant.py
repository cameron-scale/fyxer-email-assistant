"""Dashboard chat assistant — "talk to Centurion".

Answers questions about what the agent is doing, grounded in REAL ledger state
(balance, focus, recent actions, why it held, lessons, progress). If a local
model is configured and reachable, it phrases the answer with that model using
the state as context; otherwise it falls back to a deterministic, genuinely
useful rule-based responder so chat works even with no model loaded.

No third-party AI — same LanguageProvider rule as the rest of the system.
"""
from __future__ import annotations

import re


def _state_context(o) -> dict:
    led = o.ledger
    bal = led.balance()
    funded = o.risk.funded_capital()
    target = float(o.cfg.get("target_capital", 1000.0))
    txns = led.transactions(40)
    recent = [t for t in txns if (t["description"] or "") != "seed capital"][:6]
    holds = [a for a in led.actions(40) if a["status"] == "rejected"][:4]
    lessons = o.memory.relevant(limit=4)
    return {
        "balance": round(bal, 2), "funded": funded, "target": target,
        "multiple": round(bal / funded, 2) if funded else 0,
        "pct_to_goal": round(max(0, (bal - funded) / (target - funded)) * 100, 1) if target > funded else 0,
        "paused": o.risk.is_paused(),
        "autonomy": o.autonomy.level.value,
        "focus": o.focus_strategy,
        "per_action_cap": round(o.risk.effective_per_action_cap(), 2),
        "floor": round(o.risk.floor_amount(), 2),
        "recent": [{"d": t["description"], "amt": t["amount"], "type": t["type"]} for t in recent],
        "holds": [a["description"] for a in holds],
        "lessons": [l["lesson"] for l in lessons],
        "calibration": o.calibration.stats().verdict,
        "sim": getattr(o, "sim", True),
    }


def _rule_reply(msg: str, c: dict) -> str:
    m = msg.lower()
    money = f"${c['balance']:.2f} ({c['multiple']}x the ${c['funded']:.0f} seed)"

    if any(w in m for w in ["safe", "risk", "lose", "lost", "pause", "stop", "kill"]):
        return (f"Your money's protected: balance can't fall below ${c['floor']:.2f}, "
                f"and per-action caps shrink (never grow) in drawdown so I can't chase "
                f"losses. Max loss is the seed. You can pause everything from the dashboard. "
                f"Currently {'PAUSED.' if c['paused'] else 'running.'}")

    if any(w in m for w in ["balance", "how much", "money", "worth", "made", "profit"]):
        net = sum((t["amt"] if t["type"] == "credit" else -t["amt"]) for t in c["recent"])
        return (f"Balance is {money}. That's {c['pct_to_goal']}% of the way to "
                f"${c['target']:.0f}. Recent net activity: {net:+.2f}. "
                + ("(Simulation — no real money.)" if c["sim"] else ""))

    if "why" in m and ("hold" in m or "wait" in m or "not" in m):
        if c["holds"]:
            return ("I held / skipped because the unit economics didn't clear after "
                    "fees, or a guardrail blocked it. Recent skips: "
                    + "; ".join(c["holds"][:3]))
        return ("Holding is a first-class move here: if no opportunity clears its "
                "margin after Stripe fees, I wait rather than make a -EV spend.")

    if any(w in m for w in ["doing", "strategy", "working on", "plan", "focus"]):
        return (f"I'm focused on '{c['focus'] or 'all strategies'}', at "
                f"{c['autonomy']} autonomy. Per-action cap is ${c['per_action_cap']:.2f} "
                f"(scales with balance, tightens in drawdown). I research niches, build "
                f"spend-light assets, and only deploy capital when the math clears.")

    if any(w in m for w in ["goal", "percent", "close", "1000", "10x", "target", "odds", "chance"]):
        return (f"{c['pct_to_goal']}% to ${c['target']:.0f}. Honest odds of a true 10x "
                f"cold are low single digits — most attempts are an 'honorable shortfall'. "
                f"The downside is hard-capped at the seed; that's the real edge.")

    if any(w in m for w in ["learn", "lesson", "mistake", "fail"]):
        return ("What I've learned so far: " + ("; ".join(c["lessons"][:3]) if c["lessons"]
                else "not enough data yet — still gathering real outcomes."))

    if any(w in m for w in ["calibrat", "trust", "lucky", "accurate"]):
        return f"Decision-quality check: {c['calibration']}. I log predicted vs realized for every bet."

    if any(w in m for w in ["hello", "hi", "hey", "help", "what can"]):
        return ("Ask me things like: 'what's the balance?', 'what are you working on?', "
                "'why did you hold?', 'how close to the goal?', 'what have you learned?', "
                "or 'is my money safe?'.")

    return (f"I'm Centurion. Balance {money}, {c['pct_to_goal']}% to goal, "
            f"focus '{c['focus']}', {c['autonomy']} autonomy. Ask about balance, "
            f"strategy, holds, learnings, odds, or safety.")


def answer(o, message: str) -> str:
    message = (message or "").strip()
    if not message:
        return "Ask me anything about what Centurion is doing."
    c = _state_context(o)
    # Use the local model only if it's the active provider and reachable.
    provider = getattr(o, "language", None)
    if provider is not None and provider.name == "local":
        try:
            if provider.available():
                prompt = (
                    "You are Centurion, an autonomous capital-growth agent. Answer the "
                    "operator's question in 1-3 sentences, grounded ONLY in this live state. "
                    "Be honest about risk; never overpromise.\n"
                    f"STATE: {c}\n\nQUESTION: {message}\nANSWER:")
                out = provider.generate(prompt)
                if isinstance(out, str) and out.strip():
                    return out.strip()
        except Exception:
            pass
    return _rule_reply(message, c)
