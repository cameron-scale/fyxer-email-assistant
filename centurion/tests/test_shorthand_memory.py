from intelligence.shorthand_memory import ShorthandMemory, _compact
from intelligence.memory import LearningMemory
from ledger import Ledger


def test_header_written_on_create(tmp_path):
    m = ShorthandMemory(tmp_path / "c.mem")
    text = m.path.read_text()
    assert text.startswith("# Centurion shorthand memory")


def test_add_and_recall_roundtrip(tmp_path):
    m = ShorthandMemory(tmp_path / "c.mem")
    m.add("success", "canva template etsy sellers wins big", "print_on_demand",
          "constraint-flip", weight=4)
    lines = m.lines()
    assert len(lines) == 1
    ln = lines[0]
    assert ln.kind == "W"
    assert ln.strategy == "pod"
    assert ln.opp == "cf"
    assert ln.weight == 4


def test_shorthand_is_compact(tmp_path):
    m = ShorthandMemory(tmp_path / "c.mem")
    line = m.add("failure", "lost three dollars on crowded marketplace arbitrage",
                 "reselling_research", "combination", weight=2)
    encoded = line.encode()
    # a memory is tiny — well under 100 bytes
    assert len(encoded) < 100


def test_compact_drops_interior_vowels():
    out = _compact("marketplace competition")
    assert " " in out
    # long words get vowels squeezed out of the interior
    assert "marketplace" not in out


def test_recall_filters_by_strategy_and_ranks_by_weight(tmp_path):
    m = ShorthandMemory(tmp_path / "c.mem")
    m.add("failure", "low value", "digital_products", weight=1)
    m.add("win", "high value", "digital_products", weight=8)
    m.add("win", "other strategy", "print_on_demand", weight=9)
    top = m.recall(strategy="digital_products", limit=5)
    # global (strategy '-') none here; pod excluded
    assert all(l.strategy in ("dp", "-") for l in top)
    assert top[0].weight == 8  # ranked by weight


def test_self_prunes_to_max_lines(tmp_path):
    m = ShorthandMemory(tmp_path / "c.mem", max_lines=10)
    for i in range(50):
        m.add("insight", f"note number {i}", weight=(i % 9))
    assert len(m.lines()) <= 10


def test_learning_memory_writes_notebook(tmp_path):
    ledger = Ledger(tmp_path / "n.db")
    ledger.seed(100.0)
    mem = LearningMemory(ledger)
    mem.learn_success("digital_products", "template pack sold well", opp_type="analogy")
    mem.note("cyc1 bal 105 net +5")
    assert mem.notebook_size() > 0
    digest = mem.notebook_digest(limit=10)
    assert "win" in digest or "insight" in digest
