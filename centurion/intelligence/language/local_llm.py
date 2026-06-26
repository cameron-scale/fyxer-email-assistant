"""LocalLLMProvider: self-hosted open-weights model via Ollama (default),
with the same interface usable for llama.cpp / vLLM OpenAI-compatible servers.

This is the ONLY place a model is called, and it only ever talks to a local /
self-hosted endpoint. A hard check refuses any non-local host so the
"no third-party AI API" invariant cannot be violated by misconfiguration.
"""
from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, Optional
from urllib.parse import urlparse

from .provider import LanguageProvider

# Hosts we consider self-hosted / local. Anything else is refused.
_LOCAL_HOSTS = {"localhost", "127.0.0.1", "0.0.0.0", "::1", "host.docker.internal"}


def _is_local(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    if host in _LOCAL_HOSTS:
        return True
    # private LAN ranges (your own PC / home network) are allowed
    if host.startswith("10.") or host.startswith("192.168."):
        return True
    if re.match(r"^172\.(1[6-9]|2[0-9]|3[0-1])\.", host):
        return True
    if host.endswith(".local"):
        return True
    return False


class LocalLLMProvider(LanguageProvider):
    name = "local"

    def __init__(self, model: str = "llama3.1:8b",
                 host: Optional[str] = None, timeout: float = 120.0):
        self.model = model
        self.host = host or os.environ.get("OLLAMA_HOST", "http://localhost:11434")
        self.timeout = timeout
        if not _is_local(self.host):
            raise ValueError(
                f"LocalLLMProvider refuses non-local host {self.host!r}. "
                "All inference must be self-hosted; no third-party AI endpoints."
            )

    def available(self) -> bool:
        try:
            import requests
            r = requests.get(f"{self.host}/api/tags", timeout=5)
            return r.status_code == 200
        except Exception:
            return False

    def generate(self, prompt: str, schema: Optional[Dict[str, Any]] = None
                 ) -> Dict[str, Any] | str:
        import requests

        if schema:
            field_lines = "\n".join(f"- {k}: {v}" for k, v in schema.items())
            full_prompt = (
                f"{prompt}\n\nReturn ONLY a JSON object with these fields:\n"
                f"{field_lines}\nJSON:"
            )
        else:
            full_prompt = prompt

        payload = {
            "model": self.model,
            "prompt": full_prompt,
            "stream": False,
            "options": {"temperature": 0.9 if schema is None else 0.7},
        }
        if schema:
            payload["format"] = "json"

        resp = requests.post(f"{self.host}/api/generate", json=payload,
                             timeout=self.timeout)
        resp.raise_for_status()
        text = resp.json().get("response", "")

        if not schema:
            return text.strip()
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            m = re.search(r"\{.*\}", text, re.DOTALL)
            data = json.loads(m.group(0)) if m else {}
        # ensure all requested keys exist
        return {k: data.get(k, "") for k in schema}
