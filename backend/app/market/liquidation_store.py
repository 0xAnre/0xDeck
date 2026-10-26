"""Persistent storage for normalized Binance USD-M liquidation events.

The live relay normalizes Binance `forceOrder` snapshots before they reach
clients. This module keeps those normalized events in a small SQLite database
so a browser reload can render the liquidations that were collected while the
backend was running.

The store is intentionally narrow:

* only normalized events are persisted (no raw Binance payloads),
* the relay's stable event `id` is the primary key and inserts use
  ``INSERT OR IGNORE``, so replaying the same snapshot cannot add a second row,
* reads are newest-first pages keyed by an exclusive ``before`` timestamp.

There is no REST backfill of history that predates the collector. Tests use a
temporary database through ``OXDECK_LIQUIDATIONS_DB``.
"""

from __future__ import annotations

import os
import sqlite3
import time
from contextlib import closing
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

DEFAULT_DB_FILENAME = ".liquidations.sqlite3"
LIQUIDATIONS_DB_ENV = "OXDECK_LIQUIDATIONS_DB"

LIQUIDATIONS_EXCHANGE = "binance"
LIQUIDATIONS_SYMBOL = "BTCUSDT"

DEFAULT_HISTORY_LIMIT = 500
MIN_HISTORY_LIMIT = 1
MAX_HISTORY_LIMIT = 1000

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS liquidation_events (
    id TEXT PRIMARY KEY,
    trade_time INTEGER NOT NULL,
    event_time INTEGER NOT NULL,
    side TEXT NOT NULL,
    price REAL NOT NULL,
    quantity REAL NOT NULL,
    notional REAL NOT NULL,
    exchange TEXT NOT NULL,
    symbol TEXT NOT NULL,
    created_at INTEGER NOT NULL
)
"""

INDEX_SQL = """
CREATE INDEX IF NOT EXISTS idx_liquidation_events_trade_time_id
    ON liquidation_events (trade_time DESC, id DESC)
"""


def default_liquidation_db_path() -> Path:
    """Default SQLite file lives next to the backend package, not in the repo."""
    return Path(__file__).resolve().parents[2] / DEFAULT_DB_FILENAME


def resolve_liquidation_db_path(path: str | Path | None = None) -> Path:
    if path is not None:
        return Path(path).expanduser()
    configured = os.environ.get(LIQUIDATIONS_DB_ENV)
    if configured:
        return Path(configured).expanduser()
    return default_liquidation_db_path()


@dataclass(frozen=True)
class LiquidationHistoryPage:
    """One newest-first page plus the cursor for the next (older) page."""

    events: list[dict[str, object]]
    has_more: bool
    next_before: int | None


def _row_to_event(row: sqlite3.Row) -> dict[str, object]:
    """Return the same normalized shape the WebSocket relay publishes."""
    return {
        "exchange": row["exchange"],
        "symbol": row["symbol"],
        "side": row["side"],
        "price": row["price"],
        "quantity": row["quantity"],
        "notional": row["notional"],
        "time": row["event_time"],
        "trade_time": row["trade_time"],
        "id": row["id"],
    }


class LiquidationStore:
    """Small SQLite-backed event store.

    A fresh connection per call keeps the store independent of the asyncio
    thread and of FastAPI worker threads. At liquidation event rates the
    connection setup is negligible, and WAL mode keeps reads and the single
    collector writer from blocking each other.
    """

    def __init__(self, path: str | Path | None = None) -> None:
        self.path = resolve_liquidation_db_path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with closing(self._connect()) as connection:
            connection.execute("PRAGMA journal_mode = WAL")
            connection.execute(SCHEMA_SQL)
            connection.execute(INDEX_SQL)
            connection.commit()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=5.0)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA busy_timeout = 5000")
        return connection

    def insert_event(self, event: dict[str, object]) -> bool:
        """Persist one normalized event. Returns False for a duplicate id."""
        return self.insert_events([event]) > 0

    def insert_events(self, events: Iterable[dict[str, object]]) -> int:
        """Persist normalized events, ignoring rows whose stable id already exists."""
        rows = [
            (
                str(event["id"]),
                int(event["trade_time"]),  # type: ignore[arg-type]
                int(event["time"]),  # type: ignore[arg-type]
                str(event["side"]),
                float(event["price"]),  # type: ignore[arg-type]
                float(event["quantity"]),  # type: ignore[arg-type]
                float(event["notional"]),  # type: ignore[arg-type]
                str(event["exchange"]),
                str(event["symbol"]),
                int(time.time() * 1000),
            )
            for event in events
        ]
        if not rows:
            return 0

        with closing(self._connect()) as connection:
            before = connection.total_changes
            connection.executemany(
                """
                INSERT OR IGNORE INTO liquidation_events (
                    id, trade_time, event_time, side, price, quantity,
                    notional, exchange, symbol, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                rows,
            )
            connection.commit()
            return connection.total_changes - before

    def read_history(
        self,
        *,
        before: int | None = None,
        limit: int = DEFAULT_HISTORY_LIMIT,
    ) -> LiquidationHistoryPage:
        """Read newest-first events, optionally older than an exclusive cursor."""
        safe_limit = max(MIN_HISTORY_LIMIT, min(int(limit), MAX_HISTORY_LIMIT))
        sql = """
            SELECT id, trade_time, event_time, side, price, quantity,
                   notional, exchange, symbol
            FROM liquidation_events
        """
        params: list[object] = []
        if before is not None:
            sql += " WHERE trade_time < ?"
            params.append(int(before))
        sql += " ORDER BY trade_time DESC, id DESC LIMIT ?"
        # One extra row distinguishes "exactly full page" from "more exist".
        params.append(safe_limit + 1)

        with closing(self._connect()) as connection:
            rows = connection.execute(sql, params).fetchall()

        has_more = len(rows) > safe_limit
        page_rows = rows[:safe_limit]
        events = [_row_to_event(row) for row in page_rows]
        next_before = (
            int(page_rows[-1]["trade_time"]) if has_more and page_rows else None
        )
        return LiquidationHistoryPage(
            events=events,
            has_more=has_more,
            next_before=next_before,
        )


_STORES: dict[Path, LiquidationStore] = {}


def get_liquidation_store(path: str | Path | None = None) -> LiquidationStore:
    """Return a cached store for the resolved path.

    Resolution happens per call so tests can point ``OXDECK_LIQUIDATIONS_DB``
    at a temporary file without re-importing the application.
    """
    resolved = resolve_liquidation_db_path(path).resolve()
    store = _STORES.get(resolved)
    if store is None:
        store = LiquidationStore(resolved)
        _STORES[resolved] = store
    return store


def insert_liquidation_event(
    event: dict[str, object],
    *,
    store: LiquidationStore | None = None,
) -> bool:
    return (store or get_liquidation_store()).insert_event(event)


def read_liquidation_history(
    *,
    before: int | None = None,
    limit: int = DEFAULT_HISTORY_LIMIT,
    store: LiquidationStore | None = None,
) -> LiquidationHistoryPage:
    return (store or get_liquidation_store()).read_history(
        before=before,
        limit=limit,
    )
