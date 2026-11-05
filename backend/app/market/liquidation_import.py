"""Import historical Binance USD-M BTCUSDT liquidation parquet into the store.

The 0xDeck collector only sees liquidations from the moment it starts; an
earlier recorder (the *Pargalı Ibrahim Library*) persisted the same Binance
``forceOrder`` feed as immutable parquet batches. This module turns those
parquet files into rows of ``backend/.liquidations.sqlite3`` so the existing
history endpoint can serve months instead of days. The CLI lives in
``backend/scripts/import_liquidation_parquet.py``; everything here is importable
so the behaviour is unit-testable.

Source schema (identical across the recorder's layouts)::

    timestamp BIGINT   -- Binance event time `E`, epoch milliseconds
    symbol    VARCHAR  -- 'BTCUSDT'
    side      VARCHAR  -- forceOrder order side: 'BUY' | 'SELL'
    price     DOUBLE   -- order limit price `o.p`
    avg_price DOUBLE   -- average fill price `o.ap`
    quantity  DOUBLE   -- order quantity (always fully filled)
    filled_qty DOUBLE  -- filled quantity `o.z`
    exchange  VARCHAR  -- 'binance_futures'

Mapping onto the normalized event shape (see ``liquidation_store``)::

    event_time  <- timestamp          (Binance `E`, not `o.T`)
    trade_time  <- event_time         (documented fallback: `o.T` was never
                                       persisted by that recorder)
    side        <- SELL -> 'long', BUY -> 'short'
    price       <- avg_price          (the real fill price, like live rows)
    order_price <- price              (kept for provenance; NULL on live rows)
    quantity    <- filled_qty
    notional    <- avg_price * filled_qty
    source      <- 'import'
    id          <- 'import|binance|BTCUSDT|<SIDE>|<event_time>|<price>|<qty>'

The id is derived from the same content key that dedupe uses, so it is stable
across runs and can never collide with a live id (those start with
``binance|``).
"""

from __future__ import annotations

import glob
import math
import sqlite3
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Sequence

import duckdb

from app.market.liquidation_store import (
    LIQUIDATIONS_EXCHANGE,
    LIQUIDATIONS_SYMBOL,
    LiquidationStore,
    connect_read_only,
    read_existing_event_keys,
    resolve_liquidation_db_path,
)

IMPORT_ID_PREFIX = "import"

# Binance publishes `E` in milliseconds. Anything outside this window means the
# file uses a different unit (seconds, microseconds, ...) and is rejected
# instead of silently writing nonsense timestamps.
MIN_EVENT_TIME_MS = 1_000_000_000_000  # 2001-09-09
MAX_EVENT_TIME_MS = 10_000_000_000_000  # 2286-11-20

# forceOrder order side -> affected position side, identical to the live relay.
SIDE_BY_RAW_SIDE = {"SELL": "long", "BUY": "short"}

DEFAULT_BATCH_SIZE = 5_000

PARQUET_COLUMNS = (
    "timestamp",
    "symbol",
    "side",
    "price",
    "avg_price",
    "quantity",
    "filled_qty",
    "exchange",
)

# One row per distinct market event: duplicates inside the source (two
# collectors ran in parallel in 2026-08-08..14) collapse here. `min(price)`
# keeps the order price deterministic if two copies disagree on it.
_GROUP_SQL = """
SELECT
    timestamp   AS event_time,
    side        AS raw_side,
    avg_price   AS price,
    filled_qty  AS quantity,
    min(price)  AS order_price,
    symbol      AS symbol,
    exchange    AS exchange,
    count(*)    AS source_rows
FROM read_parquet(?)
GROUP BY 1, 2, 3, 4, 6, 7
ORDER BY 1
"""


class LiquidationImportError(RuntimeError):
    """Raised when the source or the target database cannot be used."""


