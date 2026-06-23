"""Thompson-sampling multi-armed bandit over strategies and opportunity types.

This is the self-optimizing core. Each strategy (and each opportunity type) is
an arm. The reward signal is realized return on deployed capital — profit per
dollar, which may be negative. We use Gaussian Thompson sampling so the model
handles continuous, possibly-negative rewards (Beta-Bernoulli cannot).

Deterministic by construction: seeded with a fixed RNG, identical inputs and
identical update order produce identical selections. No network, numpy only.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field, asdict
from typing import Dict, List, Optional

import numpy as np


@dataclass
class Arm:
    n: int = 0
    mean: float = 0.0          # running mean reward
    m2: float = 0.0            # sum of squared deviations (Welford) for variance

    def variance(self) -> float:
        if self.n < 2:
            return 1.0          # uninformative prior variance
        return max(self.m2 / (self.n - 1), 1e-6)


class ThompsonBandit:
    def __init__(self, seed: int = 42, prior_mean: float = 0.0,
                 prior_strength: float = 1.0, prior_var: float = 1.0):
        self.rng = np.random.default_rng(seed)
        self.seed = seed
        self.prior_mean = prior_mean
        self.prior_strength = prior_strength
        self.prior_var = prior_var
        self.arms: Dict[str, Arm] = {}

    def ensure_arm(self, name: str) -> Arm:
        if name not in self.arms:
            self.arms[name] = Arm()
        return self.arms[name]

    def update(self, name: str, reward: float) -> None:
        """Online Welford update of the arm's reward distribution from a real
        realized return."""
        arm = self.ensure_arm(name)
        arm.n += 1
        delta = reward - arm.mean
        arm.mean += delta / arm.n
        arm.m2 += delta * (reward - arm.mean)

    def _posterior(self, name: str) -> tuple[float, float]:
        """Posterior mean and std for an arm, blending a weak prior with data."""
        arm = self.ensure_arm(name)
        n = arm.n
        # Normal-mean posterior with a weak prior (prior_strength pseudo-obs).
        post_mean = (self.prior_strength * self.prior_mean + n * arm.mean) / (
            self.prior_strength + n)
        var = arm.variance() if n >= 1 else self.prior_var
        post_var = var / (self.prior_strength + n)
        return post_mean, float(np.sqrt(max(post_var, 1e-9)))

    def sample(self, name: str) -> float:
        mean, std = self._posterior(name)
        return float(self.rng.normal(mean, std))

    def select(self, candidates: List[str]) -> str:
        """Sample each candidate arm's posterior and return the argmax.
        Balances exploiting known winners against exploring new arms."""
        if not candidates:
            raise ValueError("no candidates to select from")
        best, best_val = candidates[0], -np.inf
        for name in candidates:
            val = self.sample(name)
            if val > best_val:
                best, best_val = name, val
        return best

    def rank(self, candidates: List[str]) -> List[tuple[str, float]]:
        scored = [(name, self.sample(name)) for name in candidates]
        scored.sort(key=lambda x: x[1], reverse=True)
        return scored

    # --- persistence (deterministic snapshot) ---
    def to_json(self) -> str:
        return json.dumps({
            "seed": self.seed,
            "prior_mean": self.prior_mean,
            "prior_strength": self.prior_strength,
            "prior_var": self.prior_var,
            "arms": {k: asdict(v) for k, v in self.arms.items()},
        })

    @classmethod
    def from_json(cls, data: str) -> "ThompsonBandit":
        d = json.loads(data)
        b = cls(seed=d["seed"], prior_mean=d["prior_mean"],
                prior_strength=d["prior_strength"], prior_var=d["prior_var"])
        b.arms = {k: Arm(**v) for k, v in d["arms"].items()}
        return b

    def reseed(self, seed: int) -> None:
        self.seed = seed
        self.rng = np.random.default_rng(seed)
