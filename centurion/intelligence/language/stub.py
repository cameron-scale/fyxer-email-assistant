"""StubProvider: fixed, fast output for tests. No ML, no network."""
from __future__ import annotations

from typing import Any, Dict, Optional

from .provider import LanguageProvider


class StubProvider(LanguageProvider):
    name = "stub"

    def __init__(self, canned: Optional[Dict[str, Any]] = None):
        self.canned = canned or {}
        self.calls: list[str] = []

    def generate(self, prompt: str, schema: Optional[Dict[str, Any]] = None
                 ) -> Dict[str, Any] | str:
        self.calls.append(prompt)
        if schema:
            return {key: self.canned.get(key, f"[stub:{key}]") for key in schema}
        return self.canned.get("text", "[stub-text]")

    def available(self) -> bool:
        return True
