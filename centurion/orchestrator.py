"""Orchestrator: the long-running decision daemon.

Each cycle: assess state, pick/continue strategies (bandit), generate actions,
pass each through autonomy + guardrails + risk, execute what clears through a
durable crash-safe state machine, update the ledger, learn, heartbeat, report.

Designed to run unattended for weeks. Capital exhaustion is a clean stop, not a
crash. A paused system keeps operating live assets but stops spending.
"""
from __future__ import annotations

import random
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from autonomy import AutonomyController
from config import Config, load_config
from guardrails import Action, GuardrailEngine
from intelligence.asset_factory import AssetFactory
from intelligence.decision_core.allocator import (Allocator, AllocationCaps,
                                                  AllocationRequest)
from intelligence.decision_core.bandit import ThompsonBandit
from intelligence.decision_core.scoring import ScoringModel
from intelligence.language.provider import get_provider
from intelligence.memory import LearningMemory
from intelligence.research import ResearchEngine
from ledger import InsufficientCapital, Ledger
from risk import RiskManager
from approvals import ApprovalQueue

from strategies.digital_products import DigitalProductsStrategy
from strategies.service_arbitrage import ServiceArbitrageStrategy
from strategies.print_on_demand import PrintOnDemandStrategy
from strategies.content_affiliate import ContentAffiliateStrategy
from strategies.reselling_research import ResellingResearchStrategy

STRATEGY_CLASSES = {
    "digital_products": DigitalProductsStrategy,
    "service_arbitrage": ServiceArbitrageStrategy,
    "print_on_demand": PrintOnDemandStrategy,
    "content_affiliate": ContentAffiliateStrategy,
    "reselling_research": ResellingResearchStrategy,
}


@dataclass
class CycleReport:
    cycle: int
    started: float
    balance_before: float
    balance_after: float
    actions_executed: int = 0
    actions_queued: int = 0
    actions_rejected: int = 0
    net: float = 0.0
    notes: List[str] = field(default_factory=list)


