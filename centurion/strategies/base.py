"""Common strategy interface.

Each strategy is research-and-build heavy and spend-light by design: it creates
value before money goes out. The orchestrator drives strategies through this
interface and never reaches inside them.

Contract:
  evaluate(capital, context) -> StrategyEvaluation  (opportunity score + plan)
  plan(opportunity)          -> list[Action]         (concrete next actions)
  execute(action, sim)       -> ExecutionResult      (performs / simulates it)
  metrics()                  -> dict                  (live performance)
"""
from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from guardrails import Action
from intelligence.asset_factory import AssetFactory
from intelligence.decision_core.scoring import Opportunity, ScoringModel
from intelligence.language.provider import LanguageProvider
from intelligence.research import ResearchEngine
from ledger import Ledger


@dataclass
class StrategyEvaluation:
    score: float
    opportunities: List[Opportunity]
    best: Optional[Opportunity]
    capital_plan: float            # capital this strategy would like to deploy


@dataclass
class ExecutionResult:
    success: bool
    cost: float = 0.0              # money that should leave the ledger
    revenue: float = 0.0          # money that should enter the ledger
    external_ref: Optional[str] = None
    detail: str = ""
    reversible: bool = False


class Strategy:
    name: str = "base"
    # default economics knobs a subclass can tune
    base_conversion: float = 0.10  # simulated probability a built asset earns
    typical_sale: float = 18.0     # simulated revenue per conversion

    def __init__(self, ledger: Ledger, language: LanguageProvider,
                 research: ResearchEngine, assets: AssetFactory,
                 config: Optional[dict] = None, seed: int = 42):
        self.ledger = ledger
        self.language = language
        self.research = research
        self.assets = assets
        self.config = config or {}
        self.seed = seed

    # --- evaluate ---
    def evaluate(self, capital: float, context: Optional[dict] = None
                 ) -> StrategyEvaluation:
        context = context or {}
        scorer: ScoringModel = context.get("scorer") or ScoringModel(
            self.config.get("scoring_weights"))
        funded = context.get("funded_capital", capital)
        lessons = context.get("lessons")
        # Rotate the idea pool every few cycles and skip topics that already
        # shipped, so the catalog GROWS instead of regenerating one product.
        epoch = int(context.get("cycle_count", 0)) // 3
        opps = self.research.ideate(self.name, capital, n=6, lessons=lessons,
                                    epoch=epoch)
        existing = {p.get("title", "").lower() for p in self.ledger.products()}
        if existing:
            fresh = [o for o in opps
                     if not any(t and t in o.brief.lower() for t in existing)]
            opps = fresh or opps
        ranked = scorer.rank(opps, funded)
        best, best_score = (ranked[0] if ranked else (None, 0.0))
        capital_plan = min(best.est_capital if best else 0.0, capital)
        return StrategyEvaluation(score=best_score, opportunities=opps,
                                  best=best, capital_plan=capital_plan)

    # --- plan ---
    def plan(self, opportunity: Opportunity) -> List[Action]:
        """Default plan: build the asset (free) then optionally promote (spend
        within cap). Subclasses override to shape the work and the offer."""
        topic = opportunity.brief
        actions = [Action(
            strategy=self.name,
            description=f"Build & list asset: {topic}",
            cost=0.0, reversible=True, legality="clear", tos_compliant=True,
            rationale=f"Score {opportunity.brief}; spend-light value creation first.",
            meta={"phase": "build", "opp_type": opportunity.opp_type},
        )]
        if opportunity.est_capital > 0:
            actions.append(Action(
                strategy=self.name,
                description=f"Promote listing within cap: {topic}",
                cost=round(opportunity.est_capital, 2),
                reversible=False, legality="clear", tos_compliant=True,
                rationale="Small, capped promotion to test demand.",
                meta={"phase": "promote", "opp_type": opportunity.opp_type},
            ))
        return actions

    # --- execute (real or simulated) ---
    def execute(self, action: Action, sim: bool = True,
                context: Optional[dict] = None) -> ExecutionResult:
        context = context or {}
        if sim:
            return self._simulate(action, context)
        return self._execute_live(action, context)

    def _simulate(self, action: Action, context: dict) -> ExecutionResult:
        """Seeded, deterministic-per-cycle simulation of market response so the
        bandit gets a real reward signal during dry runs."""
        rng: random.Random = context.get("rng") or random.Random(self.seed)
        phase = action.meta.get("phase", "build")
        if phase == "build":
            # building costs nothing and produces an asset; revenue comes later
            return ExecutionResult(True, cost=0.0, revenue=0.0,
                                   external_ref=f"sim-asset-{rng.randint(1000,9999)}",
                                   detail="asset built (sim)", reversible=True)
        # promote / sell phase: spend the cost, win revenue with some probability
        conv = self.base_conversion + (0.15 if action.cost > 0 else 0.0)
        hit = rng.random() < conv
        revenue = 0.0
        if hit:
            units = rng.randint(1, 3)
            revenue = round(units * self.typical_sale * rng.uniform(0.7, 1.4), 2)
        return ExecutionResult(success=True, cost=action.cost, revenue=revenue,
                               external_ref=f"sim-{rng.randint(10000,99999)}",
                               detail=f"sim sale: {revenue:.2f} from {action.cost:.2f} spend",
                               reversible=False)

    def _execute_live(self, action: Action, context: dict) -> ExecutionResult:
        """Live execution hook. Subclasses wire real integrations here. Default
        is a safe no-op that reports it could not act live, so nothing silently
        spends real money."""
        return ExecutionResult(False, cost=0.0, revenue=0.0,
                               detail="no live integration configured; skipped")

    # --- metrics ---
    def metrics(self) -> Dict[str, Any]:
        spent = self.ledger.strategy_spend(self.name)
        # revenue credited under this strategy
        txns = [t for t in self.ledger.transactions(1000)
                if t["strategy"] == self.name and t["type"] == "credit"]
        revenue = sum(t["amount"] for t in txns)
        return {
            "strategy": self.name,
            "spent": round(spent, 2),
            "revenue": round(revenue, 2),
            "net": round(revenue - spent, 2),
        }
