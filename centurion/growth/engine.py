"""Growth engine — runs the SEO + organic-distribution loop each cycle.

Lane A (autonomous, owned infra): generate/publish SEO pages linking to products,
maintain the page set. Zero paid spend, no third-party identity at risk.
Lane B (draft + approve): generate community/video/outreach drafts and QUEUE them
for one-tap approval. Never auto-posts.

Uses the Decision Core bandit over (template, intent) arms — Thompson sampling
applied to content instead of ads. Emits structured records for every action.
"""
from __future__ import annotations

import time
from typing import List

from .keywords import KeywordPlanner
from .content import ContentFactory, PAGE_TEMPLATES, LANE_B_KINDS
from . import guard


class GrowthEngine:
    def __init__(self, ledger, language, bandit, approvals, alerter=None,
                 max_pages_per_cycle: int = 2, max_drafts_per_cycle: int = 2):
        self.ledger = ledger
        self.planner = KeywordPlanner()
        self.factory = ContentFactory(language)
        self.bandit = bandit            # shared Decision Core bandit
        self.approvals = approvals
        self.alerter = alerter
        self.max_pages = max_pages_per_cycle
        self.max_drafts = max_drafts_per_cycle

    def run(self, products: List[dict], paused: bool = False) -> List[dict]:
        """Returns structured records. If paused/heartbeat-missed, Lane A stops
        publishing (queue only) per the spec."""
        records: List[dict] = []
        if not products:
            return records

        # Pick the product with the fewest pages (spread coverage), deterministic.
        pages = self.ledger.content_pages()
        counts = {}
        for p in pages:
            counts[p["product_slug"]] = counts.get(p["product_slug"], 0) + 1
        product = min(products, key=lambda pr: counts.get(pr.get("slug"), 0))

        import os
        niche = os.environ.get("CENTURION_NICHE", "")
        clusters = self.planner.map(product.get("title", "this"), niche=niche)
        existing_text = [p.get("title", "") + " " + p.get("meta", "") for p in pages]

        # ---- Lane A: publish SEO pages (only when active) ----
        if not paused:
            published = 0
            for cluster in clusters[: max(1, self.max_pages) * 3]:
                if published >= self.max_pages:
                    break
                template = self.bandit.select([f"tpl:{t}" for t in PAGE_TEMPLATES]).split(":", 1)[1]
                page = self.factory.page(cluster.keyword, template, product)
                if page is None:
                    records.append(_rec("A", "owned-seo", f"[rejected non-compliant] {cluster.keyword}",
                                        cluster.keyword, cluster.ev(), "rejected"))
                    continue
                if guard.is_near_duplicate(page.title + " " + page.meta, existing_text):
                    records.append(_rec("A", "owned-seo", f"[skipped duplicate] {page.title}",
                                        cluster.keyword, cluster.ev(), "skipped"))
                    continue
                self._publish(page)
                existing_text.append(page.title + " " + page.meta)
                records.append(_rec("A", "owned-seo", page.title, cluster.keyword,
                                    cluster.ev(), "published", slug=page.slug))
                published += 1

        # ---- Lane B: draft + queue for approval (never auto-post) ----
        drafted = 0
        for cluster in clusters:
            if drafted >= self.max_drafts:
                break
            kind = LANE_B_KINDS[(int(self.ledger.get_state("growth_draft_n", "0") or 0) + drafted)
                                % len(LANE_B_KINDS)]
            d = self.factory.lane_b_draft(kind, cluster.keyword, product)
            if not d["compliant"]:
                records.append(_rec("B", kind, f"[rejected: {d['compliance_note']}]",
                                    cluster.keyword, cluster.ev(), "rejected"))
                continue
            aid = self._queue_lane_b(d, cluster, product)
            drafted += 1
            records.append(_rec("B", kind, d["draft"][:80], cluster.keyword, cluster.ev(),
                                "queued", action_id=aid, platform=d["platform"]))
        if drafted:
            self.ledger.set_state("growth_draft_n",
                                  str(int(self.ledger.get_state("growth_draft_n", "0") or 0) + drafted))
            if self.alerter:
                try:
                    self.alerter.alert(f"Centurion: {drafted} new Lane-B draft(s) awaiting approval.")
                except Exception:
                    pass

        self._save_records(records)
        return records

    # --- helpers ---
    def _publish(self, page) -> None:
        from pathlib import Path
        d = Path(self.ledger.db_path).resolve().parent / "content"
        d.mkdir(parents=True, exist_ok=True)
        f = d / f"{page.slug}.html"
        f.write_text(page.html, encoding="utf-8")
        self.ledger.record_content_page({
            "slug": page.slug, "title": page.title, "meta": page.meta,
            "template": page.template, "cluster": page.cluster,
            "product_slug": page.product_slug, "file": str(f),
            "created": page.created, "views": 0, "clicks": 0})
        try:
            # Queue a local-model rewrite via the Ollama bridge (non-blocking;
            # the template version is live meanwhile).
            import bridge
            from .content import _SECTIONS
            bridge.enqueue_page_upgrade(self.ledger, page.slug, page.title,
                                        _SECTIONS.get(page.template, []))
        except Exception:
            pass

    def _queue_lane_b(self, draft: dict, cluster, product) -> int:
        desc = f"[Lane B · {draft['kind']}] {draft['platform']} — {cluster.keyword}"
        return self.ledger.record_action(
            strategy="growth", description=desc, cost=0.0, reversible=True,
            rationale=draft["draft"], status="queued")

    def _save_records(self, records: List[dict]) -> None:
        import json
        prior = []
        raw = self.ledger.get_state("growth_records")
        try:
            prior = json.loads(raw) if raw else []
        except Exception:
            prior = []
        self.ledger.set_state("growth_records", json.dumps((records + prior)[:60]))


def _rec(lane, channel, asset, cluster, ev, status, **extra) -> dict:
    r = {"lane": lane, "channel": channel, "asset": asset, "cluster": cluster,
         "predicted_ev": ev, "status": status, "ts": time.time()}
    r.update(extra)
    return r
