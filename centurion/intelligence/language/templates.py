"""TemplateProvider: zero-ML, fully deterministic copy generation.

Fills text from templates keyed off the prompt's intent. Used as the default
provider so the entire system runs end to end with no model loaded, and as a
cheap fallback when inference budget is exhausted. Same input -> same output.
"""
from __future__ import annotations

import hashlib
import re
from typing import Any, Dict, Optional

from .provider import LanguageProvider


def _slug(text: str, n: int = 5) -> str:
    words = re.findall(r"[A-Za-z0-9]+", text.lower())
    return "-".join(words[:n]) or "item"


def _stable_pick(options: list[str], seed_text: str) -> str:
    h = int(hashlib.sha256(seed_text.encode()).hexdigest(), 16)
    return options[h % len(options)]


class TemplateProvider(LanguageProvider):
    name = "template"

    def generate(self, prompt: str, schema: Optional[Dict[str, Any]] = None
                 ) -> Dict[str, Any] | str:
        topic = self._extract_topic(prompt)
        if schema:
            return {key: self._field(key, topic, prompt) for key in schema}
        return self._field("text", topic, prompt)

    def _extract_topic(self, prompt: str) -> str:
        m = re.search(r"(?:about|for|on)\s+([A-Za-z0-9 ,'-]{3,60})", prompt)
        if m:
            return m.group(1).strip().rstrip(".")
        return " ".join(prompt.split()[:6]) or "your niche"

    def _field(self, key: str, topic: str, prompt: str) -> str:
        key_l = key.lower()
        if "title" in key_l or "headline" in key_l or "name" in key_l:
            adj = _stable_pick(["Essential", "Practical", "Complete", "Pro"], topic)
            return f"The {adj} {topic.title()} Toolkit"
        if "summary" in key_l or "brief" in key_l:
            return (f"A focused offering targeting demand around {topic}. "
                    f"Low capital to launch, clear value, fast to publish.")
        if "description" in key_l or "copy" in key_l or "body" in key_l:
            return (f"Save hours on {topic}. This pack gives you a ready-to-use "
                    f"system: clear templates, step-by-step guidance, and examples "
                    f"you can apply today. One-time purchase, yours to keep.")
        if "price" in key_l:
            return _stable_pick(["9", "12", "19", "24"], topic)
        if "tags" in key_l or "keywords" in key_l:
            base = _slug(topic, 3).split("-")
            return ", ".join(base + ["template", "guide", "digital"])
        if "slug" in key_l or "handle" in key_l:
            return _slug(topic)
        if "cta" in key_l or "call_to_action" in key_l:
            return f"Get the {topic.title()} Toolkit"
        # generic
        return (f"{topic.title()}: a concise, useful asset built to sell. "
                f"(Deterministic template output.)")

    def available(self) -> bool:
        return True
