"""Ledger and accounting: the single source of truth for capital.

Backed by SQLite. Enforces that available capital never goes negative at the
data layer (a debit larger than the balance raises InsufficientCapital). The
Risk Manager enforces the richer caps; the Ledger enforces the floor of zero.

Schema (minimum per brief):
  transactions(id, ts, strategy, type[credit|debit|fee], amount,
               balance_after, description, reversible, external_ref)
  opportunities(id, ts, strategy, brief, score, status, est_capital, est_return)
  actions(id, ts, strategy, description,
          status[planned|queued|approved|rejected|in_progress|executed|failed],
          cost, reversible, rationale, idempotency_key, external_ref)
  state(key, value)
"""
from __future__ import annotations

import sqlite3
import threading
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterable, Optional

SEED_DESCRIPTION = "seed capital"


class InsufficientCapital(Exception):
    """Raised when a debit would drive available capital below zero."""


SCHEMA = """
CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts REAL NOT NULL,
    strategy TEXT,
    type TEXT NOT NULL CHECK(type IN ('credit','debit','fee')),
    amount REAL NOT NULL CHECK(amount >= 0),
    balance_after REAL NOT NULL,
    description TEXT,
    reversible INTEGER NOT NULL DEFAULT 0,
    external_ref TEXT
);

CREATE TABLE IF NOT EXISTS opportunities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts REAL NOT NULL,
    strategy TEXT NOT NULL,
    brief TEXT,
    score REAL,
    status TEXT NOT NULL DEFAULT 'identified',
    est_capital REAL,
    est_return REAL
);

CREATE TABLE IF NOT EXISTS actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts REAL NOT NULL,
    strategy TEXT,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'planned',
    cost REAL NOT NULL DEFAULT 0,
    reversible INTEGER NOT NULL DEFAULT 0,
    rationale TEXT,
    idempotency_key TEXT UNIQUE,
    external_ref TEXT
);

CREATE TABLE IF NOT EXISTS state (
    key TEXT PRIMARY KEY,
    value TEXT
);

CREATE TABLE IF NOT EXISTS bridge_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts REAL NOT NULL,
    kind TEXT NOT NULL,
    ref TEXT,
    meta TEXT,
    prompt TEXT NOT NULL,
    schema TEXT,
    status TEXT NOT NULL DEFAULT 'queued',
    result TEXT
);
"""


