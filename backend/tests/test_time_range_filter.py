from __future__ import annotations

import shutil
import tempfile
import unittest
from pathlib import Path

import duckdb

from app import datasets

REPO_ROOT = Path(__file__).resolve().parents[2]
SAMPLE_FOLDER = REPO_ROOT / "data" / "sample"
DATASET_NAME = "market_ticks.parquet"

MS_EPOCH_OLD = 1_720_000_000_000
MS_EPOCH_NEW = MS_EPOCH_OLD + 20 * 60 * 1000


def _write_fixture_parquets(folder: Path) -> None:
    con = duckdb.connect()
    con.execute(
        """
        COPY (
            SELECT * FROM (
                VALUES
                    ('2026-07-04T11:30:00'::VARCHAR, 1.0::DOUBLE),
                    ('2026-07-04T12:15:00'::VARCHAR, 2.0::DOUBLE)
            ) t(timestamp, price)
        ) TO ? (FORMAT PARQUET)
        """,
        [str(folder / "iso_varchar.parquet")],
    )
    con.execute(
        f"""
        COPY (
            SELECT * FROM (
                VALUES
                    ('{MS_EPOCH_OLD}'::VARCHAR, 1.0::DOUBLE),
                    ('{MS_EPOCH_NEW}'::VARCHAR, 2.0::DOUBLE)
            ) t(timestamp, price)
        ) TO '{folder / "epoch_varchar.parquet"}' (FORMAT PARQUET)
        """
    )
    con.execute(
        f"""
        COPY (
            SELECT * FROM (
                VALUES
                    ({MS_EPOCH_OLD}::BIGINT, 1.0::DOUBLE),
                    ({MS_EPOCH_NEW}::BIGINT, 2.0::DOUBLE)
            ) t(timestamp, price)
        ) TO '{folder / "epoch_bigint.parquet"}' (FORMAT PARQUET)
        """
    )
    con.execute(
        """
        COPY (
            SELECT * FROM (
                VALUES
                    (TIMESTAMP '2026-07-04 11:30:00', 1.0::DOUBLE),
                    (TIMESTAMP '2026-07-04 12:15:00', 2.0::DOUBLE)
            ) t(timestamp, price)
        ) TO ? (FORMAT PARQUET)
        """,
        [str(folder / "timestamp_native.parquet")],
    )
    con.close()


def _assert_range_bundle(
    test: unittest.TestCase,
    target: datasets.DatasetTarget,
    range_key: str,
    *,
    preview_rows: int,
    last_price: float,
    series_points: int,
    kpi_value: float,
    kpi_rows: int,
    price_column: str = "price",
) -> None:
    preview = datasets.dataset_preview(target, 50, range_key)
    series = datasets.dataset_series(target, "timestamp", price_column, 120, range_key)
    kpi = datasets.dataset_kpi(target, price_column, "last", range_key)

    price_idx = preview["columns"].index(price_column)

    test.assertEqual(len(preview["rows"]), preview_rows)
    test.assertEqual(float(preview["rows"][0][price_idx]), last_price)

    test.assertEqual(len(series), series_points)
    test.assertEqual(float(series[-1]["y"]), last_price)

    test.assertEqual(kpi["row_count"], kpi_rows)
    test.assertEqual(float(kpi["value"]), kpi_value)


class TimeRangeFilterTests(unittest.TestCase):
    fixture_dir: Path
    market_target: datasets.DatasetTarget

    @classmethod
    def setUpClass(cls) -> None:
        cls.fixture_dir = Path(tempfile.mkdtemp(prefix="0xdeck-time-fixtures-"))
        _write_fixture_parquets(cls.fixture_dir)
        cls.market_target = datasets.resolve_dataset(SAMPLE_FOLDER, DATASET_NAME)

    @classmethod
    def tearDownClass(cls) -> None:
        shutil.rmtree(cls.fixture_dir, ignore_errors=True)

    def test_space_datetime_varchar_market_ticks_15m(self) -> None:
        _assert_range_bundle(
            self,
            self.market_target,
            "15m",
            preview_rows=9,
            last_price=67890.0,
            series_points=9,
            kpi_value=67890.0,
            kpi_rows=9,
        )

    def test_iso_varchar_timestamps_15m(self) -> None:
        target = datasets.resolve_dataset(self.fixture_dir, "iso_varchar.parquet")
        _assert_range_bundle(
            self,
            target,
            "15m",
            preview_rows=1,
            last_price=2.0,
            series_points=1,
            kpi_value=2.0,
            kpi_rows=1,
        )
        preview = datasets.dataset_preview(target, 50, "15m")
        self.assertEqual(preview["rows"][0][0], "2026-07-04T12:15:00")

    def test_epoch_varchar_timestamps_15m(self) -> None:
        target = datasets.resolve_dataset(self.fixture_dir, "epoch_varchar.parquet")
        _assert_range_bundle(
            self,
            target,
            "15m",
            preview_rows=1,
            last_price=2.0,
            series_points=1,
            kpi_value=2.0,
            kpi_rows=1,
        )
        preview = datasets.dataset_preview(target, 50, "15m")
        self.assertEqual(preview["rows"][0][0], str(MS_EPOCH_NEW))

    def test_epoch_bigint_timestamps_15m(self) -> None:
        target = datasets.resolve_dataset(self.fixture_dir, "epoch_bigint.parquet")
        _assert_range_bundle(
            self,
            target,
            "15m",
            preview_rows=1,
            last_price=2.0,
            series_points=1,
            kpi_value=2.0,
            kpi_rows=1,
        )

    def test_native_timestamp_column_15m(self) -> None:
        target = datasets.resolve_dataset(self.fixture_dir, "timestamp_native.parquet")
        _assert_range_bundle(
            self,
            target,
            "15m",
            preview_rows=1,
            last_price=2.0,
            series_points=1,
            kpi_value=2.0,
            kpi_rows=1,
        )


if __name__ == "__main__":
    unittest.main()
