"""Ollama bridge — the operator's own machine becomes Centurion's quality brain.

Problem: the always-on host (Render) is too small to run a local model, and the
"no third-party AI" invariant forbids hosted inference. Solution: the cloud
instance publishes with deterministic templates immediately (business never
blocks), and *also* queues an "upgrade job" for each product/SEO page. A tiny
worker on the operator's Mac/PC (ollama_bridge.py) polls the token-gated bridge
endpoints, runs each job on LOCAL Ollama, and posts the result back. The server
re-checks the compliance guard, then upgrades the artifact file in place.

Inference stays on operator-owned hardware. The wire carries prompts and text,
never keys or money. If the Mac is off, nothing breaks — upgrades just wait.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

from growth import guard


def _clean_section(text: str) -> str:
    """Tidy a model-written section: local models sometimes wrap the opening
    sentence in quotation marks or prepend the section label. Strip those so the
    prose reads clean. Conservative — only touches a leading quoted clause."""
    t = (text or "").strip()
    # Unwrap a leading quoted clause: '"…sentence." rest' -> '…sentence. rest'
    if t[:1] in ('"', "“"):
        rest = t[1:]
        m = re.search(r'["”]', rest)
        t = (rest[:m.start()] + rest[m.end():]).strip() if m else rest.strip()
    # Drop a stray wrapping pair around the whole body.
    if len(t) > 1 and t[0] in ('"', "“") and t[-1] in ('"', "”"):
        t = t[1:-1].strip()
    return t

# Keep the queue small: newest artifacts matter most, and an unbounded queue on
# a $10 operation is noise.
MAX_QUEUED = 12

PRODUCT_SCHEMA = {
    "intro": "2-sentence intro: who this is for and the outcome it enables",
    "what_this_solves": "section: the concrete problem, 2-3 short paragraphs",
    "quick_start": "section: 5 numbered quick-start steps, specific",
    "core_system": "section: the core method/system, 3-4 short paragraphs",
    "templates_checklist": "section: ready-to-use template text + a checklist",
    "next_steps": "section: what to do after, 2 short paragraphs",
}

PRODUCT_HEADINGS = [
    ("what_this_solves", "What this solves"),
    ("quick_start", "Quick start (5 steps)"),
    ("core_system", "The core system"),
    ("templates_checklist", "Templates & checklist"),
    ("next_steps", "Next steps"),
]


def _queued_count(ledger) -> int:
    return len(ledger.bridge_jobs_by_status("queued", limit=MAX_QUEUED + 1))


def enqueue_product_upgrade(ledger, product: dict) -> int | None:
    """Queue a local-model rewrite of a product deliverable. No-op when full."""
    if _queued_count(ledger) >= MAX_QUEUED:
        return None
    title = product.get("title", "")
    prompt = (
        f"You are improving a paid digital product titled '{title}'. "
        f"Write genuinely useful, specific, non-generic content a buyer would be "
        f"glad they paid for. No income or results claims, no fake statistics, "
        f"no fabricated testimonials.")
    return ledger.add_bridge_job(
        "product_upgrade", product.get("slug", ""), prompt,
        schema=PRODUCT_SCHEMA, meta={"title": title})


def enqueue_page_upgrade(ledger, page_slug: str, title: str,
                         headings: list[str]) -> int | None:
    """Queue a local-model rewrite of an SEO page's sections."""
    if _queued_count(ledger) >= MAX_QUEUED:
        return None
    schema = {f"sec{i}": f"section: {h}. 2-3 short paragraphs, useful, no hype, "
                         f"no income/results claims, no fake stats"
              for i, h in enumerate(headings)}
    schema["meta"] = "150-character meta description, plain and useful"
    prompt = (
        f"You are improving an SEO article titled '{title}'. Write specific, "
        f"experience-grade content that would help a reader even if they never "
        f"buy anything. No income claims, no fabricated proof. Write in plain "
        f"prose only: do NOT wrap sentences in quotation marks, do NOT add a "
        f"heading, label, or preamble — return just the paragraph text.")
    return ledger.add_bridge_job(
        "page_upgrade", page_slug, prompt, schema=schema,
        meta={"title": title, "headings": headings})


def apply_result(ledger, job: dict, result: dict) -> tuple[bool, str]:
    """Apply a completed bridge job. Compliance-gate the new text; on failure the
    job is marked failed and the existing (template) artifact stays untouched."""
    kind = job.get("kind")
    if kind == "product_upgrade":
        return _apply_product(ledger, job, result)
    if kind == "page_upgrade":
        return _apply_page(ledger, job, result)
    return False, f"unknown job kind {kind!r}"


def _apply_product(ledger, job: dict, result: dict) -> tuple[bool, str]:
    product = ledger.get_product(job.get("ref", ""))
    if not product:
        return False, "product no longer exists"
    text = " ".join(str(result.get(k, "")) for k in PRODUCT_SCHEMA)
    ok, why = guard.check(text)
    if not ok:
        return False, f"upgrade rejected by compliance guard: {why}"
    from intelligence.asset_factory import AssetFactory
    sections = [(h, str(result.get(key, "")).strip())
                for key, h in PRODUCT_HEADINGS if str(result.get(key, "")).strip()]
    if len(sections) < 3:
        return False, "upgrade too thin; keeping template version"
    html = AssetFactory._render_product_html(
        product.get("title", ""), str(result.get("intro", "")).strip(), sections)
    Path(product["file"]).write_text(html, encoding="utf-8")
    return True, f"product '{product.get('slug')}' upgraded by local model"


def _apply_page(ledger, job: dict, result: dict) -> tuple[bool, str]:
    page = ledger.get_content_page(job.get("ref", ""))
    if not page:
        return False, "page no longer exists"
    meta_info = json.loads(job.get("meta") or "{}")
    headings = meta_info.get("headings") or []
    parts = [(h, _clean_section(str(result.get(f"sec{i}", ""))))
             for i, h in enumerate(headings) if str(result.get(f"sec{i}", "")).strip()]
    if len(parts) < 2:
        return False, "upgrade too thin; keeping template version"
    new_meta = (str(result.get("meta", "")).strip() or page.get("meta", ""))[:160]
    visible = page.get("title", "") + " " + new_meta + " " + " ".join(t for _, t in parts)
    ok, why = guard.check(visible)
    if not ok:
        return False, f"upgrade rejected by compliance guard: {why}"
    from growth.content import ContentFactory
    product = ledger.get_product(page.get("product_slug", "")) or {}
    html = ContentFactory._render(page.get("title", ""), new_meta, parts,
                                  page.get("slug", ""), product)
    Path(page["file"]).write_text(html, encoding="utf-8")
    page["meta"] = new_meta
    ledger.record_content_page(page)
    return True, f"page '{page.get('slug')}' upgraded by local model"