class Ledger:
    def __init__(self, db_path: str | Path):
        self.db_path = str(db_path)
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        self._local = threading.local()
        self._lock = threading.RLock()
        self._init_db()

    # --- connection management ---
    def _conn(self) -> sqlite3.Connection:
        conn = getattr(self._local, "conn", None)
        if conn is None:
            conn = sqlite3.connect(self.db_path, timeout=30)
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA journal_mode=WAL;")
            conn.execute("PRAGMA foreign_keys=ON;")
            self._local.conn = conn
        return conn

    @contextmanager
    def _tx(self):
        conn = self._conn()
        with self._lock:
            try:
                yield conn
                conn.commit()
            except Exception:
                conn.rollback()
                raise

    def _init_db(self) -> None:
        with self._tx() as conn:
            conn.executescript(SCHEMA)

    # --- seeding ---
    def is_seeded(self) -> bool:
        row = self._conn().execute("SELECT COUNT(*) AS c FROM transactions").fetchone()
        return row["c"] > 0

    def seed(self, amount: float) -> float:
        """Seed the ledger with a single 'seed capital' credit. Idempotent-ish:
        refuses to seed twice."""
        if self.is_seeded():
            raise RuntimeError("Ledger already seeded; refusing to re-seed.")
        with self._tx() as conn:
            conn.execute(
                "INSERT INTO transactions (ts, strategy, type, amount, balance_after, "
                "description, reversible, external_ref) VALUES (?,?,?,?,?,?,?,?)",
                (time.time(), None, "credit", float(amount), float(amount),
                 SEED_DESCRIPTION, 0, None),
            )
            self._set_state(conn, "funded_capital", str(float(amount)))
        return self.balance()

    # --- balance ---
    def balance(self) -> float:
        row = self._conn().execute(
            "SELECT balance_after FROM transactions ORDER BY id DESC LIMIT 1"
        ).fetchone()
        return float(row["balance_after"]) if row else 0.0

    def funded_capital(self) -> float:
        v = self.get_state("funded_capital")
        return float(v) if v is not None else 0.0

    def set_funded_capital(self, amount: float) -> None:
        """Update the funded-capital baseline used for risk caps, the multiple,
        and mission progress — WITHOUT rewriting transaction history. Use this
        once the ledger has real activity."""
        with self._tx() as conn:
            self._set_state(conn, "funded_capital", str(float(amount)))

    def reset_seed(self, amount: float) -> float:
        """Reset a fresh ledger to a new seed amount. Only allowed when there has
        been no activity beyond the initial 'seed capital' credit (no revenue,
        no spend) — so it's safe during testing. Rewrites the seed so both the
        balance and the funded-capital baseline become `amount`."""
        rows = self._conn().execute(
            "SELECT COUNT(*) AS c FROM transactions WHERE description != ?",
            (SEED_DESCRIPTION,),
        ).fetchone()
        if rows["c"] > 0:
            raise RuntimeError(
                "Ledger has activity beyond the seed; refusing to rewrite history. "
                "Use set_funded_capital to adjust the baseline instead."
            )
        with self._tx() as conn:
            conn.execute("DELETE FROM transactions")
            conn.execute(
                "INSERT INTO transactions (ts, strategy, type, amount, balance_after, "
                "description, reversible, external_ref) VALUES (?,?,?,?,?,?,?,?)",
                (time.time(), None, "credit", float(amount), float(amount),
                 SEED_DESCRIPTION, 0, None),
            )
            self._set_state(conn, "funded_capital", str(float(amount)))
        return self.balance()

    # --- transactions ---
    def credit(self, amount: float, *, strategy: str | None = None,
               description: str = "", reversible: bool = False,
               external_ref: str | None = None) -> float:
        amount = float(amount)
        if amount < 0:
            raise ValueError("credit amount must be >= 0")
        with self._tx() as conn:
            bal = self._balance(conn) + amount
            conn.execute(
                "INSERT INTO transactions (ts, strategy, type, amount, balance_after, "
                "description, reversible, external_ref) VALUES (?,?,?,?,?,?,?,?)",
                (time.time(), strategy, "credit", amount, bal, description,
                 int(reversible), external_ref),
            )
        return bal

    def debit(self, amount: float, *, strategy: str | None = None,
              description: str = "", reversible: bool = False,
              external_ref: str | None = None, kind: str = "debit") -> float:
        """Record a debit or fee. Raises InsufficientCapital if it would drive
        the balance below zero. This is the data-layer wall: total loss can
        never exceed the funded amount."""
        amount = float(amount)
        if amount < 0:
            raise ValueError("debit amount must be >= 0")
        if kind not in ("debit", "fee"):
            raise ValueError("kind must be 'debit' or 'fee'")
        with self._tx() as conn:
            current = self._balance(conn)
            if amount > current + 1e-9:
                raise InsufficientCapital(
                    f"debit {amount:.2f} exceeds available balance {current:.2f}"
                )
            bal = current - amount
            conn.execute(
                "INSERT INTO transactions (ts, strategy, type, amount, balance_after, "
                "description, reversible, external_ref) VALUES (?,?,?,?,?,?,?,?)",
                (time.time(), strategy, kind, amount, bal, description,
                 int(reversible), external_ref),
            )
        return bal

    def _balance(self, conn: sqlite3.Connection) -> float:
        row = conn.execute(
            "SELECT balance_after FROM transactions ORDER BY id DESC LIMIT 1"
        ).fetchone()
        return float(row["balance_after"]) if row else 0.0

    def spend_since(self, seconds: float) -> float:
        """Total debits+fees in the last `seconds` (for velocity caps)."""
        cutoff = time.time() - seconds
        row = self._conn().execute(
            "SELECT COALESCE(SUM(amount),0) AS s FROM transactions "
            "WHERE type IN ('debit','fee') AND ts >= ?", (cutoff,)
        ).fetchone()
        return float(row["s"])

    def transactions(self, limit: int = 100) -> list[dict]:
        rows = self._conn().execute(
            "SELECT * FROM transactions ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
        return [dict(r) for r in rows]

    # --- opportunities ---
    def record_opportunity(self, strategy: str, brief: str, score: float,
                           est_capital: float, est_return: float,
                           status: str = "identified") -> int:
        with self._tx() as conn:
            cur = conn.execute(
                "INSERT INTO opportunities (ts, strategy, brief, score, status, "
                "est_capital, est_return) VALUES (?,?,?,?,?,?,?)",
                (time.time(), strategy, brief, float(score), status,
                 float(est_capital), float(est_return)),
            )
            return int(cur.lastrowid)

    def update_opportunity_status(self, opp_id: int, status: str) -> None:
        with self._tx() as conn:
            conn.execute("UPDATE opportunities SET status=? WHERE id=?", (status, opp_id))

    # --- actions (durable state machine) ---
    def record_action(self, *, strategy: str | None, description: str, cost: float,
                      reversible: bool, rationale: str, status: str = "planned",
                      idempotency_key: str | None = None) -> int:
        with self._tx() as conn:
            cur = conn.execute(
                "INSERT INTO actions (ts, strategy, description, status, cost, "
                "reversible, rationale, idempotency_key) VALUES (?,?,?,?,?,?,?,?)",
                (time.time(), strategy, description, status, float(cost),
                 int(reversible), rationale, idempotency_key),
            )
            return int(cur.lastrowid)

    def update_action_status(self, action_id: int, status: str,
                             external_ref: str | None = None) -> None:
        with self._tx() as conn:
            if external_ref is not None:
                conn.execute(
                    "UPDATE actions SET status=?, external_ref=? WHERE id=?",
                    (status, external_ref, action_id),
                )
            else:
                conn.execute("UPDATE actions SET status=? WHERE id=?", (status, action_id))

    def get_action(self, action_id: int) -> Optional[dict]:
        row = self._conn().execute("SELECT * FROM actions WHERE id=?", (action_id,)).fetchone()
        return dict(row) if row else None

    def actions_by_status(self, status: str) -> list[dict]:
        rows = self._conn().execute(
            "SELECT * FROM actions WHERE status=? ORDER BY id", (status,)
        ).fetchall()
        return [dict(r) for r in rows]

    def actions(self, limit: int = 100) -> list[dict]:
        rows = self._conn().execute(
            "SELECT * FROM actions ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
        return [dict(r) for r in rows]

    def strategy_spend(self, strategy: str) -> float:
        row = self._conn().execute(
            "SELECT COALESCE(SUM(amount),0) AS s FROM transactions "
            "WHERE type IN ('debit','fee') AND strategy=?", (strategy,)
        ).fetchone()
        return float(row["s"])

    # --- state ---
    def _set_state(self, conn: sqlite3.Connection, key: str, value: str) -> None:
        conn.execute(
            "INSERT INTO state (key, value) VALUES (?,?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, value)
        )

    def set_state(self, key: str, value: Any) -> None:
        # Retry briefly on transient "database is locked" — the in-process agent
        # and the web worker write the same DB, so a save can momentarily collide
        # with an agent write (this surfaced as a 500 on the settings save).
        for attempt in range(6):
            try:
                with self._tx() as conn:
                    self._set_state(conn, key, str(value))
                return
            except sqlite3.OperationalError as e:
                if "locked" in str(e).lower() and attempt < 5:
                    time.sleep(0.2 * (attempt + 1))
                    continue
                raise

    # --- storefront payment links (surfaced on the dashboard) ---
    def add_payment_link(self, url: str, product: str) -> None:
        import json
        links = self.payment_links()
        if any(l.get("url") == url for l in links):
            return
        links.insert(0, {"url": url, "product": product, "ts": time.time()})
        self.set_state("payment_links", json.dumps(links[:12]))

    def payment_links(self) -> list[dict]:
        import json
        raw = self.get_state("payment_links")
        try:
            return json.loads(raw) if raw else []
        except Exception:
            return []

    # --- real products (sellable + deliverable) ---
    def record_product(self, product: dict) -> None:
        import json
        items = [p for p in self.products() if p.get("slug") != product.get("slug")]
        items.insert(0, product)
        self.set_state("products", json.dumps(items[:50]))

    def products(self) -> list[dict]:
        import json
        raw = self.get_state("products")
        try:
            return json.loads(raw) if raw else []
        except Exception:
            return []

    def get_product(self, slug: str) -> Optional[dict]:
        return next((p for p in self.products() if p.get("slug") == slug), None)

    def get_product_by_token(self, token: str) -> Optional[dict]:
        return next((p for p in self.products() if p.get("deliver_token") == token), None)

    # --- growth: SEO content pages (Lane A, owned infra) ---
    def record_content_page(self, page: dict) -> None:
        import json
        items = [p for p in self.content_pages() if p.get("slug") != page.get("slug")]
        items.insert(0, page)
        self.set_state("content_pages", json.dumps(items[:500]))

    def content_pages(self) -> list[dict]:
        import json
        raw = self.get_state("content_pages")
        try:
            return json.loads(raw) if raw else []
        except Exception:
            return []

    def get_content_page(self, slug: str) -> Optional[dict]:
        return next((p for p in self.content_pages() if p.get("slug") == slug), None)

    def incr_page_metric(self, slug: str, field: str) -> None:
        import json
        items = self.content_pages()
        for p in items:
            if p.get("slug") == slug:
                p[field] = int(p.get(field, 0)) + 1
                self.set_state("content_pages", json.dumps(items[:500]))
                return

    def get_state(self, key: str, default: Any = None) -> Any:
        row = self._conn().execute("SELECT value FROM state WHERE key=?", (key,)).fetchone()
        return row["value"] if row else default

    # --- durable learning rewards from real sales ---
    # The webhook (web worker) and the agent are different Orchestrator instances
    # with different in-memory bandits sharing one persisted "bandit" state. If
    # the webhook updated the bandit directly, the agent's next save would clobber
    # it. So real-sale rewards are QUEUED here and the agent drains them into its
    # bandit + calibration at cycle start (single writer, no lost updates).
    def add_pending_reward(self, strategy: str, net: float, cost: float = 0.0) -> None:
        import json
        raw = self.get_state("pending_rewards")
        try:
            items = json.loads(raw) if raw else []
        except Exception:
            items = []
        items.append({"strategy": strategy, "net": float(net), "cost": float(cost),
                      "ts": time.time()})
        self.set_state("pending_rewards", json.dumps(items[-200:]))

    def drain_pending_rewards(self) -> list[dict]:
        import json
        with self._tx() as conn:
            row = conn.execute("SELECT value FROM state WHERE key='pending_rewards'").fetchone()
            if not row or not row["value"]:
                return []
            try:
                items = json.loads(row["value"])
            except Exception:
                items = []
            self._set_state(conn, "pending_rewards", "[]")
        return items

    # --- bridge jobs (local-Ollama quality upgrades, worked by the operator's
    # own machine via token-gated endpoints; inference never leaves owned hardware) ---
    def add_bridge_job(self, kind: str, ref: str, prompt: str,
                       schema: dict | None = None, meta: dict | None = None) -> int:
        import json
        with self._tx() as conn:
            cur = conn.execute(
                "INSERT INTO bridge_jobs (ts, kind, ref, meta, prompt, schema, status) "
                "VALUES (?,?,?,?,?,?, 'queued')",
                (time.time(), kind, ref, json.dumps(meta or {}), prompt,
                 json.dumps(schema or {})))
            return int(cur.lastrowid)

    def bridge_jobs_by_status(self, status: str, limit: int = 10) -> list[dict]:
        rows = self._conn().execute(
            "SELECT * FROM bridge_jobs WHERE status=? ORDER BY id ASC LIMIT ?",
            (status, limit)).fetchall()
        return [dict(r) for r in rows]

    def get_bridge_job(self, job_id: int) -> Optional[dict]:
        row = self._conn().execute(
            "SELECT * FROM bridge_jobs WHERE id=?", (job_id,)).fetchone()
        return dict(row) if row else None

    def set_bridge_status(self, job_id: int, status: str,
                          result: str | None = None) -> None:
        with self._tx() as conn:
            conn.execute("UPDATE bridge_jobs SET status=?, result=? WHERE id=?",
                         (status, result, job_id))
