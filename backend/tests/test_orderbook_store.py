from __future__ import annotations

import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

from app.market.order_book_store import OrderBookStore, orderbook_sample_id

BASE_TIME_MS = 1_792_000_000_000


def _sample(
    *,
    distance: float = 2.5,
    sample_time: int = BASE_TIME_MS,
    complete: bool = False,
) -> dict[str, object]:
    return {
        "id": orderbook_sample_id(distance, sample_time),
        "source": "binance",
        "exchange": "binance",
        "symbol": "BTCUSDT",
        "distance": distance,
        "time": sample_time,
        "mid": 80_000.0,
        "bid_notional": 1_000_000.0,
        "ask_notional": 900_000.0,
        "imbalance": 5.263,
        "bid_coverage_pct": 0.153,
        "ask_coverage_pct": 0.180,
        "observed_bid_coverage_pct": 0.153,
        "observed_ask_coverage_pct": 0.180,
        "complete": complete,
    }


class OrderBookStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "orderbook.sqlite3"
        self.store = OrderBookStore(self.db_path)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_insert_returns_the_normalized_sample_and_is_idempotent(self) -> None:
        sample = _sample()
        self.assertTrue(self.store.insert_sample(sample))
        self.assertFalse(self.store.insert_sample(sample))

        page = self.store.read_history(distance=2.5, limit=10)
        self.assertEqual(len(page.samples), 1)
        self.assertFalse(page.has_more)
        self.assertIsNone(page.next_before)
        self.assertEqual(page.samples[0], sample)

    def test_reads_newest_first_and_paginates_with_an_exclusive_before(self) -> None:
        for index in range(5):
            self.store.insert_sample(
                _sample(sample_time=BASE_TIME_MS + index * 1_000)
            )

        first = self.store.read_history(distance=2.5, limit=2)
        self.assertEqual(
            [sample["time"] for sample in first.samples],
            [BASE_TIME_MS + 4_000, BASE_TIME_MS + 3_000],
        )
        self.assertTrue(first.has_more)
        self.assertEqual(first.next_before, BASE_TIME_MS + 3_000)

        second = self.store.read_history(
            distance=2.5,
            before=first.next_before,
            limit=10,
        )
        self.assertEqual(
            [sample["time"] for sample in second.samples],
            [BASE_TIME_MS + 2_000, BASE_TIME_MS + 1_000, BASE_TIME_MS],
        )
        self.assertFalse(second.has_more)
        self.assertIsNone(second.next_before)

    def test_distance_filter_keeps_samples_independent(self) -> None:
        for distance in (0.25, 0.5, 1.0, 2.5):
            self.store.insert_sample(
                _sample(distance=distance, sample_time=BASE_TIME_MS)
            )

        for distance in (0.25, 0.5, 1.0, 2.5):
            page = self.store.read_history(distance=distance, limit=10)
            self.assertEqual(len(page.samples), 1)
            self.assertEqual(page.samples[0]["distance"], distance)

        self.assertEqual(
            self.store.read_history(distance=5.0, limit=10).samples,
            [],
        )

    def test_retention_pruning_keeps_the_newest_rows(self) -> None:
        for index in range(6):
            self.store.insert_sample(
                _sample(sample_time=BASE_TIME_MS + index * 1_000)
            )

        removed = self.store.prune(retention_rows=2)
        self.assertEqual(removed, 4)
        page = self.store.read_history(distance=2.5, limit=10)
        self.assertEqual(
            [sample["time"] for sample in page.samples],
            [BASE_TIME_MS + 5_000, BASE_TIME_MS + 4_000],
        )

    def test_reopening_the_database_file_keeps_rows(self) -> None:
        self.store.insert_sample(_sample(sample_time=BASE_TIME_MS + 123))
        del self.store

        reopened = OrderBookStore(self.db_path)
        page = reopened.read_history(distance=2.5, limit=10)
        self.assertEqual(len(page.samples), 1)
        self.assertEqual(page.samples[0]["time"], BASE_TIME_MS + 123)

    def test_schema_matches_the_normalized_sample_columns(self) -> None:
        with closing(sqlite3.connect(self.db_path)) as connection:
            columns = {
                row[1]
                for row in connection.execute(
                    "PRAGMA table_info(orderbook_samples)"
                ).fetchall()
            }
        self.assertEqual(
            columns,
            {
                "id",
                "sample_time",
                "distance",
                "mid",
                "bid_notional",
                "ask_notional",
                "imbalance",
                "bid_coverage_pct",
                "ask_coverage_pct",
                "complete",
                "exchange",
                "symbol",
                "source",
                "created_at",
                "observed_bid_coverage_pct",
                "observed_ask_coverage_pct",
            },
        )

    def test_legacy_database_without_observed_columns_is_migrated(self) -> None:
        legacy_path = Path(self.temp_dir.name) / "legacy.sqlite3"
        legacy_schema = """
        CREATE TABLE orderbook_samples (
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
            created_at INTEGER NOT NULL
        )
        """
        with closing(sqlite3.connect(legacy_path)) as connection:
            connection.execute(legacy_schema)
            connection.execute(
                """
                INSERT INTO orderbook_samples (
                    id, sample_time, distance, mid, bid_notional, ask_notional,
                    imbalance, bid_coverage_pct, ask_coverage_pct, complete,
                    exchange, symbol, source, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    "binance|BTCUSDT|2.5|1792000000000",
                    BASE_TIME_MS,
                    2.5,
                    80_000.0,
                    1_000_000.0,
                    900_000.0,
                    5.263,
                    0.153,
                    0.180,
                    0,
                    "binance",
                    "BTCUSDT",
                    "binance",
                    BASE_TIME_MS,
                ),
            )
            connection.commit()

        # Opening a pre-existing local database must not crash; the new columns
        # are added in place and legacy rows fall back to the stored coverage.
        migrated = OrderBookStore(legacy_path)
        page = migrated.read_history(distance=2.5, limit=10)
        self.assertEqual(len(page.samples), 1)
        self.assertEqual(page.samples[0]["bid_coverage_pct"], 0.153)
        self.assertEqual(page.samples[0]["observed_bid_coverage_pct"], 0.153)
        self.assertEqual(page.samples[0]["observed_ask_coverage_pct"], 0.180)

        migrated.insert_sample(
            _sample(
                sample_time=BASE_TIME_MS + 1_000,
                complete=True,
            )
        )
        newest = migrated.read_history(distance=2.5, limit=1).samples[0]
        self.assertTrue(newest["complete"])


if __name__ == "__main__":
    unittest.main()
