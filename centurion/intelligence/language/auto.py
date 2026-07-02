"""AutoProvider: use the local model when it's up, fall back to templates when
it isn't — and re-check periodically so installing Ollama LATER 'just works'
with no restart and no config change.

This is the right default for a PC install: the system runs on deterministic
templates out of the box, and the moment a local Ollama model becomes reachable
it upgrades itself to model-generated copy. If the model hiccups mid-run, the
call transparently falls back to the template for that request.

No third-party AI is ever involved — the local arm is LocalLLMProvider, which
hard-refuses any non-local host.
"""
from __future__ import annotations

import time
from typing import Any, Dict, Optional

from .provider import LanguageProvider


class AutoProvider(LanguageProvider):
    def __init__(self, model: str = "llama3.1:8b",
                 recheck_seconds: float = 60.0):
        from .local_llm import LocalLLMProvider
        from .templates import TemplateProvider
        self._local = LocalLLMProvider(model=model)
        self._template = TemplateProvider()
        self._recheck = recheck_seconds
        self._last_check = 0.0
        self._ok = False  # assume down until a cheap check says otherwise

    @property
    def name(self) -> str:  # reflected in the dashboard's system panel
        return "local" if self._ok else "template"

    def _refresh(self) -> None:
        """Cheap, cached availability probe. Never called in the web request
        path (only the agent loop calls generate), so it can't slow the UI."""
        now = time.time()
        if now - self._last_check >= self._recheck:
            self._last_check = now
            self._ok = self._local.available()

    def _active(self) -> LanguageProvider:
        self._refresh()
        return self._local if self._ok else self._template

    def available(self) -> bool:
        return True  # always serves: model if up, else templates

    def generate(self, prompt: str, schema: Optional[Dict[str, Any]] = None
                 ) -> Dict[str, Any] | str:
        prov = self._active()
        if prov is self._local:
            try:
                return self._local.generate(prompt, schema)
            except Exception:
                # model went away mid-run — drop to templates for this call and
                # force a re-probe next time.
                self._ok = False
                self._last_check = 0.0
                return self._template.generate(prompt, schema)
        return self._template.generate(prompt, schema)
