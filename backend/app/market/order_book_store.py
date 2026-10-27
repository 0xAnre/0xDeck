"""Persistent storage for Binance USD-M BTCUSDT order-book imbalance samples.

The order-book collector maintains a synchronized local book and computes one
sample per configured price distance every few seconds. This module keeps those
normalized samples in a small SQLite database, completely separate from candle
history and from the liquidation store.

The store is intentionally narrow:

* only normalized samples are persisted (no raw snapshot/diff payloads),
* the collection time + distance form a stable primary key, so retrying the same
  sample cannot add a second row,
* reads are newest-first pages keyed by an exclusive ``before`` timestamp and
  filtered by distance, so chart history always matches the selected distance,
* retention is bounded by pruning the oldest rows.

Tests use a temporary database through ``OXDECK_ORDERBOOK_DB``.
"""

from __future__ import annotations

import os
import sqlite3
import time
from contextlib import closing
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

DEFAULT_DB_FILENAME = ".orderbook.sqlite3"
ORDERBOOK_DB_ENV = "OXDECK_ORDERBOOK_DB"

ORDERBOOK_EXCHANGE = "binance"
ORDERBOOK_SYMBOL = "BTCUSDT"
ORDERBOOK_SOURCE = "binance"

# Percent distance each side of the midpoint. Persisted per distance so history
# never derives one distance from another distance's total.
ORDERBOOK_DISTANCES: tuple[float, ...] = (0.25, 0.5, 1.0, 2.5)
DEFAULT_ORDERBOOK_DISTANCE = 2.5

DEFAULT_HISTORY_LIMIT = 500
MIN_HISTORY_LIMIT = 1
MAX_HISTORY_LIMIT = 1000

# Bounded retention: keep the newest rows only. At one sample per distance every
# ~10s, 100k rows is roughly 2.5 days of history.
DEFAULT_RETENTION_ROWS = 100_000
PRUNE_EVERY_INSERTED_ROWS = 2_000

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS orderbook_samples (
    id TEXT PRIMARY KEY,
    sample_time INTEGER NOT NULL,
    distance REAL NOT NULL,
    mid REAL NOT NULL,
    bid_notional REAL NOT NULL,
    ask_notional REAL NOT NULL,
    imbalance REAL NOT NULL,
    bid_coverage_pct REAL NOT NULL,
    ask_coverage_pct REAL NOT NULL,
    complete INTEGER NOT NULL,
    exchange TEXT NOT NULL,
    symbol TEXT NOT NULL,
    source TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    observed_bid_coverage_pct REAL,
    observed_ask_coverage_pct REAL
)
"""

# Rows written before guaranteed/observed coverage was split do not have the
# observed columns. A pre-existing local ``.orderbook.sqlite3`` must keep
# working, so the columns are added in place (NULL = not recorded).
OBSERVED_COVERAGE_COLUMNS: tuple[str, ...] = (
    "observed_bid_coverage_pct",
    "observed_ask_coverage_pct",
)

INDEX_SQL = """
CREATE INDEX IF NOT EXISTS idx_orderbook_samples_distance_time_id
    ON orderbook_samples (distance, sample_time DESC, id DESC)
