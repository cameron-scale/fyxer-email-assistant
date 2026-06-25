import pytest

from growth.keywords import KeywordPlanner, INTENTS
from growth import guard
from growth.content import ContentFactory
from growth.engine import GrowthEngine
from intelligence.decision_core.bandit import ThompsonBandit
from intelligence.language.templates import TemplateProvider
from ledger import Ledger
from approvals import ApprovalQueue

PRODUCT = {"slug": "the-complete-toolkit", "title": "The Complete Toolkit",
           "price": 19.0, "pay_url": "https://buy.stripe.com/x"}


# --- keywords ---
def test_keyword_map_covers_intents_and_sorts_by_ev():
    cs = KeywordPlanner().map("how to fix messy invoices for freelancers")
    assert {c.intent for c in cs} == set(INTENTS)
    evs = [c.ev() for c in cs]
    assert evs == sorted(evs, reverse=True)


def test_keyword_map_deterministic():
    a = KeywordPlanner().map("dog training basics")
    b = KeywordPlanner().map("dog training basics")
    assert [c.keyword for c in a] == [c.keyword for c in b]


# --- content guardrails ---
def test_guard_blocks_income_and_proof():
    assert not guard.check("make $5000 per month passive income")[0]
    assert not guard.check("rated 5 stars by thousands of users")[0]
    assert guard.check("A clear, practical guide to organizing invoices.")[0]


def test_guard_near_duplicate():
    base = "best invoicing tools for freelancers a practical shortlist"
    assert guard.is_near_duplicate(base, [base])
    assert not guard.is_near_duplicate(base, ["completely different topic about dogs"])


# --- content factory ---
def test_page_has_seo_basics_and_links_product():
    f = ContentFactory(TemplateProvider())
    page = f.page("best invoicing for freelancers", "roundup", PRODUCT)
    assert page is not None
    assert "<title>" in page.html and "canonical" in page.html
    assert "application/ld+json" in page.html        # schema markup
    assert f"/go/{page.slug}" in page.html            # internal link to product
    ok, _ = guard.check(page.title + " " + page.meta)
    assert ok


def test_lane_b_draft_shape():
    f = ContentFactory(TemplateProvider())
    d = f.lane_b_draft("reddit_reply", "how to fix messy invoices", PRODUCT)
    assert d["kind"] == "reddit_reply" and d["platform"] and d["draft"]
    assert "compliant" in d


# --- engine ---
@pytest.fixture
def engine(tmp_path):
    led = Ledger(tmp_path / "g.db")
    led.seed(10.0)
    eng = GrowthEngine(led, TemplateProvider(), ThompsonBandit(seed=1),
                       ApprovalQueue(led))
    return led, eng


def test_engine_publishes_laneA_and_queues_laneB(engine):
    led, eng = engine
    recs = eng.run([PRODUCT], paused=False)
    assert any(r["lane"] == "A" and r["status"] == "published" for r in recs)
    assert any(r["lane"] == "B" and r["status"] == "queued" for r in recs)
    # Lane A page actually stored + Lane B queued as actions, never executed
    assert len(led.content_pages()) >= 1
    queued = [a for a in led.actions_by_status("queued") if a["strategy"] == "growth"]
    assert len(queued) >= 1
    assert not any(a["status"] == "executed" for a in led.actions(50) if a["strategy"] == "growth")


def test_engine_paused_queues_only_no_publish(engine):
    led, eng = engine
    recs = eng.run([PRODUCT], paused=True)
    # paused => no Lane A publishing
    assert not any(r["lane"] == "A" and r["status"] == "published" for r in recs)
    assert len(led.content_pages()) == 0
    # Lane B still drafted/queued
    assert any(r["lane"] == "B" for r in recs)


def test_engine_no_products_noop(engine):
    led, eng = engine
    assert eng.run([], paused=False) == []