@dataclass
class ImportReport:
    """Everything the CLI prints, returned as data so tests can assert on it."""

    db_path: Path
    paths: list[str] = field(default_factory=list)
    files_read: int = 0
    rows_read: int = 0
    distinct_rows: int = 0
    duplicates_collapsed: int = 0
    invalid_rows: int = 0
    already_present: int = 0
    pending: int = 0
    inserted: int = 0
    duplicate_content_keys: int = 0
    batch_failures: int = 0
    source_min_event_time: int | None = None
    source_max_event_time: int | None = None
    elapsed_seconds: float = 0.0
    backup_path: str | None = None
    dry_run: bool = False
    counts_before: dict[str, int] = field(default_factory=dict)
    counts_after: dict[str, int] = field(default_factory=dict)

    @property
    def nothing_usable(self) -> bool:
        """The archive produced no usable event at all.

        A whole archive whose rows are all rejected (schema drift, wrong
        timestamp unit, another symbol) must not look like a successful import
        that inserted nothing. ``pending`` is used rather than ``inserted`` so a
        dry run over a healthy archive is not misread as a failure; a legitimate
        idempotent re-run is excluded because it reports ``already_present`` or
        ``duplicates_collapsed``.
        """
        return (
            self.rows_read > 0
            and self.pending == 0
            and self.already_present == 0
            and self.duplicates_collapsed == 0
        )

    @property
    def has_duplicate_content_keys(self) -> bool:
        return self.duplicate_content_keys > 0

    @property
    def failed(self) -> bool:
        return self.nothing_usable or self.has_duplicate_content_keys

    @property
    def balanced(self) -> bool:
        """``rows_read`` is fully accounted for by the other counters.

        ``pending`` (valid rows that were not already stored) replaces
        ``inserted`` here because a dry run writes nothing.
        """
        return self.rows_read == (
            self.duplicates_collapsed
            + self.invalid_rows
            + self.already_present
            + self.pending
        )


def expand_parquet_paths(patterns: Sequence[str]) -> list[Path]:
    """Expand ``--path`` arguments into a sorted, de-duplicated file list.

    Each argument may be a directory (searched recursively for ``*.parquet``),
    a glob, or a single parquet file. Nothing is ever written to these paths.
    """
    files: list[Path] = []
    for pattern in patterns:
        expanded = str(Path(pattern).expanduser())
        candidate = Path(expanded)
        if candidate.is_dir():
            files.extend(sorted(candidate.rglob("*.parquet")))
        elif any(character in expanded for character in "*?["):
            matches = glob.glob(expanded, recursive=True)
            files.extend(sorted(Path(item) for item in matches))
        elif candidate.is_file():
            files.append(candidate)
        else:
            raise LiquidationImportError(f"--path matched nothing: {pattern}")

    unique = sorted({path.resolve() for path in files})
    if not unique:
        raise LiquidationImportError(
            "--path matched no parquet files: " + ", ".join(patterns)
        )
    return unique


def import_event_id(
    *,
    raw_side: str,
    event_time: int,
    price: float,
    quantity: float,
) -> str:
    """Build the stable, collision-free id of an imported row.

    Derived from the same tuple as ``content_key`` so the id and the dedupe key
    cannot drift apart, and prefixed with ``import|`` so it never collides with
    a live id (``binance|BTCUSDT|S|E|T|z|ap``).
    """
    return "|".join(
        (
            IMPORT_ID_PREFIX,
            LIQUIDATIONS_EXCHANGE,
            LIQUIDATIONS_SYMBOL,
            raw_side,
            str(event_time),
            repr(float(price)),
            repr(float(quantity)),
        )
    )


def content_key(event: dict[str, object]) -> tuple[int, str, float, float]:
    return (
        int(event["event_time"]),  # type: ignore[arg-type]
        str(event["side"]),
        float(event["price"]),  # type: ignore[arg-type]
        float(event["quantity"]),  # type: ignore[arg-type]
    )


def normalize_parquet_row(
    *,
    event_time: object,
    raw_side: object,
    price: object,
    quantity: object,
    order_price: object,
    symbol: object,
    exchange: object,
) -> dict[str, object] | None:
    """Map one parquet row to a normalized event, or ``None`` when invalid.

    Every field is read defensively: a bad row is counted and skipped, it never
    aborts the import.
    """
    side = SIDE_BY_RAW_SIDE.get(raw_side) if isinstance(raw_side, str) else None
    if side is None:
        return None
    if symbol != LIQUIDATIONS_SYMBOL:
        return None
    if not isinstance(exchange, str) or not exchange.startswith("binance"):
        return None
    if isinstance(event_time, bool) or not isinstance(event_time, int):
        return None
    if not MIN_EVENT_TIME_MS < event_time < MAX_EVENT_TIME_MS:
        return None

    safe_price = _positive_float(price)
    safe_quantity = _positive_float(quantity)
    if safe_price is None or safe_quantity is None:
        return None

    notional = safe_price * safe_quantity
    if not math.isfinite(notional) or notional <= 0:
        return None

    order = None if order_price is None else _positive_float(order_price)

    return {
        "id": import_event_id(
            raw_side=str(raw_side),
            event_time=event_time,
            price=safe_price,
            quantity=safe_quantity,
        ),
        "trade_time": event_time,
        "event_time": event_time,
        "side": side,
        "price": safe_price,
        "quantity": safe_quantity,
        "notional": notional,
        "exchange": LIQUIDATIONS_EXCHANGE,
        "symbol": LIQUIDATIONS_SYMBOL,
        "order_price": order,
    }


