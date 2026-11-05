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

Historical backfill is *imported* through
``app/market/liquidation_import.py`` (CLI:
``backend/scripts/import_liquidation_parquet.py``). Imported rows share the
table with live rows and are told apart by ``source``:

* ``source = 'live'`` - written by the collector, ``id`` as published today.
* ``source = 'import'`` - written by the parquet importer, ``order_price``
  keeps the source's order price while ``price`` holds the fill price, and
  ``trade_time`` falls back to ``event_time`` because the recorder never
  persisted Binance's ``o.T`` trade time.

Schema changes are additive and idempotent: ``_apply_additive_migrations``
adds any column a pre-existing database is missing, so an old database keeps
working and live rows keep ``source = 'live'``. Tests use a temporary database
through ``OXDECK_LIQUIDATIONS_DB``.
"""

from __future__ import annotations

import os
import sqlite3
import time
from contextlib import closing, contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Iterator

DEFAULT_DB_FILENAME = ".liquidations.sqlite3"
LIQUIDATIONS_DB_ENV = "OXDECK_LIQUIDATIONS_DB"

LIQUIDATIONS_EXCHANGE = "binance"
LIQUIDATIONS_SYMBOL = "BTCUSDT"

DEFAULT_HISTORY_LIMIT = 500
MIN_HISTORY_LIMIT = 1
MAX_HISTORY_LIMIT = 1000

# Buckets are computed on read with a single GROUP BY; there is deliberately no
# bucket table to keep in sync with the event rows. The interval set is the set
# the chart supports, and the bucket durations mirror the frontend's
# `candleIntervalDurationSeconds` so both sides floor an event to the same
# candle open time.
LIQUIDATION_BUCKET_INTERVAL_MS: dict[str, int] = {
    "1m": 60_000,
    "5m": 5 * 60_000,
    "15m": 15 * 60_000,
    "30m": 30 * 60_000,
    "1h": 60 * 60_000,
    "2h": 2 * 60 * 60_000,
    "4h": 4 * 60 * 60_000,
    "1d": 24 * 60 * 60_000,
    "1w": 7 * 24 * 60 * 60_000,
}

# Hard ceiling for one bucket request. A wider range is rejected instead of
# truncated, so a client never renders an incomplete pane as if it were whole.
MAX_BUCKET_COUNT = 20_000

# A bucket request covering at least this share of the stored trade-time span is
# read with a full table scan. SQLite's planner always prefers the
# `trade_time` index, but for a wide range every index entry costs a random
# table-page lookup while a full scan reads the same pages sequentially.
# Measured on a 127k-row / 137-day database: 50% of the span is break-even and
# the full span is ~115 ms indexed vs ~76 ms scanned (CPU time, best of 9).
TABLE_SCAN_MIN_RANGE_FRACTION = 0.5

# Monday 1970-01-05T00:00:00Z. `1w` candles open on Monday, while the Unix epoch
# is a Thursday, so weekly bucket times cannot be floored on the epoch itself.
# Must stay identical to `MONDAY_EPOCH_OFFSET_MS` in
# `src/market/aggregatedLiquidations.ts`.
MONDAY_EPOCH_OFFSET_MS = 4 * 86_400_000

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
    created_at INTEGER NOT NULL,
    source TEXT NOT NULL DEFAULT 'live',
    order_price REAL
)
"""

# Additive columns that older databases do not have yet. Each entry is
# ``(column_name, ALTER TABLE statement)``; ``_apply_additive_migrations``
# applies only the ones missing from ``PRAGMA table_info`` so the migration is
# idempotent and can run on every store construction.
ADDITIVE_COLUMNS: tuple[tuple[str, str], ...] = (
    (
        "source",
        "ALTER TABLE liquidation_events "
        "ADD COLUMN source TEXT NOT NULL DEFAULT 'live'",
    ),
    (
        "order_price",
        "ALTER TABLE liquidation_events ADD COLUMN order_price REAL",
    ),
)

# Seeded by live collection or by the parquet importer.
SOURCE_LIVE = "live"
SOURCE_IMPORT = "import"

INDEX_SQL = """
CREATE INDEX IF NOT EXISTS idx_liquidation_events_trade_time_id
    ON liquidation_events (trade_time DESC, id DESC)
"""


# ``(event_time, side, price, quantity)`` identifies the same market event
# regardless of which collector recorded it. It is deliberately *not* a
# database constraint: live and imported rows may legitimately repeat a
# timestamp, and a global UNIQUE index would reject real live events.
EventContentKey = tuple[int, str, float, float]


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
    """One newest-first page plus the cursor for the next (older) page.

    ``trade_time`` alone is not a total order: several events can share one
    timestamp, and a page boundary that splits such a group would drop its
    tail. ``next_before_id`` makes the cursor a keyset on
    ``(trade_time, id)`` so callers can page without loss.
    """

    events: list[dict[str, object]]
    has_more: bool
    next_before: int | None
    next_before_id: str | None = None


