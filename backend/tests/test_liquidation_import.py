from __future__ import annotations

import math
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

import duckdb

from app.market.liquidation_import import (
    LiquidationImportError,
    expand_parquet_paths,
    format_report,
    run_import,
)
from app.market.liquidation_store import (
    LiquidationStore,
    connect_read_only,
    read_existing_event_keys,
)

SCHEMA = """
CREATE TABLE liquidation_rows (
    timestamp BIGINT,
    symbol VARCHAR,
    side VARCHAR,
    price DOUBLE,
    avg_price DOUBLE,
    quantity DOUBLE,
    filled_qty DOUBLE,
    exchange VARCHAR
)
"""

DAY = 86_400_000
BASE_DAY_MS = 1_793_059_200_000  # 2026-10-27T00:00:00Z


def write_parquet(path: Path, rows: list[tuple]) -> Path:
    """Write a source-shaped parquet file (schema only when ``rows`` is empty)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = duckdb.connect()
    try:
        connection.execute(SCHEMA)
        if rows:
            connection.executemany(
                "INSERT INTO liquidation_rows VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                rows,
            )
        connection.execute(
            f"COPY liquidation_rows TO '{path}' (FORMAT parquet)"
        )
    finally:
        connection.close()
    return path


def source_row(
    *,
    timestamp: int,
    side: str = "SELL",
    price: float = 78_000.0,
    avg_price: float = 78_120.5,
    quantity: float = 0.25,
    filled_qty: float = 0.25,
    symbol: str = "BTCUSDT",
    exchange: str = "binance_futures",
) -> tuple:
    return (
        timestamp,
        symbol,
        side,
        price,
        avg_price,
        quantity,
        filled_qty,
        exchange,
    )


def q(value: float) -> str:
    return repr(float(value))


class ImportTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.source = self.root / "source"
        self.db_path = self.root / "liquidations.sqlite3"

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def import_from(self, *patterns: Path, **kwargs):
        return run_import(
            path_patterns=[str(pattern) for pattern in patterns],
            db_path=self.db_path,
            backup=kwargs.pop("backup", False),
            **kwargs,
        )

    def rows(self) -> list[sqlite3.Row]:
        with connect_read_only(self.db_path) as connection:
            return connection.execute(
                "SELECT * FROM liquidation_events ORDER BY event_time, id"
            ).fetchall()


class MappingTests(ImportTestCase):
    def test_maps_avg_price_to_price_and_keeps_the_order_price(self) -> None:
        write_parquet(
            self.source / "2026-10-27" / "00-00-01.parquet",
            [source_row(timestamp=BASE_DAY_MS + 1_000)],
        )

        report = self.import_from(self.source)

        self.assertEqual(report.files_read, 1)
        self.assertEqual(report.rows_read, 1)
        self.assertEqual(report.inserted, 1)
        self.assertEqual(report.invalid_rows, 0)
        self.assertTrue(report.balanced)

        row = self.rows()[0]
        self.assertEqual(row["event_time"], BASE_DAY_MS + 1_000)
        self.assertEqual(row["trade_time"], BASE_DAY_MS + 1_000)
        self.assertEqual(row["side"], "long")
        self.assertEqual(row["price"], 78_120.5)  # avg_price, not price
        self.assertEqual(row["order_price"], 78_000.0)  # the o.p value
        self.assertEqual(row["quantity"], 0.25)
        self.assertAlmostEqual(row["notional"], 78_120.5 * 0.25)
        self.assertEqual(row["exchange"], "binance")
        self.assertEqual(row["symbol"], "BTCUSDT")
        self.assertEqual(row["source"], "import")
        self.assertTrue(row["id"].startswith("import|binance|BTCUSDT|SELL|"))

    def test_maps_buy_to_short_and_sell_to_long(self) -> None:
        write_parquet(
            self.source / "day.parquet",
            [
                source_row(timestamp=BASE_DAY_MS + 1, side="SELL"),
                source_row(timestamp=BASE_DAY_MS + 2, side="BUY", price=78_500.0,
                           avg_price=78_400.0),
            ],
        )

        self.import_from(self.source)

        sides = [(row["side"], row["order_price"], row["price"])
                 for row in self.rows()]
        self.assertEqual(
            sides,
            [("long", 78_000.0, 78_120.5), ("short", 78_500.0, 78_400.0)],
        )

    def test_imported_id_is_stable_and_cannot_collide_with_a_live_id(self) -> None:
        write_parquet(
            self.source / "day.parquet",
            [source_row(timestamp=BASE_DAY_MS + 5)],
        )
        self.import_from(self.source)
        first = self.rows()[0]["id"]

        self.assertEqual(
            first,
            "import|binance|BTCUSDT|SELL|%d|%s|%s"
            % (BASE_DAY_MS + 5, q(78_120.5), q(0.25)),
        )
        self.assertFalse(first.startswith("binance|"))

    def test_boundary_day_uses_the_row_timestamp_not_the_directory(self) -> None:
        # The recorder flushes a batch at 00:00:22 that can still hold an event
        # from the previous UTC day; the day directory must not decide the date.
        write_parquet(
            self.source / "2026-11-04" / "00-00-22.parquet",
            [source_row(timestamp=BASE_DAY_MS - 1_000)],
        )

        self.import_from(self.source)

        self.assertEqual(self.rows()[0]["event_time"], BASE_DAY_MS - 1_000)
        self.assertEqual(
            self.rows()[0]["trade_time"], self.rows()[0]["event_time"]
        )

    def test_dry_run_writes_nothing(self) -> None:
        write_parquet(
            self.source / "day.parquet",
            [source_row(timestamp=BASE_DAY_MS + 1)],
        )

        report = self.import_from(self.source, dry_run=True)

        self.assertTrue(report.dry_run)
        self.assertEqual(report.inserted, 0)
        self.assertFalse(self.db_path.exists())
        self.assertIsNone(report.backup_path)


class DedupeTests(ImportTestCase):
    def test_duplicate_source_rows_are_collapsed(self) -> None:
        duplicate = source_row(timestamp=BASE_DAY_MS + 10)
        write_parquet(
            self.source / "a.parquet",
            [
                duplicate,
                duplicate,  # two collectors ran in parallel
                duplicate,
                source_row(timestamp=BASE_DAY_MS + 20),
            ],
        )

        report = self.import_from(self.source)

        self.assertEqual(report.rows_read, 4)
        self.assertEqual(report.distinct_rows, 2)
        self.assertEqual(report.duplicates_collapsed, 2)
        self.assertEqual(report.inserted, 2)
        self.assertTrue(report.balanced)
        self.assertEqual(len(self.rows()), 2)

    def test_same_event_time_with_a_different_price_is_kept(self) -> None:
        write_parquet(
            self.source / "a.parquet",
            [
                source_row(timestamp=BASE_DAY_MS + 10, avg_price=78_120.5),
                source_row(timestamp=BASE_DAY_MS + 10, avg_price=78_121.5),
            ],
        )

        report = self.import_from(self.source)

        self.assertEqual(report.inserted, 2)
        self.assertEqual(report.duplicates_collapsed, 0)

    def test_rerun_inserts_nothing(self) -> None:
        write_parquet(
            self.source / "2026-10-27" / "00-00-01.parquet",
            [
                source_row(timestamp=BASE_DAY_MS + 1),
                source_row(timestamp=BASE_DAY_MS + 2),
            ],
        )
        first = self.import_from(self.source)
        self.assertEqual(first.inserted, 2)

        second = self.import_from(self.source)

        self.assertEqual(second.inserted, 0)
        self.assertEqual(second.already_present, 2)
        self.assertEqual(second.counts_before["total"], 2)
        self.assertEqual(second.counts_after["total"], 2)
        self.assertEqual(len(self.rows()), 2)

    def test_no_duplicate_content_keys_end_up_in_the_table(self) -> None:
        write_parquet(
            self.source / "a.parquet",
            [source_row(timestamp=BASE_DAY_MS + index) for index in range(5)],
        )
        self.import_from(self.source)

        with connect_read_only(self.db_path) as connection:
            duplicates = connection.execute(
                """
                SELECT count(*) FROM (
                    SELECT 1 FROM liquidation_events
                    GROUP BY event_time, side, price, quantity
                    HAVING count(*) > 1
                )
                """
            ).fetchone()[0]
        self.assertEqual(duplicates, 0)

    def test_existing_live_row_with_the_same_content_is_not_duplicated(self) -> None:
        live_event = {
            "exchange": "binance",
            "symbol": "BTCUSDT",
            "side": "long",
            "price": 78_120.5,
            "quantity": 0.25,
            "notional": 78_120.5 * 0.25,
            "time": BASE_DAY_MS + 7,
            "trade_time": BASE_DAY_MS + 6,
            "id": "binance|BTCUSDT|SELL|%d|%d|0.25|78120.50"
            % (BASE_DAY_MS + 7, BASE_DAY_MS + 6),
        }
        store = LiquidationStore(self.db_path)
        self.assertTrue(store.insert_event(live_event))

        write_parquet(
            self.source / "day.parquet",
            [source_row(timestamp=BASE_DAY_MS + 7)],
        )
        report = self.import_from(self.source)

        self.assertEqual(report.inserted, 0)
        self.assertEqual(report.already_present, 1)
        rows = self.rows()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["id"], live_event["id"])
        self.assertEqual(rows[0]["source"], "live")
        self.assertIsNone(rows[0]["order_price"])
        self.assertEqual(rows[0]["trade_time"], BASE_DAY_MS + 6)

    def test_live_rows_stay_live_when_new_import_rows_are_added(self) -> None:
        store = LiquidationStore(self.db_path)
        store.insert_event(
            {
                "exchange": "binance",
                "symbol": "BTCUSDT",
                "side": "short",
                "price": 78_000.0,
                "quantity": 1.0,
                "notional": 78_000.0,
                "time": BASE_DAY_MS + 500,
                "trade_time": BASE_DAY_MS + 499,
                "id": "binance|BTCUSDT|BUY|%d|%d|1.0|78000.00"
                % (BASE_DAY_MS + 500, BASE_DAY_MS + 499),
            }
        )

        write_parquet(
            self.source / "day.parquet",
            [
                source_row(timestamp=BASE_DAY_MS + 100),
                source_row(timestamp=BASE_DAY_MS + 200),
            ],
        )
        self.import_from(self.source)

        live_rows = [row for row in self.rows() if row["source"] == "live"]
        self.assertEqual(len(live_rows), 1)
        self.assertEqual(live_rows[0]["side"], "short")
        report = self.import_from(self.source)
        self.assertEqual(report.already_present, 2)
        self.assertEqual(report.counts_after["live"], 1)


class ValidationTests(ImportTestCase):
    def test_invalid_rows_are_skipped_without_aborting_the_import(self) -> None:
        write_parquet(
            self.source / "day.parquet",
            [
                source_row(timestamp=BASE_DAY_MS + 1),
                source_row(timestamp=BASE_DAY_MS + 2, side="HOLD"),
                source_row(timestamp=BASE_DAY_MS + 3, avg_price=0.0),
                source_row(timestamp=BASE_DAY_MS + 4, avg_price=-1.0),
                source_row(timestamp=BASE_DAY_MS + 5, filled_qty=0.0),
                source_row(timestamp=BASE_DAY_MS + 6, symbol="ETHUSDT"),
                source_row(timestamp=BASE_DAY_MS + 7, exchange="bybit"),
                source_row(timestamp=(BASE_DAY_MS + 8) // 1000),  # seconds, not ms
                source_row(timestamp=BASE_DAY_MS + 9, avg_price=math.nan),
            ],
        )

        report = self.import_from(self.source)

        self.assertEqual(report.rows_read, 9)
        self.assertEqual(report.invalid_rows, 8)
        self.assertEqual(report.inserted, 1)
        self.assertTrue(report.balanced)
        self.assertEqual(len(self.rows()), 1)

    def test_empty_parquet_file_imports_nothing(self) -> None:
        write_parquet(self.source / "2026-10-27" / "00-00-01.parquet", [])

        report = self.import_from(self.source)

        self.assertEqual(report.files_read, 1)
        self.assertEqual(report.rows_read, 0)
        self.assertEqual(report.inserted, 0)
        self.assertTrue(report.balanced)
        # Nothing was inserted, so no database was created at all.
        self.assertFalse(self.db_path.exists())

    def test_missing_path_raises(self) -> None:
        with self.assertRaises(LiquidationImportError):
            expand_parquet_paths([str(self.root / "does-not-exist")])

    def test_repeated_paths_are_deduplicated(self) -> None:
        write_parquet(
            self.source / "day.parquet",
            [source_row(timestamp=BASE_DAY_MS + 1)],
        )

        report = self.import_from(self.source, self.source / "day.parquet")

        self.assertEqual(report.files_read, 1)
        self.assertEqual(report.inserted, 1)


class SchemaMigrationTests(ImportTestCase):
    def test_migration_adds_columns_to_a_legacy_database(self) -> None:
        with closing(sqlite3.connect(self.db_path)) as connection:
            connection.execute(
                """
                CREATE TABLE liquidation_events (
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
            )
            connection.execute(
                """
                INSERT INTO liquidation_events VALUES
                ('legacy-live', 1, 2, 'long', 3.0, 4.0, 12.0, 'binance',
                 'BTCUSDT', 5)
                """
            )
            connection.commit()

        LiquidationStore(self.db_path)  # applies the additive migration
        LiquidationStore(self.db_path)  # and is idempotent

        with connect_read_only(self.db_path) as connection:
            columns = {
                row[1]
                for row in connection.execute(
                    "PRAGMA table_info(liquidation_events)"
                ).fetchall()
            }
            row = connection.execute(
                "SELECT id, source, order_price FROM liquidation_events"
            ).fetchone()

        self.assertTrue({"source", "order_price"} <= columns)
        self.assertEqual(tuple(row), ("legacy-live", "live", None))

    def test_import_into_a_legacy_database_migrates_then_writes(self) -> None:
        with closing(sqlite3.connect(self.db_path)) as connection:
            connection.execute(
                """
                CREATE TABLE liquidation_events (
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
            )
            connection.commit()

        write_parquet(
            self.source / "day.parquet",
            [source_row(timestamp=BASE_DAY_MS + 1)],
        )
        report = self.import_from(self.source)

        self.assertEqual(report.inserted, 1)
        self.assertEqual(report.counts_after, {"total": 1, "live": 0, "import": 1})

    def test_legacy_database_counts_every_row_as_live_before_migrating(self) -> None:
        with closing(sqlite3.connect(self.db_path)) as connection:
            connection.execute(
                """
                CREATE TABLE liquidation_events (
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
            )
            connection.executemany(
                "INSERT INTO liquidation_events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [
                    (f"live-{index}", index, index, "long", 1.0, 1.0, 1.0,
                     "binance", "BTCUSDT", 0)
                    for index in range(3)
                ],
            )
            connection.commit()

        write_parquet(
            self.source / "day.parquet",
            [source_row(timestamp=BASE_DAY_MS + 1)],
        )
        report = self.import_from(self.source, dry_run=True)

        self.assertEqual(report.counts_before, {"total": 3, "live": 3, "import": 0})


