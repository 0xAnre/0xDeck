from __future__ import annotations

import unittest
from pathlib import Path

from app import datasets

REPO_ROOT = Path(__file__).resolve().parents[2]
SAMPLE_FOLDER = REPO_ROOT / "data" / "sample"
DATASET_NAME = "market_ticks.parquet"


class TimeRangeFilterTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.target = datasets.resolve_dataset(SAMPLE_FOLDER, DATASET_NAME)

    def test_string_timestamp_cutoff_does_not_raise(self) -> None:
        cutoff = datasets._compute_time_cutoff(
            "2026-07-04 12:15:00",
            "1h",
            "VARCHAR",
        )
        self.assertIsInstance(cutoff, str)
        self.assertEqual(cutoff, "2026-07-04 11:15:00")

    def test_numeric_epoch_cutoff_unchanged(self) -> None:
        ms_epoch = 1_720_000_000_000.0
        expected = datasets._timestamp_cutoff(ms_epoch, "1h")
        actual = datasets._compute_time_cutoff(ms_epoch, "1h", "BIGINT")
        self.assertEqual(actual, expected)

    def test_market_ticks_endpoints_for_ranges(self) -> None:
        for range_key in ("15m", "1h", "all"):
            with self.subTest(range_key=range_key):
                preview = datasets.dataset_preview(self.target, 50, range_key)
                series = datasets.dataset_series(
                    self.target,
                    "timestamp",
                    "price",
                    120,
                    range_key,
                )
                kpi = datasets.dataset_kpi(self.target, "price", "last", range_key)

                self.assertGreater(len(preview["rows"]), 0)
                self.assertGreater(len(series), 0)
                self.assertIsNotNone(kpi["value"])
                self.assertGreater(kpi["row_count"], 0)

        all_rows = datasets.dataset_preview(self.target, 50, "all")["rows"]
        one_hour_rows = datasets.dataset_preview(self.target, 50, "1h")["rows"]
        self.assertLessEqual(len(one_hour_rows), len(all_rows))


if __name__ == "__main__":
    unittest.main()
