"""Transparent expected-value scoring model for opportunities.

Deliberately rules-based and auditable line by line: no black box, no
hallucination. Each opportunity is scored on four interpretable factors and
combined with tunable weights from config. Once enough realized data exists,
the same feature vector can be fed to a small offline scikit-learn regressor
(see `fit_regressor`) — still fully owned, still offline.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional

DEFAULT_WEIGHTS = {
    "ev_per_dollar": 0.40,
    "ev_per_hour": 0.25,
    "capital_at_risk_penalty": 0.25,
    "time_to_revenue_penalty": 0.10,
}

# Normalization horizons keep the score in a sane, comparable range.
TIME_HORIZON_DAYS = 14.0      # revenue beyond two weeks is heavily discounted
EV_PER_DOLLAR_CAP = 5.0       # cap so one wild estimate can't dominate
EV_PER_HOUR_CAP = 50.0        # USD/hour


@dataclass
class Opportunity:
    strategy: str
    brief: str
    est_return: float          # expected revenue (USD)
    est_capital: float         # capital at risk (USD)
    est_build_hours: float     # hours of build effort
    time_to_revenue_days: float
    # opportunity type within a strategy, used as a bandit arm too
    opp_type: str = "default"

    def ev_per_dollar(self) -> float:
        if self.est_capital <= 0:
            # near-zero capital opportunities: cap the ratio rather than /0
            return EV_PER_DOLLAR_CAP
        return min(self.est_return / self.est_capital, EV_PER_DOLLAR_CAP)

    def ev_per_hour(self) -> float:
        hours = max(self.est_build_hours, 0.25)
        return min((self.est_return - self.est_capital) / hours, EV_PER_HOUR_CAP)

    def capital_at_risk_fraction(self, funded_capital: float) -> float:
        if funded_capital <= 0:
            return 1.0
        return min(self.est_capital / funded_capital, 1.0)

    def time_to_revenue_norm(self) -> float:
        return min(self.time_to_revenue_days / TIME_HORIZON_DAYS, 1.0)


class ScoringModel:
    def __init__(self, weights: Optional[Dict[str, float]] = None):
        self.weights = dict(DEFAULT_WEIGHTS)
        if weights:
            self.weights.update(weights)
        self._regressor = None  # optional fitted sklearn model

    def features(self, opp: Opportunity, funded_capital: float) -> Dict[str, float]:
        return {
            "ev_per_dollar": opp.ev_per_dollar() / EV_PER_DOLLAR_CAP,
            "ev_per_hour": opp.ev_per_hour() / EV_PER_HOUR_CAP,
            "capital_at_risk": opp.capital_at_risk_fraction(funded_capital),
            "time_to_revenue": opp.time_to_revenue_norm(),
        }

    def score(self, opp: Opportunity, funded_capital: float) -> float:
        if self._regressor is not None:
            return self._score_regressor(opp, funded_capital)
        f = self.features(opp, funded_capital)
        w = self.weights
        return (
            w["ev_per_dollar"] * f["ev_per_dollar"]
            + w["ev_per_hour"] * f["ev_per_hour"]
            - w["capital_at_risk_penalty"] * f["capital_at_risk"]
            - w["time_to_revenue_penalty"] * f["time_to_revenue"]
        )

    def rank(self, opps: List[Opportunity], funded_capital: float
             ) -> List[tuple[Opportunity, float]]:
        scored = [(o, self.score(o, funded_capital)) for o in opps]
        scored.sort(key=lambda x: x[1], reverse=True)
        return scored

    # --- optional offline regressor (kept fully local) ---
    def fit_regressor(self, opps: List[Opportunity], realized_returns: List[float],
                      funded_capital: float) -> bool:
        """Fit a small linear regressor on realized data, if scikit-learn is
        available and there is enough data. Returns True if a model was fit."""
        try:
            from sklearn.linear_model import Ridge
        except Exception:
            return False
        if len(opps) < 8:
            return False
        X = [list(self.features(o, funded_capital).values()) for o in opps]
        model = Ridge(alpha=1.0)
        model.fit(X, realized_returns)
        self._regressor = model
        return True

    def _score_regressor(self, opp: Opportunity, funded_capital: float) -> float:
        X = [list(self.features(opp, funded_capital).values())]
        return float(self._regressor.predict(X)[0])
