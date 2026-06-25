"""Risk Manager: turns the Operating Ethos into enforced code.

Owns, mechanically and independent of any agent reasoning:
  * the hard capital ceiling (never spend more than is available),
  * the drawdown floor (stop spending once capital falls below a fraction),
  * anti-escalation (the per-action cap NEVER rises when behind; it tightens
    as drawdown deepens, so the agent cannot chase losses with bigger bets),
  * per-strategy caps and a diversification limit,
  * velocity caps (max spend per hour / per day),
  * the kill switch (pause/resume) and anomaly auto-pause.

Every spend must pass `check_spend` before it executes, at every autonomy
level. A rejected spend is logged, never queued for a human to override.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from ledger import Ledger

HOUR = 3600.0
DAY = 86400.0


@dataclass
class RiskDecision:
    allowed: bool
    reason: str
    effective_cap: float = 0.0

    def __bool__(self) -> bool:  # convenient truthiness
        return self.allowed


# state keys
_PAUSED = "paused"
_PAUSE_REASON = "pause_reason"
_ANOMALY_COUNT = "anomaly_count"


class RiskManager:
    def __init__(self, ledger: Ledger, config: dict):
        self.ledger = ledger
        self.cfg = config
        self.per_action_cap = float(config.get("per_action_cap", 10.0))
        self.per_strategy_cap = float(config.get("per_strategy_cap", 30.0))
        self.drawdown_floor = float(config.get("drawdown_floor", 0.20))
        self.diversification_limit = float(config.get("diversification_limit", 0.50))
        self.anti_escalation = bool(config.get("anti_escalation", True))
        self.max_spend_per_hour = float(config.get("max_spend_per_hour", 15.0))
        self.max_spend_per_day = float(config.get("max_spend_per_day", 40.0))
        self.anomaly_threshold = int(config.get("anomaly_error_threshold", 3))
        # Reinvestment: earned money may be redeployed, so spend caps scale with
        # the CURRENT balance (a fixed fraction of capital), not a frozen dollar
        # figure. This lets profit compound while keeping the loss floor pinned
        # to the funded seed. Default on.
        self.reinvest_earnings = bool(config.get("reinvest_earnings", True))
        # Bound runaway single bets even at very large balances (sane variance).
        self.max_cap_multiple = float(config.get("per_action_cap_multiple", 1000.0))
        # Collect-only mode: block ALL spending (real-revenue test on a host where
        # spending wouldn't be safe). Revenue still flows; downside is exactly $0.
        self.block_all_spend = bool(config.get("block_all_spend", False))
        # Live mode flag (set by the orchestrator). Real spending in live mode is
        # gated by a DANGER SWITCH (ledger state 'live_spend_enabled') that
        # defaults OFF — so a live deploy collects revenue but cannot spend real
        # money until the operator explicitly arms it.
        self.live_mode = False
        # Prove $1 of real organic revenue before any budget may be spent — the
        # cheapest possible de-risking. Off by default so dry runs aren't blocked;
        # recommended ON for live (see GO_LIVE.md).
        self.require_organic_proof = bool(config.get("require_organic_proof", False))

    def live_spend_armed(self) -> bool:
        return self.ledger.get_state("live_spend_enabled", "0") == "1"

    def organic_dollar_proven(self) -> bool:
        """True once a real (non-seed, non-passive) credit of >= $1 has landed."""
        for t in self.ledger.transactions(5000):
            if t["type"] == "credit" and t["amount"] >= 1.0 \
                    and (t["description"] or "") != "seed capital" \
                    and "passive" not in (t["description"] or ""):
                return True
        return False

    # --- funded capital reference ---
    def funded_capital(self) -> float:
        funded = self.ledger.funded_capital()
        if funded <= 0:
            funded = float(self.cfg.get("funded_capital", 100.0))
        return funded

    def _action_fraction(self) -> float:
        """Per-action cap expressed as a fraction of capital (default 10%)."""
        funded = self.funded_capital()
        return (self.per_action_cap / funded) if funded > 0 else 0.0

    # --- anti-escalation + reinvestment-aware effective per-action cap ---
    def effective_per_action_cap(self) -> float:
        """The single most important anti-escalation rule, made compatible with
        reinvestment.

        The cap is a FIXED FRACTION of the current balance. This guarantees two
        things at once:
          * Anti-escalation: when the balance falls (drawdown / being behind),
            the cap falls with it. The *fraction* never rises because the agent
            is behind, so it can never chase losses with a bigger bet.
          * Reinvestment: when earned capital grows the balance, the cap grows
            in absolute terms — the agent compounds wins with house money — but
            only ever as the same disciplined fraction of real capital it holds.

        In conservative mode (reinvest_earnings = False) the cap is clamped at
        the base dollar figure and can only shrink under drawdown.
        """
        base = self.per_action_cap
        if not self.anti_escalation:
            return base
        funded = self.funded_capital()
        if funded <= 0:
            return 0.0
        balance = self.ledger.balance()
        if self.reinvest_earnings:
            cap = self._action_fraction() * max(0.0, balance)
            return min(cap, base * self.max_cap_multiple)
        available_fraction = balance / funded
        # clamp: cap NEVER rises above base in conservative mode, even on profit.
        return base * min(1.0, max(0.0, available_fraction))

    def reference_capital(self) -> float:
        """Reference pool for concentration caps. Under reinvestment it is the
        high-water of funded vs current balance, so concentration limits hold
        steady at/below the seed and expand only with genuine profit."""
        if self.reinvest_earnings:
            return max(self.funded_capital(), self.ledger.balance())
        return self.funded_capital()

    def effective_per_strategy_cap(self) -> float:
        funded = self.funded_capital()
        if funded <= 0:
            return 0.0
        return self.per_strategy_cap * (self.reference_capital() / funded)

    def effective_diversification_cap(self) -> float:
        return self.diversification_limit * self.reference_capital()

    def floor_amount(self) -> float:
        # The loss floor stays pinned to the FUNDED seed regardless of growth,
        # so total loss can never exceed the funded amount even after profits.
        return self.drawdown_floor * self.funded_capital()

    # --- the gate every spend passes through ---
    def check_spend(self, amount: float, strategy: Optional[str] = None) -> RiskDecision:
        amount = float(amount)
        cap = self.effective_per_action_cap()

        if self.is_paused():
            return RiskDecision(False, f"system paused: {self.pause_reason()}", cap)

        if amount < 0:
            return RiskDecision(False, "negative spend rejected", cap)

        # Collect-only mode: no spending at all (real-revenue test, $0 at risk).
        if amount > 0 and self.block_all_spend:
            return RiskDecision(False, "collect-only mode: spending disabled "
                                "(real-revenue test, $0 at risk)", cap)

        # DANGER SWITCH: in live mode, real spending is OFF until explicitly armed.
        if amount > 0 and self.live_mode and not self.live_spend_armed():
            return RiskDecision(False, "live-spend danger switch is OFF "
                                "(collect-only; arm it in the dashboard to enable real spending)", cap)

        # Prove $1 organic before any budget is touched (when enabled).
        if amount > 0 and self.require_organic_proof and not self.organic_dollar_proven():
            return RiskDecision(False,
                                "organic-proof gate: must earn $1 of real revenue "
                                "before spending any budget", cap)

        balance = self.ledger.balance()

        # 1. Hard capital ceiling — cannot spend more than is available.
        if amount > balance + 1e-9:
            return RiskDecision(False,
                                f"exceeds available capital ({amount:.2f} > {balance:.2f})", cap)

        # 2. Drawdown floor — spending below the floor is the chase-losses zone.
        floor = self.floor_amount()
        if balance - amount < floor - 1e-9:
            return RiskDecision(False,
                                f"would breach drawdown floor (balance {balance:.2f} "
                                f"- {amount:.2f} < floor {floor:.2f})", cap)

        # 3. Anti-escalation per-action cap (tightens under drawdown, never rises).
        if amount > cap + 1e-9:
            return RiskDecision(False,
                                f"exceeds per-action cap ({amount:.2f} > {cap:.2f}); "
                                f"caps tighten under drawdown and never rise", cap)

        # 4. Per-strategy cumulative cap (scales with reinvested capital).
        if strategy is not None:
            spent = self.ledger.strategy_spend(strategy)
            strat_cap = self.effective_per_strategy_cap()
            if spent + amount > strat_cap + 1e-9:
                return RiskDecision(False,
                                    f"exceeds per-strategy cap for {strategy} "
                                    f"({spent + amount:.2f} > {strat_cap:.2f})", cap)

            # 5. Diversification — no single strategy may hold too much capital.
            div_cap = self.effective_diversification_cap()
            if spent + amount > div_cap + 1e-9:
                return RiskDecision(False,
                                    f"exceeds diversification limit for {strategy} "
                                    f"({spent + amount:.2f} > {div_cap:.2f})", cap)

        # 6. Velocity caps — cannot drain the budget in one bad hour/day.
        hour_spend = self.ledger.spend_since(HOUR)
        if hour_spend + amount > self.max_spend_per_hour + 1e-9:
            return RiskDecision(False,
                                f"exceeds hourly spend velocity cap "
                                f"({hour_spend + amount:.2f} > {self.max_spend_per_hour:.2f})", cap)
        day_spend = self.ledger.spend_since(DAY)
        if day_spend + amount > self.max_spend_per_day + 1e-9:
            return RiskDecision(False,
                                f"exceeds daily spend velocity cap "
                                f"({day_spend + amount:.2f} > {self.max_spend_per_day:.2f})", cap)

        return RiskDecision(True, "ok", cap)

    # --- kill switch ---
    def pause(self, reason: str = "manual kill switch") -> None:
        self.ledger.set_state(_PAUSED, "1")
        self.ledger.set_state(_PAUSE_REASON, reason)

    def resume(self) -> None:
        self.ledger.set_state(_PAUSED, "0")
        self.ledger.set_state(_PAUSE_REASON, "")
        self.ledger.set_state(_ANOMALY_COUNT, "0")

    def is_paused(self) -> bool:
        return self.ledger.get_state(_PAUSED, "0") == "1"

    def pause_reason(self) -> str:
        return self.ledger.get_state(_PAUSE_REASON, "") or ""

    # --- capital exhaustion is a clean stop ---
    def capital_exhausted(self) -> bool:
        """True once the balance has hit the drawdown floor and cannot fund the
        smallest meaningful spend. The orchestrator treats this as a clean stop:
        keep operating live assets, stop trying to spend."""
        return self.ledger.balance() <= self.floor_amount() + 1e-9

    # --- anomaly auto-pause ---
    def record_error(self) -> bool:
        """Increment the consecutive-error counter. Auto-pause and return True
        if the threshold is reached."""
        count = int(self.ledger.get_state(_ANOMALY_COUNT, "0") or 0) + 1
        self.ledger.set_state(_ANOMALY_COUNT, str(count))
        if count >= self.anomaly_threshold:
            self.pause(f"anomaly auto-pause: {count} consecutive errors/anomalies")
            return True
        return False

    def record_success(self) -> None:
        self.ledger.set_state(_ANOMALY_COUNT, "0")

    def anomaly_count(self) -> int:
        return int(self.ledger.get_state(_ANOMALY_COUNT, "0") or 0)