class BackupTests(ImportTestCase):
    def test_backup_is_written_before_the_database_changes(self) -> None:
        LiquidationStore(self.db_path)
        write_parquet(
            self.source / "day.parquet",
            [source_row(timestamp=BASE_DAY_MS + 1)],
        )

        report = self.import_from(self.source, backup=True)

        self.assertIsNotNone(report.backup_path)
        backup = Path(str(report.backup_path))
        self.assertTrue(backup.exists())
        with closing(sqlite3.connect(backup)) as connection:
            self.assertEqual(
                connection.execute(
                    "SELECT count(*) FROM liquidation_events"
                ).fetchone()[0],
                0,
            )
        self.assertEqual(report.inserted, 1)

    def test_missing_database_has_nothing_to_back_up(self) -> None:
        write_parquet(
            self.source / "day.parquet",
            [source_row(timestamp=BASE_DAY_MS + 1)],
        )

        report = self.import_from(self.source, backup=True)

        self.assertIsNone(report.backup_path)
        self.assertEqual(report.inserted, 1)


class ReportTests(ImportTestCase):
    def test_report_text_contains_every_counter(self) -> None:
        write_parquet(
            self.source / "day.parquet",
            [
                source_row(timestamp=BASE_DAY_MS + 1),
                source_row(timestamp=BASE_DAY_MS + 2, side="HOLD"),
            ],
        )

        report = self.import_from(self.source)
        text = format_report(report)

        for needle in (
            "files read",
            "rows read",
            "duplicates folded",
            "invalid rows",
            "already present",
            "inserted",
            "rows before",
            "rows after",
            "elapsed",
        ):
            self.assertIn(needle, text)
        self.assertIn("2026-10-27T00:00:00Z", text)

    def test_imported_rows_are_visible_through_the_store_history_page(self) -> None:
        write_parquet(
            self.source / "day.parquet",
            [source_row(timestamp=BASE_DAY_MS + index) for index in range(3)],
        )
        self.import_from(self.source)

        page = LiquidationStore(self.db_path).read_history(limit=2)

        self.assertEqual(len(page.events), 2)
        self.assertTrue(page.has_more)
        self.assertEqual(
            [event["trade_time"] for event in page.events],
            [BASE_DAY_MS + 2, BASE_DAY_MS + 1],
        )
        older = LiquidationStore(self.db_path).read_history(
            before=page.next_before, limit=2
        )
        self.assertEqual([event["trade_time"] for event in older.events],
                         [BASE_DAY_MS])
        self.assertEqual(len(read_existing_event_keys(self.db_path)), 3)


if __name__ == "__main__":
    unittest.main()