def _positive_float(value: object) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    number = float(value)
    if not math.isfinite(number) or number <= 0:
        return None
    return number


def backup_database(db_path: Path) -> str | None:
    """Copy the database with SQLite's online backup API. Returns the new path.

    A file copy would miss a live WAL, so the backup API is used even though it
    needs a read connection to the source. The name carries a UTC timestamp
    plus a counter, so two imports started in the same second cannot overwrite
    each other's backup.
    """
    if not db_path.exists():
        return None
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    target = db_path.with_name(f"{db_path.name}.bak-{stamp}")
    suffix = 1
    while target.exists():
        target = db_path.with_name(f"{db_path.name}.bak-{stamp}-{suffix}")
        suffix += 1
    with connect_read_only(db_path) as source:
        with sqlite3.connect(target) as destination:
            source.backup(destination)
    return str(target)


def stored_counts(db_path: Path) -> dict[str, int]:
    """Total / live / import row counts, read-only.

    A pre-migration database has no ``source`` column yet; every row in it is a
    live row, so the total is reported as ``live``.
    """
    counts = {"total": 0, "live": 0, "import": 0}
    if not db_path.exists():
        return counts
    with connect_read_only(db_path) as connection:
        try:
            counts["total"] = int(
                connection.execute(
                    "SELECT count(*) FROM liquidation_events"
                ).fetchone()[0]
            )
        except sqlite3.OperationalError as error:
            # No table yet (a database file that was never initialised):
            # report zero rather than failing the run.
            if "no such table" in str(error).lower():
                return {"total": 0, "live": 0, "import": 0}
            raise
        try:
            rows = connection.execute(
                "SELECT source, count(*) FROM liquidation_events GROUP BY 1"
            ).fetchall()
        except sqlite3.OperationalError as error:
            # A pre-migration database has no `source` column yet: every row in
            # it was written by the collector.
            if "no such column" in str(error).lower():
                counts["live"] = counts["total"]
                return counts
            raise
        for source, count in rows:
            if source in counts:
                counts[str(source)] = int(count)
    return counts


def load_source_rows(paths: Sequence[Path]) -> list[tuple]:
    """Read the source parquet files, collapsing duplicate market events."""
    connection = duckdb.connect()
    try:
        return connection.execute(
            _GROUP_SQL, [[str(path) for path in paths]]
        ).fetchall()
    except duckdb.Error as error:
        raise LiquidationImportError(
            f"cannot read the source parquet ({len(paths)} file(s), first: "
            f"{paths[0]}): {error}"
        ) from error
    finally:
        connection.close()


def count_duplicate_content_keys(db_path: Path) -> int:
    """Count ``(event_time, side, price, quantity)`` groups with >1 row.

    Runs over the whole table after an import so any drift (a future source
    layout, a manual edit) is reported instead of silently accumulating.

    Only the "the database is not there yet" errors are swallowed, matching
    ``stored_counts``: a transient lock must not be reported as "0 duplicates"
    for a table that may well contain some.
    """
    if not db_path.exists():
        return 0
    try:
        with connect_read_only(db_path) as connection:
            return int(
                connection.execute(
                    """
                    SELECT count(*) FROM (
                        SELECT 1 FROM liquidation_events
                        GROUP BY event_time, side, price, quantity
                        HAVING count(*) > 1
                    )
                    """
                ).fetchone()[0]
            )
    except sqlite3.OperationalError as error:
        message = str(error).lower()
        if "no such table" in message or "no such column" in message:
            return 0
        raise


