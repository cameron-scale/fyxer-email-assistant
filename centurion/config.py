"""Configuration loading for Centurion.

Loads config.yaml plus environment (.env if python-dotenv-style file present).
Kept dependency-light: we parse .env ourselves rather than require a package.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict

import yaml

ROOT = Path(__file__).resolve().parent


def _load_dotenv(path: Path) -> None:
    """Minimal .env loader: KEY=VALUE lines, no export, no interpolation."""
    if not path.exists():
        return
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        # Do not clobber values already set in the real environment.
        os.environ.setdefault(key, value)


@dataclass
class Config:
    raw: Dict[str, Any] = field(default_factory=dict)
    root: Path = ROOT

    def get(self, key: str, default: Any = None) -> Any:
        return self.raw.get(key, default)

    def __getitem__(self, key: str) -> Any:
        return self.raw[key]

    @property
    def database_path(self) -> Path:
        p = Path(self.raw.get("database_path", "data/centurion.db"))
        return p if p.is_absolute() else self.root / p

    @property
    def funded_capital(self) -> float:
        return float(self.raw.get("funded_capital", 100.0))

    @property
    def target_capital(self) -> float:
        return float(self.raw.get("target_capital", 1000.0))


def load_config(path: str | os.PathLike | None = None) -> Config:
    cfg_path = Path(path) if path else ROOT / "config.yaml"
    _load_dotenv(ROOT / ".env")
    data: Dict[str, Any] = {}
    if cfg_path.exists():
        data = yaml.safe_load(cfg_path.read_text()) or {}
    return Config(raw=data, root=cfg_path.resolve().parent)


def env(key: str, default: str | None = None) -> str | None:
    return os.environ.get(key, default)