class Orchestrator:
    def __init__(self, config: Config):
        self.config = config
        self.cfg = config.raw
        self.seed = int(self.cfg.get("decision_seed", 42))
        self.sim = True  # simulation by default; live wiring is opt-in per integration

        self.ledger = Ledger(config.database_path)
        self.risk = RiskManager(self.ledger, self.cfg)
        self.guardrails = GuardrailEngine(self.cfg)
        self.autonomy = AutonomyController(
            level=self._autonomy_level(),
            guarded_auto_approve_cap=float(self.cfg.get("guarded_auto_approve_cap", 5.0)))
        self.approvals = ApprovalQueue(self.ledger)
        self.memory = LearningMemory(self.ledger)

        # Auto-debugger + live error log + performance diagnosis (self-healing).
        from autodebug import AutoDebugger, ErrorLog, PerformanceMonitor
        self.error_log = ErrorLog(self.ledger)
        self.autodebugger = AutoDebugger(self, self.error_log)
        self.perf_monitor = PerformanceMonitor(self, self.error_log)

        self.language = get_provider(self.cfg)
        self.research = ResearchEngine(self.language, seed=self.seed)
        self.assets = AssetFactory(self.language)

        # Revenue rail. Mock mode (no key) lets dry runs work; a real key makes
        # the live path collect actual money. Creating payment links never risks
        # capital, so the live revenue path is safe by construction.
        from integrations.stripe_client import StripeClient
        self.stripe = StripeClient()
        self.scorer = ScoringModel(self.cfg.get("scoring_weights"))
        self.allocator = Allocator()

        # Unit-economics gate + decision-quality logging.
        from economics import Economics
        from calibration import CalibrationLog
        self.economics = Economics(self.cfg)
        self.calibration = CalibrationLog(self.ledger)
        # Brand safety: spend can be autonomous; your NAME shouldn't be. Anything
        # published under the real brand routes to a human gate unless a separate
        # sandbox identity is configured.
        self.brand_human_gate = bool(self.cfg.get("brand_human_gate", True))
        self.sandbox_identity = self.cfg.get("sandbox_identity") or None
        # Focus: optionally concentrate on one strategy instead of spreading thin.
        self.focus_strategy = self.cfg.get("focus_strategy") or None

        # Decision Core: persist/restore the bandit so learning survives restarts.
        self.bandit = self._load_bandit()
        self.strategies = self._build_strategies()
        self.cycle_count = int(self.ledger.get_state("cycle_count", "0") or 0)

    # --- setup helpers ---
    def _autonomy_level(self) -> str:
        return self.ledger.get_state("autonomy_level") or self.cfg.get("autonomy_level", "full")

    def _build_strategies(self) -> Dict[str, object]:
        out = {}
        enabled = self.cfg.get("strategies", {})
        for name, cls in STRATEGY_CLASSES.items():
            if enabled.get(name, {}).get("enabled", True):
                out[name] = cls(self.ledger, self.language, self.research,
                                self.assets, self.cfg, seed=self.seed)
        return out

    def _load_bandit(self) -> ThompsonBandit:
        blob = self.ledger.get_state("bandit")
        if blob:
            try:
                return ThompsonBandit.from_json(blob)
            except Exception:
                pass
        return ThompsonBandit(seed=self.seed)

    def _save_bandit(self) -> None:
        self.ledger.set_state("bandit", self.bandit.to_json())

    # --- crash recovery ---
    def recover(self) -> List[str]:
        """On restart, reconcile anything left 'in_progress' so a mid-action
        crash never double-spends."""
        notes = []
        for a in self.ledger.actions_by_status("in_progress"):
            ref = a.get("idempotency_key")
            applied = any(t["external_ref"] == ref for t in self.ledger.transactions(2000)) if ref else False
            if applied:
                self.ledger.update_action_status(a["id"], "executed")
                notes.append(f"recovered action #{a['id']}: ledger effect already applied")
            else:
                # No ledger effect recorded -> safe to mark failed, no double spend.
                self.ledger.update_action_status(a["id"], "failed")
                notes.append(f"recovered action #{a['id']}: no effect found, marked failed")
        return notes

    # --- the cycle ---
    def run_cycle(self) -> CycleReport:
        self.cycle_count += 1
        rng = random.Random(f"{self.seed}:{self.cycle_count}")
        started = time.time()
        balance_before = self.ledger.balance()
        report = CycleReport(cycle=self.cycle_count, started=started,
                             balance_before=balance_before, balance_after=balance_before)

        report.notes += self.recover()

        if self.risk.is_paused():
            report.notes.append(f"PAUSED ({self.risk.pause_reason()}): operating live "
                                 f"assets only, no spending.")
            self._operate_live_assets(rng, report)
            return self._finish_cycle(report)

        if self.risk.capital_exhausted():
            report.notes.append("Capital at/below floor: clean stop on spending; "
                                "operating and reporting on live assets only.")
            self._operate_live_assets(rng, report)
            return self._finish_cycle(report)

        try:
            self._decide_and_act(rng, report)
            self.risk.record_success()
        except InsufficientCapital as e:
            report.notes.append(f"capital guard tripped: {e}")
        except Exception as e:  # any unexpected error feeds the anomaly auto-pause
            report.notes.append(f"error: {e}")
            if self.risk.record_error():
                report.notes.append("ANOMALY AUTO-PAUSE engaged.")

        return self._finish_cycle(report)

    def _decide_and_act(self, rng: random.Random, report: CycleReport) -> None:
        capital = self.ledger.balance()
        funded = self.risk.funded_capital()
        names = list(self.strategies.keys())
        # Focus mode: concentrate on one strategy where there's an edge, rather
        # than spreading the bankroll thin across five shallow plays.
        if self.focus_strategy and self.focus_strategy in self.strategies:
            names = [self.focus_strategy]
        if not names:
            report.notes.append("no strategies enabled")
            return

        # Bandit picks the order to consider strategies (explore vs exploit).
        ranked = [n for n, _ in self.bandit.rank(names)]

        # Evaluate each strategy and collect its best opportunity.
        requests: List[AllocationRequest] = []
        eval_cache = {}
        for name in ranked:
            strat = self.strategies[name]
            lessons = self.memory.relevant(name, limit=6)
            ev = strat.evaluate(capital, {"scorer": self.scorer,
                                          "funded_capital": funded,
                                          "lessons": lessons})
            eval_cache[name] = ev
            if ev.best is None:
                continue
            self.ledger.record_opportunity(name, ev.best.brief, ev.score,
                                           ev.best.est_capital, ev.best.est_return,
                                           status="scored")
            # Unit-economics gate: only request capital if the math clears AFTER
            # Stripe fees. If it doesn't, requested capital is 0 — a deliberate
            # HOLD (we still build the free asset; we just don't spend on it).
            verdict = self.economics.evaluate(ev.best.est_return, ev.best.est_capital)
            req_capital = ev.best.est_capital if verdict.clears else 0.0
            if not verdict.clears and ev.best.est_capital > 0:
                report.notes.append(f"[{name}] HOLD (no good spend): {verdict.reason}")
                self.memory.note(f"hold {name}: {verdict.reason}", strategy=name, weight=2)
            requests.append(AllocationRequest(
                id=name, strategy=name,
                requested_capital=req_capital,
                expected_return=ev.best.est_return, score=ev.score))

        # Allocate capital under all caps.
        caps = AllocationCaps(
            available_capital=capital,
            per_action_cap=self.risk.effective_per_action_cap(),
            per_strategy_cap=self.risk.effective_per_strategy_cap(),
            diversification_cap=self.risk.effective_diversification_cap(),
            hourly_remaining=max(0.0, self.risk.max_spend_per_hour - self.ledger.spend_since(3600)),
            daily_remaining=max(0.0, self.risk.max_spend_per_day - self.ledger.spend_since(86400)),
            floor_amount=self.risk.floor_amount(),
            already_spent={n: self.ledger.strategy_spend(n) for n in names},
        )
        allocations = {a.id: a for a in self.allocator.allocate(requests, caps)}

        # Plan + execute per strategy.
        for name in ranked:
            ev = eval_cache.get(name)
            if not ev or ev.best is None:
                continue
            alloc = allocations.get(name)
            # Cap the opportunity's capital to what the allocator granted.
            granted = alloc.amount if alloc else 0.0
            ev.best.est_capital = min(ev.best.est_capital, granted)
            actions = self.strategies[name].plan(ev.best)
            for action in actions:
                # Promote actions inherit the allocated (possibly reduced) cost.
                if action.meta.get("phase") == "promote":
                    action.cost = min(action.cost, granted)
                self._handle_action(name, action, ev.best.est_return, rng, report)

    def _handle_action(self, strategy: str, action: Action, expected_return: float,
                        rng: random.Random, report: CycleReport) -> None:
        # 1. Guardrails — before anything, every level.
        g = self.guardrails.check(action)
        if not g.allowed:
            report.actions_rejected += 1
            report.notes.append(f"[{strategy}] guardrail {'skip' if g.skipped else 'reject'}: "
                                 f"{action.description} — {g.reason}")
            self.memory.learn_guardrail(strategy, g.reason,
                                        evidence={"action": action.description})
            self.ledger.record_action(strategy=strategy, description=action.description,
                                      cost=action.cost, reversible=action.reversible,
                                      rationale=action.rationale,
                                      status="rejected")
            return

        # 1b. Brand-safety gate: anything published under the REAL brand routes
        # to a human approval queue regardless of autonomy level, unless a
        # separate sandbox identity is configured. Spend is autonomous; the
        # operator's name is not put at risk unattended.
        if action.meta.get("publishes_under_brand") and self.brand_human_gate \
                and not self.sandbox_identity and not self.sim:
            self.approvals.enqueue(action, expected_return)
            report.actions_queued += 1
            report.notes.append(f"[{strategy}] brand-safety gate: queued for human "
                                 f"review (publishes under real brand): {action.description}")
            return

        # 2. Autonomy dial — queue or execute.
        dec = self.autonomy.decide(action)
        if not dec.execute_now:
            self.approvals.enqueue(action, expected_return)
            report.actions_queued += 1
            report.notes.append(f"[{strategy}] queued for approval: {action.description}")
            return

        # 3. Risk check for any spend.
        if action.cost > 0:
            rd = self.risk.check_spend(action.cost, strategy)
            if not rd.allowed:
                report.actions_rejected += 1
                report.notes.append(f"[{strategy}] risk reject: {action.description} — {rd.reason}")
                self.memory.learn_mistake(strategy, f"proposed over-cap spend: {rd.reason}",
                                          evidence={"cost": action.cost})
                self.ledger.record_action(strategy=strategy, description=action.description,
                                          cost=action.cost, reversible=action.reversible,
                                          rationale=action.rationale, status="rejected")
                return

        # 4. Durable, crash-safe execution.
        self._execute_durably(strategy, action, rng, report, expected_return)

    def _execute_durably(self, strategy: str, action: Action, rng: random.Random,
                         report: CycleReport, expected_return: float = 0.0) -> None:
        idem = f"c{self.cycle_count}-{strategy}-{action.meta.get('phase','x')}-{rng.randint(100000,999999)}"
        action_id = self.ledger.record_action(
            strategy=strategy, description=action.description, cost=action.cost,
            reversible=action.reversible, rationale=action.rationale,
            status="planned", idempotency_key=idem)
        self.ledger.update_action_status(action_id, "in_progress")

        strat = self.strategies[strategy]
        result = strat.execute(action, sim=self.sim,
                               context={"rng": rng, "stripe": self.stripe,
                                        "live": not self.sim})

        net = 0.0
        try:
            if result.cost > 0:
                # Re-check at the moment of spend (state may have shifted).
                rd = self.risk.check_spend(result.cost, strategy)
                if not rd.allowed:
                    self.ledger.update_action_status(action_id, "failed")
                    report.notes.append(f"[{strategy}] spend blocked at execution: {rd.reason}")
                    return
                self.ledger.debit(result.cost, strategy=strategy,
                                  description=f"{action.description} (cost)",
                                  reversible=action.reversible, external_ref=idem)
                net -= result.cost
            if result.revenue > 0:
                self.ledger.credit(result.revenue, strategy=strategy,
                                   description=f"{action.description} (revenue)",
                                   reversible=False, external_ref=idem + "-rev")
                net += result.revenue
            self.ledger.update_action_status(action_id, "executed",
                                             external_ref=result.external_ref or idem)
            report.actions_executed += 1
        except InsufficientCapital as e:
            self.ledger.update_action_status(action_id, "failed")
            report.notes.append(f"[{strategy}] insufficient capital at execution: {e}")
            return

        report.net += net
        # Decision-quality logging: predicted net-EV (after fees) vs realized net.
        if action.cost > 0 or result.revenue > 0:
            predicted_net = self.economics.evaluate(expected_return, action.cost).net_ev
            self.calibration.record(strategy, predicted_net, net, action.cost)
        self._learn_from_outcome(strategy, action, result, net)

    def _learn_from_outcome(self, strategy: str, action: Action, result, net: float) -> None:
        opp_type = action.meta.get("opp_type")
        # Bandit reward: net dollars on this action; only meaningful for revenue
        # phases. Build phases (no cost/revenue) carry a tiny exploration signal.
        if action.cost > 0 or result.revenue > 0:
            reward = net
            self.bandit.update(strategy, reward)
            if opp_type:
                self.bandit.update(f"{strategy}:{opp_type}", reward)
            if net > 0:
                self.memory.learn_success(strategy, f"earned {net:.2f} via {action.description}",
                                          opp_type=opp_type, evidence={"net": net})
            elif net < 0:
                self.memory.learn_failure(strategy, f"lost {-net:.2f} on {action.description}",
                                          opp_type=opp_type, evidence={"net": net})

    def _operate_live_assets(self, rng: random.Random, report: CycleReport) -> None:
        """When paused or out of capital: existing assets can still earn. In sim
        this trickles small, zero-cost revenue from prior builds."""
        executed = self.ledger.actions_by_status("executed")
        if not executed:
            return
        for strat_name, strat in self.strategies.items():
            if rng.random() < 0.15:  # occasional passive sale
                rev = round(strat.typical_sale * rng.uniform(0.3, 0.8), 2)
                self.ledger.credit(rev, strategy=strat_name,
                                   description="passive sale from live asset",
                                   reversible=False)
                report.net += rev
                report.notes.append(f"[{strat_name}] passive revenue {rev:.2f} from live asset")

    def _finish_cycle(self, report: CycleReport) -> CycleReport:
        report.balance_after = self.ledger.balance()
        self.ledger.set_state("cycle_count", str(self.cycle_count))
        self.ledger.set_state("last_cycle_ts", str(time.time()))
        # Jot a short notebook entry so Centurion can read back what each cycle
        # did and why — its running log of self-observations.
        delta = "+" if report.net >= 0 else ""
        self.memory.note(
            f"cyc{self.cycle_count} bal {report.balance_after:.0f} net {delta}{report.net:.1f} "
            f"exec {report.actions_executed} rej {report.actions_rejected}",
            weight=1.0)
        self._save_bandit()
        return report

    # --- daemon loop ---
    def run_forever(self, max_cycles: Optional[int] = None,
                    sleep_seconds: Optional[float] = None,
                    heartbeat=None) -> None:
        interval = (sleep_seconds if sleep_seconds is not None
                    else float(self.cfg.get("cycle_interval_minutes", 45)) * 60)
        n = 0
        while True:
            # Run under the auto-debugger: errors are logged + self-healed, never
            # crashing the daemon. Returns None if a cycle had to be recovered.
            report = self.autodebugger.run_cycle()
            # Periodically debug RESULTS too (underperformance), not just crashes.
            if n % 5 == 0:
                self.perf_monitor.evaluate_and_tune()
            if heartbeat:
                heartbeat()
            n += 1
            if max_cycles is not None and n >= max_cycles:
                break
            if self.ledger.balance() >= self.config.target_capital:
                break
            time.sleep(interval)


def build_orchestrator(config_path: Optional[str] = None) -> Orchestrator:
    return Orchestrator(load_config(config_path))