def run_import(
    *,
    path_patterns: Sequence[str],
    db_path: str | Path | None = None,
    dry_run: bool = False,
    backup: bool = True,
    batch_size: int = DEFAULT_BATCH_SIZE,
) -> ImportReport:
    """Import every parquet file matched by ``path_patterns`` into ``db_path``.

    Idempotent: rows already stored with the same
    ``(event_time, side, price, quantity)`` are counted as ``already_present``
    and never duplicated, whether they came from a previous import or from the
    live collector.
    """
    started = time.perf_counter()
    resolved_db = resolve_liquidation_db_path(db_path)
    files = expand_parquet_paths(path_patterns)
    report = ImportReport(
        db_path=resolved_db,
        paths=list(path_patterns),
        files_read=len(files),
        dry_run=dry_run,
    )

    rows = load_source_rows(files)
    report.distinct_rows = len(rows)
    report.rows_read = sum(int(row[7]) for row in rows)
    report.duplicates_collapsed = report.rows_read - report.distinct_rows

    candidates: list[dict[str, object]] = []
    for (
        event_time,
        raw_side,
        price,
        quantity,
        order_price,
        symbol,
        exchange,
        _source_rows,
    ) in rows:
        event = normalize_parquet_row(
            event_time=event_time,
            raw_side=raw_side,
            price=price,
            quantity=quantity,
            order_price=order_price,
            symbol=symbol,
            exchange=exchange,
        )
        if event is None:
            report.invalid_rows += 1
            continue
        candidates.append(event)

    if candidates:
        report.source_min_event_time = min(
            int(event["event_time"])  # type: ignore[arg-type]
            for event in candidates
        )
        report.source_max_event_time = max(
            int(event["event_time"])  # type: ignore[arg-type]
            for event in candidates
        )
    elif rows:
        report.source_min_event_time = min(int(row[0]) for row in rows)
        report.source_max_event_time = max(int(row[0]) for row in rows)

    report.counts_before = stored_counts(resolved_db)
    existing = (
        read_existing_event_keys(
            resolved_db,
            start=report.source_min_event_time,
            end=report.source_max_event_time,
        )
        if candidates
        else set()
    )

    fresh: list[dict[str, object]] = []
    for event in candidates:
        if content_key(event) in existing:
            report.already_present += 1
            continue
        existing.add(content_key(event))
        fresh.append(event)
    report.pending = len(fresh)

    if dry_run or not fresh:
        report.counts_after = stored_counts(resolved_db)
        report.duplicate_content_keys = count_duplicate_content_keys(
            resolved_db
        )
        report.elapsed_seconds = time.perf_counter() - started
        return report

    if backup:
        report.backup_path = backup_database(resolved_db)

    store = LiquidationStore(resolved_db)
    step = max(1, int(batch_size))
    for start in range(0, len(fresh), step):
        batch = fresh[start : start + step]
        report.inserted += store.insert_import_events(batch)

    report.counts_after = stored_counts(resolved_db)
    report.duplicate_content_keys = count_duplicate_content_keys(resolved_db)
    report.elapsed_seconds = time.perf_counter() - started
    return report


def _format_timestamp(value: int | None) -> str:
    if value is None:
        return "-"
    return datetime.fromtimestamp(value / 1000, UTC).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )


def format_report(report: ImportReport) -> str:
    """Render the human-readable CLI report."""
    lines = [
        "liquidation parquet import"
        + (" (dry run, nothing written)" if report.dry_run else ""),
        f"  database          : {report.db_path}",
        f"  paths             : {', '.join(report.paths)}",
        f"  files read        : {report.files_read}",
        f"  rows read         : {report.rows_read}",
        f"  distinct events   : {report.distinct_rows}",
        f"  duplicates folded : {report.duplicates_collapsed}",
        f"  invalid rows      : {report.invalid_rows}",
        f"  already present   : {report.already_present}",
        (
            f"  would insert      : {report.pending}"
            if report.dry_run
            else f"  inserted          : {report.inserted}"
        ),
        f"  source range      : {_format_timestamp(report.source_min_event_time)}"
        f" .. {_format_timestamp(report.source_max_event_time)}",
        f"  rows before       : {_format_counts(report.counts_before)}",
        f"  rows after        : {_format_counts(report.counts_after)}",
        f"  duplicate keys    : {report.duplicate_content_keys}",
        f"  backup            : {report.backup_path or '-'}",
        f"  elapsed           : {report.elapsed_seconds:.2f}s",
    ]
    if report.has_duplicate_content_keys:
        lines.append(
            "  WARNING: the table now holds duplicate "
            "(event_time, side, price, quantity) rows; the import must not be "
            "trusted until they are cleaned up"
        )
    if report.nothing_usable:
        lines.append(
            "  ERROR: the source produced no usable event (every row was "
            "rejected or the archive is not liquidation data)"
        )
    if not report.balanced:
        lines.append(
            "  WARNING: rows read != duplicates + invalid + present + pending"
        )
    elif not report.dry_run and report.inserted != report.pending:
        lines.append(
            f"  WARNING: {report.pending - report.inserted} row(s) were not "
            "inserted (id collision)"
        )
    return "\n".join(lines)


def _format_counts(counts: dict[str, int]) -> str:
    if not counts:
        return "-"
    return (
        f"{counts.get('total', 0)} "
        f"(live {counts.get('live', 0)}, import {counts.get('import', 0)})"
    )
