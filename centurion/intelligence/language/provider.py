"""LanguageProvider interface.

The rest of the system talks to language generation only through this one
interface, so the model is fully swappable. Three implementations ship:
  * LocalLLMProvider  (default in production) — self-hosted model via Ollama
  * TemplateProvider   — zero-ML deterministic copy from fill-in templates
  * StubProvider       — fixed output for tests

CRITICAL: there is no third-party-AI implementation and there must never be.
All inference is local. The contract is a single `generate` method.
"""
from __future__ import annotations

import abc
from typing import Any, Dict, Optional


class LanguageProvider(abc.ABC):
    name: str = "base"

    @abc.abstractmethod
    def generate(self, prompt: str, schema: Optional[Dict[str, Any]] = None
                 ) -> Dict[str, Any] | str:
        """Generate text for `prompt`.

        If `schema` is provided (a dict of field_name -> description), the
        provider returns a dict with exactly those keys. Otherwise it returns a
        plain string. Implementations must be self-hosted/offline.
        """
        raise NotImplementedError

    def available(self) -> bool:
        """Whether this provider can currently serve requests."""
        return True


def get_provider(config: Optional[dict] = None) -> LanguageProvider:
    """Factory: build the configured provider. Defaults to template so the full
    system runs with no model loaded."""
    config = config or {}
    kind = (config.get("language_provider") or "template").lower()
    if kind == "local":
        from .local_llm import LocalLLMProvider
        return LocalLLMProvider(
            model=config.get("model_name", "llama3.1:8b-instruct-q4_K_M"),
        )
    if kind == "stub":
        from .stub import StubProvider
        return StubProvider()
    # default
    from .templates import TemplateProvider
    return TemplateProvider()