def liquidation_bucket_interval_ms(interval: str) -> int:
    """Bucket duration for a chart interval, or ``ValueError`` when unknown."""
    duration = LIQUIDATION_BUCKET_INTERVAL_MS.get(interval)
    if duration is None:
        raise ValueError(f"Unsupported liquidation bucket interval '{interval}'")
    return duration


def liquidation_bucket_slot_count(
    start_ms: int,
    end_ms: int,
    interval: str,
) -> int:
    """Exact number of bucket slots a half-open ``[start_ms, end_ms)`` range touches."""
    duration_ms = liquidation_bucket_interval_ms(interval)
    if end_ms <= start_ms:
        return 0
    offset_ms = MONDAY_EPOCH_OFFSET_MS if interval == "1w" else 0
    first = (start_ms - offset_ms) // duration_ms
    last = (end_ms - 1 - offset_ms) // duration_ms
    return last - first + 1


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


def _table_columns(connection: sqlite3.Connection) -> set[str]:
    return {
        str(row[1])
        for row in connection.execute(
            "PRAGMA table_info(liquidation_events)"
        ).fetchall()
    }


def _apply_additive_migrations(connection: sqlite3.Connection) -> list[str]:
    """Add any missing additive column. Returns the names that were added.

    Existing rows pick up the declared defaults (``source = 'live'``,
    ``order_price = NULL``), so live history is unchanged by the migration.

    The columns are read outside the write lock, so two processes first-touching
    the same legacy database can race between the check and the ``ALTER``. A
    duplicate-column error therefore means another process already added it and
    is not a failure.
    """
    existing = _table_columns(connection)
    added: list[str] = []
    for column, statement in ADDITIVE_COLUMNS:
        if column in existing:
            continue
        try:
            connection.execute(statement)
        except sqlite3.OperationalError as error:
            if "duplicate column name" not in str(error).lower():
                raise
            continue
        added.append(column)
    return added


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
            _apply_additive_migrations(connection)
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

    def insert_import_events(self, events: Iterable[dict[str, object]]) -> int:
        """Persist events produced by the parquet importer.

        Imported rows carry ``source = 'import'`` and the source's order price
        in ``order_price``; everything else keeps the live row shape. Inserts
        stay ``INSERT OR IGNORE`` on the primary key, so a re-run inserts 0.
        """
        rows = [
            (
                str(event["id"]),
                int(event["trade_time"]),  # type: ignore[arg-type]
                int(event["event_time"]),  # type: ignore[arg-type]
                str(event["side"]),
                float(event["price"]),  # type: ignore[arg-type]
                float(event["quantity"]),  # type: ignore[arg-type]
                float(event["notional"]),  # type: ignore[arg-type]
                str(event["exchange"]),
                str(event["symbol"]),
                int(time.time() * 1000),
                SOURCE_IMPORT,
                (
                    None
                    if event.get("order_price") is None
                    else float(event["order_price"])  # type: ignore[arg-type]
                ),
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
                    notional, exchange, symbol, created_at, source, order_price
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                rows,
            )
            connection.commit()
            return connection.total_changes - before

    def read_history(
        self,
        *,
        before: int | None = None,
        before_id: str | None = None,
        limit: int = DEFAULT_HISTORY_LIMIT,
    ) -> LiquidationHistoryPage:
        """Read newest-first events, optionally older than an exclusive cursor.

        ``before`` alone keeps the historical behaviour (a ``trade_time``
        cursor). Passing ``before_id`` as well switches to a ``(trade_time,
        id)`` keyset so a group of rows sharing one timestamp survives a page
        boundary intact; the existing ``(trade_time DESC, id DESC)`` index
        serves both forms.
        """
        safe_limit = max(MIN_HISTORY_LIMIT, min(int(limit), MAX_HISTORY_LIMIT))
        sql = """
            SELECT id, trade_time, event_time, side, price, quantity,
                   notional, exchange, symbol
            FROM liquidation_events
        """
        params: list[object] = []
        if before is not None:
            if before_id is not None:
                sql += (
                    " WHERE trade_time < ?"
                    " OR (trade_time = ? AND id < ?)"
                )
                params.extend((int(before), int(before), str(before_id)))
            else:
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
        next_before = None
        next_before_id = None
        if has_more and page_rows:
            next_before = int(page_rows[-1]["trade_time"])
            next_before_id = str(page_rows[-1]["id"])
        return LiquidationHistoryPage(
            events=events,
            has_more=has_more,
            next_before=next_before,
            next_before_id=next_before_id,
        )

    def read_buckets(
        self,
        *,
        interval: str,
        start_ms: int,
        end_ms: int,
    ) -> list[dict[str, object]]:
        """Aggregate events in ``[start_ms, end_ms)`` into candle buckets.

        One ``GROUP BY`` over the indexed ``trade_time`` range, no bucket table.
        The expression mirrors the frontend's ``liquidationBucketTime``:
        ``floor(trade_time / duration) * duration`` in whole seconds, with the
        Monday epoch offset for ``1w``. SQLite integer division truncates
        toward zero, which equals floor for every timestamp this store can
        hold (the importer and the relay reject non-positive times).

        Buckets whose notional is not positive are filtered out, matching
        ``bucketAggregatedLiquidationEvents`` which skips such events.
        """
        duration_ms = liquidation_bucket_interval_ms(interval)
        if end_ms <= start_ms:
            return []
        offset_ms = MONDAY_EPOCH_OFFSET_MS if interval == "1w" else 0
        offset_seconds = offset_ms // 1000
        duration_seconds = duration_ms // 1000
        with closing(self._connect()) as connection:
            # Two indexed lookups decide whether this range is wide enough that
            # a sequential table scan beats index probing per event.
            span_start, span_end = connection.execute(
                "SELECT min(trade_time), max(trade_time) FROM liquidation_events"
            ).fetchone()
            scan_table = (
                span_start is not None
                and span_end is not None
                and int(end_ms) - int(start_ms)
                >= (int(span_end) - int(span_start)) * TABLE_SCAN_MIN_RANGE_FRACTION
            )
            source = (
                "liquidation_events NOT INDEXED" if scan_table else "liquidation_events"
            )
            sql = f"""
                SELECT
                    ? + ((trade_time - ?) / ?) * ? AS bucket_time,
                    SUM(CASE WHEN side = 'long' THEN notional ELSE 0 END) AS long_notional,
                    SUM(CASE WHEN side = 'short' THEN notional ELSE 0 END) AS short_notional
                FROM {source}
                WHERE trade_time >= ? AND trade_time < ? AND notional > 0
                GROUP BY bucket_time
                ORDER BY bucket_time ASC
            """
            rows = connection.execute(
                sql,
                (
                    offset_seconds,
                    offset_ms,
                    duration_ms,
                    duration_seconds,
                    int(start_ms),
                    int(end_ms),
                ),
            ).fetchall()

        buckets: list[dict[str, object]] = []
        for row in rows:
            long_notional = float(row[1] or 0.0)
            short_notional = float(row[2] or 0.0)
            # A bucket with only non-positive notionals (possible for a row
            # inserted outside the relay/importer) is not a rendered bucket.
            if long_notional <= 0 and short_notional <= 0:
                continue
            buckets.append(
                {
                    "time": int(row[0]),
                    "long": long_notional,
                    "short": short_notional,
                }
            )
        return buckets


_STORES: dict[Path, LiquidationStore] = {}


@contextmanager
def connect_read_only(
    path: str | Path | None = None,
) -> Iterator[sqlite3.Connection]:
    """Open the database for reads without taking write locks.

    ``mode=ro`` is tried first so a read-only caller cannot mutate the file.
    When another process holds the database in WAL mode and the shared-memory
    file cannot be attached, this falls back to a plain connection; every
    caller only issues ``SELECT`` statements either way.
    """
    resolved = resolve_liquidation_db_path(path)
    try:
        connection = sqlite3.connect(
            f"file:{resolved}?mode=ro", uri=True, timeout=5.0
        )
    except sqlite3.OperationalError:
        connection = sqlite3.connect(resolved, timeout=5.0)
    try:
        connection.row_factory = sqlite3.Row
        yield connection
    finally:
        connection.close()


def read_existing_event_keys(
    path: str | Path | None = None,
    *,
    start: int | None = None,
    end: int | None = None,
) -> set[EventContentKey]:
    """Return ``(event_time, side, price, quantity)`` keys already stored.

    Opens the database read-only, so a dry-run never mutates anything. A
    missing file or a database without the table yields an empty set.
    """
    resolved = resolve_liquidation_db_path(path)
    if not resolved.exists():
        return set()

    sql = "SELECT event_time, side, price, quantity FROM liquidation_events"
    params: list[object] = []
    if start is not None and end is not None:
        sql += " WHERE event_time >= ? AND event_time <= ?"
        params.extend((int(start), int(end)))

    try:
        with connect_read_only(resolved) as connection:
            return {
                (int(row[0]), str(row[1]), float(row[2]), float(row[3]))
                for row in connection.execute(sql, params).fetchall()
            }
    except sqlite3.OperationalError as error:
        if "no such table" in str(error):
            return set()
        raise


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
    before_id: str | None = None,
    limit: int = DEFAULT_HISTORY_LIMIT,
    store: LiquidationStore | None = None,
) -> LiquidationHistoryPage:
    return (store or get_liquidation_store()).read_history(
        before=before,
        before_id=before_id,
        limit=limit,
    )


def read_liquidation_buckets(
    *,
    interval: str,
    start_ms: int,
    end_ms: int,
    store: LiquidationStore | None = None,
) -> list[dict[str, object]]:
    return (store or get_liquidation_store()).read_buckets(
        interval=interval,
        start_ms=start_ms,
        end_ms=end_ms,
    )
