"""Focused regression tests for the liquidation bucket span/extrema lookups.

The bucket route used to read ``min(trade_time), max(trade_time)`` in one
aggregate, which SQLite served with a full covering-index scan. These tests
pin the replacement: two independent extrema endpoint seeks, the unchanged
scan/index threshold, and the unchanged bucket payload.
"""

from __future__ import annotations

import hashlib
import math
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

from app.market.liquidation_store import (
    LIQUIDATION_BUCKET_INTERVAL_MS,
    MONDAY_EPOCH_OFFSET_MS,
    TABLE_SCAN_MIN_RANGE_FRACTION,
    LiquidationStore,
)

BASE_TIME_MS = 1_795_392_000_000  # 2026-11-23T00:00:00Z, a Monday
BASE_SECONDS = BASE_TIME_MS // 1000
MINUTE_MS = 60_000
DAY_MS = 86_400_000


def _event(
    event_id: str,
    trade_time: int,
    *,
    side: str = "long",
    notional: float = 1_000.0,
) -> dict[str, object]:
    return {
        "exchange": "binance",
        "symbol": "BTCUSDT",
        "side": side,
        "price": 80_000.0,
        "quantity": notional / 80_000.0,
        "notional": notional,
        "time": trade_time,
        "trade_time": trade_time,
        "id": event_id,
    }


def _import_event(
    event_id: str,
    trade_time: int,
    *,
    side: str = "long",
    notional: float = 1_000.0,
) -> dict[str, object]:
    event = _event(event_id, trade_time, side=side, notional=notional)
    event["event_time"] = trade_time
    event["order_price"] = None
    return event