"""


def default_orderbook_db_path() -> Path:
    """Default SQLite file lives next to the backend package, not in the repo."""
    return Path(__file__).resolve().parents[2] / DEFAULT_DB_FILENAME


def resolve_orderbook_db_path(path: str | Path | None = None) -> Path:
    if path is not None:
        return Path(path).expanduser()
    configured = os.environ.get(ORDERBOOK_DB_ENV)
    if configured:
        return Path(configured).expanduser()
    return default_orderbook_db_path()


def orderbook_sample_id(distance: float, sample_time: int) -> str:
    return f"{ORDERBOOK_SOURCE}|{ORDERBOOK_SYMBOL}|{distance}|{sample_time}"


@dataclass(frozen=True)
class OrderBookHistoryPage:
    """One newest-first page plus the cursor for the next (older) page."""

    samples: list[dict[str, object]]
    has_more: bool
    next_before: int | None


def _row_to_sample(row: sqlite3.Row) -> dict[str, object]:
    """Return the same normalized shape the WebSocket relay publishes.

    ``bid_coverage_pct`` / ``ask_coverage_pct`` are guaranteed coverage (the
    only source of ``complete``); the observed extrema are reported separately.
    Rows written before the split only stored one coverage value, which was the
    observed one, so it is reused as the observed fallback.
    """
    bid_coverage = float(row["bid_coverage_pct"])
    ask_coverage = float(row["ask_coverage_pct"])
    observed_bid = row["observed_bid_coverage_pct"]
    observed_ask = row["observed_ask_coverage_pct"]
    return {
        "id": row["id"],
        "source": row["source"],
        "exchange": row["exchange"],
        "symbol": row["symbol"],
        "distance": row["distance"],
        "time": row["sample_time"],
        "mid": row["mid"],
        "bid_notional": row["bid_notional"],
        "ask_notional": row["ask_notional"],
        "imbalance": row["imbalance"],
        "bid_coverage_pct": bid_coverage,
        "ask_coverage_pct": ask_coverage,
        "observed_bid_coverage_pct": (
            bid_coverage if observed_bid is None else float(observed_bid)
        ),
        "observed_ask_coverage_pct": (
            ask_coverage if observed_ask is None else float(observed_ask)
        ),
        "complete": bool(row["complete"]),
    }


class OrderBookStore:
    """Small SQLite-backed sample store.

    A fresh connection per call keeps the store independent of the asyncio
    thread and of FastAPI worker threads. WAL mode keeps reads and the single
    collector writer from blocking each other.
    """

    def __init__(
        self,
        path: str | Path | None = None,
        *,
        retention_rows: int = DEFAULT_RETENTION_ROWS,
    ) -> None:
        self.path = resolve_orderbook_db_path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.retention_rows = max(1, int(retention_rows))
        self._inserted_since_prune = 0
        with closing(self._connect()) as connection:
            connection.execute("PRAGMA journal_mode = WAL")
            connection.execute(SCHEMA_SQL)
            self._migrate_observed_coverage_columns(connection)
            connection.execute(INDEX_SQL)
            connection.commit()

    def _migrate_observed_coverage_columns(
        self,
        connection: sqlite3.Connection,
    ) -> None:
        """Add the observed-coverage columns to an older local database."""
        existing = {
            str(row[1])
            for row in connection.execute(
                "PRAGMA table_info(orderbook_samples)"
            ).fetchall()
        }
        for column in OBSERVED_COVERAGE_COLUMNS:
            if column in existing:
                continue
            connection.execute(
                f"ALTER TABLE orderbook_samples ADD COLUMN {column} REAL"
            )

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=5.0)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA busy_timeout = 5000")
        return connection

    def insert_sample(self, sample: dict[str, object]) -> bool:
        """Persist one normalized sample. Returns False for a duplicate id."""
        return self.insert_samples([sample]) > 0

    def insert_samples(self, samples: Iterable[dict[str, object]]) -> int:
        """Persist normalized samples, ignoring rows whose stable id exists."""
        rows = [
            (
                str(sample["id"]),
                int(sample["time"]),  # type: ignore[arg-type]
                float(sample["distance"]),  # type: ignore[arg-type]
                float(sample["mid"]),  # type: ignore[arg-type]
                float(sample["bid_notional"]),  # type: ignore[arg-type]
                float(sample["ask_notional"]),  # type: ignore[arg-type]
                float(sample["imbalance"]),  # type: ignore[arg-type]
                float(sample["bid_coverage_pct"]),  # type: ignore[arg-type]
                float(sample["ask_coverage_pct"]),  # type: ignore[arg-type]
                1 if sample["complete"] else 0,
                str(sample["exchange"]),
                str(sample["symbol"]),
                str(sample["source"]),
                int(time.time() * 1000),
                float(
                    sample.get(  # type: ignore[arg-type]
                        "observed_bid_coverage_pct",
                        sample["bid_coverage_pct"],
                    )
                ),
                float(
                    sample.get(  # type: ignore[arg-type]
                        "observed_ask_coverage_pct",
                        sample["ask_coverage_pct"],
                    )
                ),
            )
            for sample in samples
        ]
        if not rows:
            return 0

        with closing(self._connect()) as connection:
            before = connection.total_changes
            connection.executemany(
                """
                INSERT OR IGNORE INTO orderbook_samples (
                    id, sample_time, distance, mid, bid_notional, ask_notional,
                    imbalance, bid_coverage_pct, ask_coverage_pct, complete,
                    exchange, symbol, source, created_at,
                    observed_bid_coverage_pct, observed_ask_coverage_pct
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                rows,
            )
            connection.commit()
            inserted = connection.total_changes - before

        self._inserted_since_prune += len(rows)
        if self._inserted_since_prune >= PRUNE_EVERY_INSERTED_ROWS:
            self._inserted_since_prune = 0
            self.prune()
        return inserted

    def prune(self, retention_rows: int | None = None) -> int:
        """Delete the oldest rows beyond the retention bound; returns count."""
        keep = max(1, int(retention_rows if retention_rows is not None else self.retention_rows))
        with closing(self._connect()) as connection:
            before = connection.total_changes
            connection.execute(
                """
                DELETE FROM orderbook_samples WHERE rowid IN (
                    SELECT rowid FROM orderbook_samples
                    ORDER BY sample_time DESC, id DESC
                    LIMIT -1 OFFSET ?
                )
                """,
                (keep,),
            )
            connection.commit()
            return connection.total_changes - before

    def read_history(
        self,
        *,
        distance: float = DEFAULT_ORDERBOOK_DISTANCE,
        before: int | None = None,
        limit: int = DEFAULT_HISTORY_LIMIT,
    ) -> OrderBookHistoryPage:
        """Read newest-first samples for one distance, older than an exclusive cursor."""
        safe_limit = max(MIN_HISTORY_LIMIT, min(int(limit), MAX_HISTORY_LIMIT))
        sql = """
            SELECT id, sample_time, distance, mid, bid_notional, ask_notional,
                   imbalance, bid_coverage_pct, ask_coverage_pct, complete,
                   exchange, symbol, source,
                   observed_bid_coverage_pct, observed_ask_coverage_pct
            FROM orderbook_samples
            WHERE distance = ?
        """
        params: list[object] = [float(distance)]
        if before is not None:
            sql += " AND sample_time < ?"
            params.append(int(before))
        sql += " ORDER BY sample_time DESC, id DESC LIMIT ?"
        # One extra row distinguishes "exactly full page" from "more exist".
        params.append(safe_limit + 1)

        with closing(self._connect()) as connection:
            rows = connection.execute(sql, params).fetchall()

        has_more = len(rows) > safe_limit
        page_rows = rows[:safe_limit]
        samples = [_row_to_sample(row) for row in page_rows]
        next_before = (
            int(page_rows[-1]["sample_time"]) if has_more and page_rows else None
        )
        return OrderBookHistoryPage(
            samples=samples,
            has_more=has_more,
            next_before=next_before,
        )


_STORES: dict[Path, OrderBookStore] = {}


def get_orderbook_store(path: str | Path | None = None) -> OrderBookStore:
    """Return a cached store for the resolved path.

    Resolution happens per call so tests can point ``OXDECK_ORDERBOOK_DB`` at a
    temporary file without re-importing the application.
    """
    resolved = resolve_orderbook_db_path(path).resolve()
    store = _STORES.get(resolved)
    if store is None:
        store = OrderBookStore(resolved)
        _STORES[resolved] = store
    return store


def insert_orderbook_samples(
    samples: Iterable[dict[str, object]],
    *,
    store: OrderBookStore | None = None,
) -> int:
    return (store or get_orderbook_store()).insert_samples(samples)


def read_orderbook_history(
    *,
    distance: float = DEFAULT_ORDERBOOK_DISTANCE,
    before: int | None = None,
    limit: int = DEFAULT_HISTORY_LIMIT,
    store: OrderBookStore | None = None,
) -> OrderBookHistoryPage:
    return (store or get_orderbook_store()).read_history(
        distance=distance,
        before=before,
        limit=limit,
    )
