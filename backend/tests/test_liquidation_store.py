from __future__ import annotations

import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

from app.market.liquidation_store import LiquidationStore

BASE_TIME_MS = 1_792_000_000_000


def _event(
    *,
    event_id: str,
    trade_time: int = BASE_TIME_MS,
    side: str = "long",
    price: float = 80_000.0,
    quantity: float = 0.5,
) -> dict[str, object]:
    return {
        "exchange": "binance",
        "symbol": "BTCUSDT",
        "side": side,
        "price": price,
        "quantity": quantity,
        "notional": price * quantity,
        "time": trade_time + 25,
        "trade_time": trade_time,
        "id": event_id,
    }


class LiquidationStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "liquidations.sqlite3"
        self.store = LiquidationStore(self.db_path)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_insert_returns_normalized_event_and_is_idempotent(self) -> None:
        event = _event(event_id="one")
        self.assertTrue(self.store.insert_event(event))
        self.assertFalse(self.store.insert_event(event))

        page = self.store.read_history(limit=10)
        self.assertEqual(len(page.events), 1)
        self.assertFalse(page.has_more)
        self.assertIsNone(page.next_before)
        self.assertEqual(page.events[0], event)

    def test_same_id_with_different_fields_does_not_replace_the_row(self) -> None:
        self.store.insert_event(_event(event_id="same", price=80_000.0))
        self.store.insert_event(_event(event_id="same", price=99_999.0))

        page = self.store.read_history(limit=10)
        self.assertEqual(len(page.events), 1)
        self.assertEqual(page.events[0]["price"], 80_000.0)

    def test_reads_newest_first_and_paginates_with_an_exclusive_before(self) -> None:
        for index in range(5):
            self.store.insert_event(
                _event(
                    event_id=f"event-{index}",
                    trade_time=BASE_TIME_MS + index * 1_000,
                )
            )

        first = self.store.read_history(limit=2)
        self.assertEqual(
            [event["id"] for event in first.events],
            ["event-4", "event-3"],
        )
        self.assertTrue(first.has_more)
        self.assertEqual(first.next_before, BASE_TIME_MS + 3_000)

        second = self.store.read_history(before=first.next_before, limit=2)
        self.assertEqual(
            [event["id"] for event in second.events],
            ["event-2", "event-1"],
        )
        self.assertTrue(second.has_more)
        self.assertEqual(second.next_before, BASE_TIME_MS + 1_000)

        third = self.store.read_history(before=second.next_before, limit=2)
        self.assertEqual([event["id"] for event in third.events], ["event-0"])
        self.assertFalse(third.has_more)
        self.assertIsNone(third.next_before)

        empty = self.store.read_history(before=BASE_TIME_MS, limit=2)
        self.assertEqual(empty.events, [])
        self.assertFalse(empty.has_more)

    def test_orders_ties_by_id_descending(self) -> None:
        for event_id in ("a", "c", "b"):
            self.store.insert_event(
                _event(event_id=event_id, trade_time=BASE_TIME_MS)
            )

        page = self.store.read_history(limit=10)
        self.assertEqual([event["id"] for event in page.events], ["c", "b", "a"])

    def test_reopening_the_database_file_keeps_rows(self) -> None:
        self.store.insert_event(
            _event(event_id="persisted", trade_time=BASE_TIME_MS + 123)
        )
        del self.store

        reopened = LiquidationStore(self.db_path)
        page = reopened.read_history(limit=10)
        self.assertEqual(len(page.events), 1)
        self.assertEqual(page.events[0]["id"], "persisted")
        self.assertEqual(page.events[0]["trade_time"], BASE_TIME_MS + 123)

    def test_schema_matches_the_normalized_event_columns(self) -> None:
        with closing(sqlite3.connect(self.db_path)) as connection:
            columns = {
                row[1]
                for row in connection.execute(
                    "PRAGMA table_info(liquidation_events)"
                ).fetchall()
            }
        self.assertEqual(
            columns,
            {
                "id",
                "trade_time",
                "event_time",
                "side",
                "price",
                "quantity",
                "notional",
                "exchange",
                "symbol",
                "created_at",
            },
        )


if __name__ == "__main__":
    unittest.main()