def _reference_buckets(
    events: list[dict[str, object]], interval: str
) -> list[dict[str, object]]:
    duration_ms = LIQUIDATION_BUCKET_INTERVAL_MS[interval]
    offset_ms = MONDAY_EPOCH_OFFSET_MS if interval == "1w" else 0
    buckets: dict[int, dict[str, float]] = {}
    for event in events:
        notional = float(event["notional"])
        if not math.isfinite(notional) or notional <= 0:
            continue
        trade_time = int(event["trade_time"])
        bucket_ms = offset_ms + ((trade_time - offset_ms) // duration_ms) * duration_ms
        bucket = buckets.setdefault(bucket_ms // 1000, {"long": 0.0, "short": 0.0})
        bucket[str(event["side"])] += notional
    return [
        {"time": time, "long": values["long"], "short": values["short"]}
        for time, values in sorted(buckets.items())
        if values["long"] > 0 or values["short"] > 0
    ]


class _TracingStore(LiquidationStore):
    """Store that records every SQL statement executed through its connections."""

    def __init__(self, path: Path) -> None:
        self.statements: list[str] = []
        super().__init__(path)

    def _connect(self) -> sqlite3.Connection:
        connection = super()._connect()
        connection.set_trace_callback(self.statements.append)
        return connection

    def aggregate_statements(self) -> list[str]:
        return [
            statement
            for statement in self.statements
            if "GROUP BY bucket_time" in statement
        ]


class _ReadOnlyStore(LiquidationStore):
    """Store interface over a ``mode=ro`` / ``query_only`` connection."""

    def __init__(self, path: Path) -> None:
        self.path = Path(path)

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(
            f"file:{self.path}?mode=ro", uri=True, timeout=5.0
        )
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA query_only = 1")
        return connection


class LiquidationBucketSpanTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "liquidations.sqlite3"
        self.store = LiquidationStore(self.db_path)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_empty_store_returns_no_buckets_and_no_scan_override(self) -> None:
        tracing = _TracingStore(self.db_path)
        tracing.statements.clear()

        self.assertEqual(
            tracing.read_buckets(
                interval="1h",
                start_ms=BASE_TIME_MS,
                end_ms=BASE_TIME_MS + 3_600_000,
            ),
            [],
        )

        extrema = [
            statement
            for statement in tracing.statements
            if "min(trade_time)" in statement or "max(trade_time)" in statement
        ]
        self.assertTrue(any("min(trade_time)" in s for s in extrema))
        self.assertTrue(any("max(trade_time)" in s for s in extrema))
        self.assertFalse(any("min(trade_time), max(trade_time)" in s for s in extrema))

        aggregates = tracing.aggregate_statements()
        self.assertEqual(len(aggregates), 1)
        self.assertNotIn("NOT INDEXED", aggregates[0])

    def test_single_row_is_one_aligned_bucket(self) -> None:
        self.store.insert_event(_event("only", BASE_TIME_MS + 12 * MINUTE_MS))

        self.assertEqual(
            self.store.read_buckets(
                interval="1h",
                start_ms=BASE_TIME_MS,
                end_ms=BASE_TIME_MS + 3_600_000,
            ),
            [{"time": BASE_SECONDS, "long": 1_000.0, "short": 0.0}],
        )

    def test_tied_timestamps_sum_into_one_bucket_in_ascending_order(self) -> None:
        self.store.insert_events(
            [
                _event("tie-late", BASE_TIME_MS + 30 * MINUTE_MS, notional=30.0),
                _event(
                    "tie-long",
                    BASE_TIME_MS,
                    side="long",
                    notional=10.5,
                ),
                _event(
                    "tie-short",
                    BASE_TIME_MS,
                    side="short",
                    notional=20.25,
                ),
                _event(
                    "next-hour",
                    BASE_TIME_MS + 3_600_000,
                    side="short",
                    notional=5.0,
                ),
            ]
        )

        buckets = self.store.read_buckets(
            interval="1h",
            start_ms=BASE_TIME_MS,
            end_ms=BASE_TIME_MS + 2 * 3_600_000,
        )

        self.assertEqual(
            buckets,
            [
                {"time": BASE_SECONDS, "long": 40.5, "short": 20.25},
                {"time": BASE_SECONDS + 3_600, "long": 0.0, "short": 5.0},
            ],
        )
        self.assertEqual(
            [bucket["time"] for bucket in buckets],
            sorted(bucket["time"] for bucket in buckets),
        )
        for bucket in buckets:
            self.assertEqual(set(bucket), {"time", "long", "short"})
            self.assertIsInstance(bucket["time"], int)
            self.assertIsInstance(bucket["long"], float)
            self.assertIsInstance(bucket["short"], float)

    def test_unaligned_half_open_range_and_out_of_order_inserts(self) -> None:
        start_ms = BASE_TIME_MS + 17 * MINUTE_MS + 123
        end_ms = start_ms + 3 * 3_600_000 + 45_000
        rows = [
            _event("inside-late", end_ms - 1, side="short", notional=4.0),
            _event("before", start_ms - 1, notional=100.0),
            _event("inside-first", start_ms, notional=1.0),
            _event("inside-mid", start_ms + 3_600_000, notional=2.0),
            _event("at-end", end_ms, notional=200.0),
        ]
        self.store.insert_events(rows)

        buckets = self.store.read_buckets(
            interval="1h",
            start_ms=start_ms,
            end_ms=end_ms,
        )

        expected = _reference_buckets(
            [
                _event("inside-first", start_ms, notional=1.0),
                _event("inside-mid", start_ms + 3_600_000, notional=2.0),
                _event("inside-late", end_ms - 1, side="short", notional=4.0),
            ],
            "1h",
        )
        self.assertEqual(buckets, expected)

    def test_imported_rows_keep_the_same_unaligned_range_semantics(self) -> None:
        self.store.insert_import_events(
            [
                _import_event(
                    "import-late",
                    BASE_TIME_MS + 2 * 3_600_000,
                    side="short",
                    notional=20.0,
                ),
                _import_event("import-first", BASE_TIME_MS, notional=10.0),
                _import_event(
                    "import-tie",
                    BASE_TIME_MS,
                    side="short",
                    notional=5.0,
                ),
            ]
        )

        aligned = self.store.read_buckets(
            interval="1h",
            start_ms=BASE_TIME_MS,
            end_ms=BASE_TIME_MS + 3 * 3_600_000,
        )
        self.assertEqual(
            aligned,
            [
                {"time": BASE_SECONDS, "long": 10.0, "short": 5.0},
                {"time": BASE_SECONDS + 7_200, "long": 0.0, "short": 20.0},
            ],
        )

        # A range one millisecond into the first bucket excludes both tied
        # rows on the boundary while keeping the later imported row.
        unaligned = self.store.read_buckets(
            interval="1h",
            start_ms=BASE_TIME_MS + 1,
            end_ms=BASE_TIME_MS + 3 * 3_600_000,
        )
        self.assertEqual(
            unaligned,
            [{"time": BASE_SECONDS + 7_200, "long": 0.0, "short": 20.0}],
        )

        with closing(sqlite3.connect(self.db_path)) as connection:
            imported = connection.execute(
                "SELECT COUNT(*) FROM liquidation_events WHERE source = 'import'"
            ).fetchone()[0]
        self.assertEqual(imported, 3)

    def test_day_and_week_buckets_keep_utc_and_monday_alignment(self) -> None:
        sunday_ms = BASE_TIME_MS - 1_000
        self.store.insert_events(
            [
                _event("sunday", sunday_ms, notional=1.0),
                _event("monday", BASE_TIME_MS, notional=2.0),
                _event("monday-night", BASE_TIME_MS + DAY_MS - 1, notional=3.0),
                _event("tuesday", BASE_TIME_MS + DAY_MS, notional=4.0),
            ]
        )

        day_buckets = self.store.read_buckets(
            interval="1d",
            start_ms=sunday_ms,
            end_ms=BASE_TIME_MS + 2 * DAY_MS,
        )
        self.assertEqual(
            day_buckets,
            [
                {"time": sunday_ms // 1000 // 86_400 * 86_400, "long": 1.0, "short": 0.0},
                {"time": BASE_SECONDS, "long": 5.0, "short": 0.0},
                {"time": BASE_SECONDS + 86_400, "long": 4.0, "short": 0.0},
            ],
        )

        week_buckets = self.store.read_buckets(
            interval="1w",
            start_ms=sunday_ms,
            end_ms=BASE_TIME_MS + 604_800_000,
        )
        self.assertEqual(
            week_buckets,
            [
                {"time": BASE_SECONDS - 604_800, "long": 1.0, "short": 0.0},
                {"time": BASE_SECONDS, "long": 9.0, "short": 0.0},
            ],
        )

    def test_scan_and_index_threshold_branches_share_the_same_payload(self) -> None:
        span_ms = 10 * DAY_MS
        tracing = _TracingStore(self.db_path)
        tracing.insert_events(
            [
                _event("range-start", BASE_TIME_MS, notional=1.25),
                _event("span-end", BASE_TIME_MS + span_ms, side="short", notional=9.0),
            ]
        )
        threshold_ms = int(span_ms * TABLE_SCAN_MIN_RANGE_FRACTION)

        tracing.statements.clear()
        index_buckets = tracing.read_buckets(
            interval="1h",
            start_ms=BASE_TIME_MS,
            end_ms=BASE_TIME_MS + threshold_ms - 1,
        )
        index_aggregates = tracing.aggregate_statements()
        self.assertEqual(len(index_aggregates), 1)
        self.assertNotIn("NOT INDEXED", index_aggregates[0])

        tracing.statements.clear()
        scan_buckets = tracing.read_buckets(
            interval="1h",
            start_ms=BASE_TIME_MS,
            end_ms=BASE_TIME_MS + threshold_ms,
        )
        scan_aggregates = tracing.aggregate_statements()
        self.assertEqual(len(scan_aggregates), 1)
        self.assertIn("NOT INDEXED", scan_aggregates[0])

        self.assertEqual(index_buckets, scan_buckets)
        self.assertEqual(
            scan_buckets,
            [{"time": BASE_SECONDS, "long": 1.25, "short": 0.0}],
        )

    def test_extrema_queries_use_the_index_search_endpoint(self) -> None:
        self.store.insert_event(_event("one", BASE_TIME_MS))
        queries = (
            "SELECT min(trade_time) FROM liquidation_events",
            "SELECT max(trade_time) FROM liquidation_events",
        )
        with closing(
            sqlite3.connect(f"file:{self.db_path}?mode=ro", uri=True)
        ) as connection:
            for sql in queries:
                plan = " ".join(
                    str(row[3])
                    for row in connection.execute("EXPLAIN QUERY PLAN " + sql)
                ).upper()
                self.assertIn("SEARCH", plan, (sql, plan))
                self.assertNotIn("SCAN", plan, (sql, plan))
                self.assertIn(
                    "IDX_LIQUIDATION_EVENTS_TRADE_TIME_ID",
                    plan,
                    (sql, plan),
                )

    def test_read_buckets_works_on_a_read_only_database(self) -> None:
        self.store.insert_events(
            [
                _event("readonly-a", BASE_TIME_MS, notional=2.0),
                _event(
                    "readonly-b",
                    BASE_TIME_MS + 1,
                    side="short",
                    notional=3.0,
                ),
            ]
        )
        before_stat = self.db_path.stat()
        before_sha = hashlib.sha256(self.db_path.read_bytes()).hexdigest()

        read_only = _ReadOnlyStore(self.db_path)
        buckets = read_only.read_buckets(
            interval="1h",
            start_ms=BASE_TIME_MS,
            end_ms=BASE_TIME_MS + 3_600_000,
        )

        self.assertEqual(
            buckets,
            [{"time": BASE_SECONDS, "long": 2.0, "short": 3.0}],
        )
        after_stat = self.db_path.stat()
        self.assertEqual(after_stat.st_mtime_ns, before_stat.st_mtime_ns)
        self.assertEqual(
            hashlib.sha256(self.db_path.read_bytes()).hexdigest(),
            before_sha,
        )

    def test_bucket_parity_across_every_interval_with_ties_and_shuffle(self) -> None:
        events: list[dict[str, object]] = []
        for index in range(240):
            trade_time = BASE_TIME_MS + (index % 120) * 3_600_000
            events.append(
                _event(
                    f"parity-{index}",
                    trade_time,
                    side="long" if index % 2 else "short",
                    notional=1_000.25 + (index % 11) * 7.5,
                )
            )
        # 97 is coprime with 240, so this inserts every event out of order.
        for index in range(240):
            event = events[(index * 97) % 240]
            self.store.insert_event(event)

        start_ms = BASE_TIME_MS
        end_ms = BASE_TIME_MS + 5 * DAY_MS
        stored = [
            event
            for event in events
            if start_ms <= int(event["trade_time"]) < end_ms
        ]
        self.assertEqual(len(stored), 240)

        for interval in LIQUIDATION_BUCKET_INTERVAL_MS:
            expected = _reference_buckets(stored, interval)
            actual = self.store.read_buckets(
                interval=interval,
                start_ms=start_ms,
                end_ms=end_ms,
            )
            self.assertEqual(
                [bucket["time"] for bucket in actual],
                [bucket["time"] for bucket in expected],
                interval,
            )
            for actual_bucket, expected_bucket in zip(actual, expected):
                for side in ("long", "short"):
                    self.assertTrue(
                        math.isclose(
                            float(actual_bucket[side]),
                            float(expected_bucket[side]),
                            rel_tol=1e-12,
                            abs_tol=1e-9,
                        ),
                        f"{interval} {actual_bucket['time']} {side}",
                    )


if __name__ == "__main__":
    unittest.main()
