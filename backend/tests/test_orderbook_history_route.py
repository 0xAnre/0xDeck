from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.main import ORDERBOOK_HISTORY_PATH, app
from app.market import binance_usdm_liquidations, binance_usdm_orderbook
from app.market.order_book_store import (
    ORDERBOOK_DB_ENV,
    get_orderbook_store,
    orderbook_sample_id,
)

BASE_TIME_MS = 1_792_000_000_000


def _sample(
    distance: float,
    sample_time: int,
    *,
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
        "complete": complete,
    }


class OrderBookHistoryRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "orderbook.sqlite3"
        self.env_patch = patch.dict(
            os.environ,
            {
                ORDERBOOK_DB_ENV: str(self.db_path),
                "OXDECK_DISABLE_ORDERBOOK_COLLECTOR": "1",
                "OXDECK_DISABLE_LIQUIDATION_COLLECTOR": "1",
            },
        )
        self.env_patch.start()
        self.store = get_orderbook_store()
        self.client = TestClient(app)

    def tearDown(self) -> None:
        self.env_patch.stop()
        self.temp_dir.cleanup()

    def test_empty_database_returns_an_empty_page(self) -> None:
        response = self.client.get(ORDERBOOK_HISTORY_PATH)
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["exchange"], "binance")
        self.assertEqual(body["symbol"], "BTCUSDT")
        self.assertEqual(body["source"], "binance")
        self.assertEqual(body["distance"], 2.5)
        self.assertEqual(body["samples"], [])
        self.assertFalse(body["has_more"])
        self.assertIsNone(body["next_before"])

    def test_returns_the_same_normalized_sample_shape_the_ws_sends(self) -> None:
        sample = _sample(2.5, BASE_TIME_MS)
        self.store.insert_sample(sample)

        response = self.client.get(
            ORDERBOOK_HISTORY_PATH,
            params={"distance": 2.5},
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["samples"], [sample])
        self.assertEqual(
            set(body["samples"][0]),
            {
                "id",
                "source",
                "exchange",
                "symbol",
                "distance",
                "time",
                "mid",
                "bid_notional",
                "ask_notional",
                "imbalance",
                "bid_coverage_pct",
                "ask_coverage_pct",
                "complete",
            },
        )

    def test_paginates_newest_first_with_before_and_limit(self) -> None:
        for index in range(5):
            self.store.insert_sample(
                _sample(2.5, BASE_TIME_MS + index * 1_000)
            )

        first = self.client.get(
            ORDERBOOK_HISTORY_PATH,
            params={"distance": 2.5, "limit": 2},
        )
        self.assertEqual(first.status_code, 200)
        body = first.json()
        self.assertEqual(
            [sample["time"] for sample in body["samples"]],
            [BASE_TIME_MS + 4_000, BASE_TIME_MS + 3_000],
        )
        self.assertTrue(body["has_more"])
        self.assertEqual(body["next_before"], BASE_TIME_MS + 3_000)

        second = self.client.get(
            ORDERBOOK_HISTORY_PATH,
            params={
                "distance": 2.5,
                "before": body["next_before"],
                "limit": 10,
            },
        )
        self.assertEqual(second.status_code, 200)
        second_body = second.json()
        self.assertEqual(
            [sample["time"] for sample in second_body["samples"]],
            [BASE_TIME_MS + 2_000, BASE_TIME_MS + 1_000, BASE_TIME_MS],
        )
        self.assertFalse(second_body["has_more"])
        self.assertIsNone(second_body["next_before"])

    def test_distance_filter_selects_the_requested_distance_only(self) -> None:
        for distance in (0.25, 0.5, 1.0, 2.5):
            self.store.insert_sample(_sample(distance, BASE_TIME_MS))

        response = self.client.get(
            ORDERBOOK_HISTORY_PATH,
            params={"distance": 0.5},
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["distance"], 0.5)
        self.assertEqual(len(body["samples"]), 1)
        self.assertEqual(body["samples"][0]["distance"], 0.5)

    def test_limit_defaults_to_500_and_accepts_the_documented_range(self) -> None:
        for index in range(3):
            self.store.insert_sample(
                _sample(2.5, BASE_TIME_MS + index * 1_000)
            )

        for limit in (1, 1000):
            response = self.client.get(
                ORDERBOOK_HISTORY_PATH,
                params={"distance": 2.5, "limit": limit},
            )
            self.assertEqual(response.status_code, 200, response.text)
            self.assertLessEqual(len(response.json()["samples"]), limit)

        default_response = self.client.get(
            ORDERBOOK_HISTORY_PATH,
            params={"distance": 2.5},
        )
        self.assertEqual(len(default_response.json()["samples"]), 3)

    def test_rejects_invalid_params(self) -> None:
        for params in (
            {"distance": 5},
            {"distance": 0},
            {"distance": -1},
            {"limit": 0},
            {"limit": -1},
            {"limit": 1001},
            {"before": 0},
            {"before": -1},
        ):
            response = self.client.get(ORDERBOOK_HISTORY_PATH, params=params)
            self.assertEqual(response.status_code, 400, params)

        for params in (
            {"distance": "not-a-number"},
            {"limit": "not-a-number"},
            {"before": "soon"},
        ):
            response = self.client.get(ORDERBOOK_HISTORY_PATH, params=params)
            self.assertEqual(response.status_code, 422, params)

    def test_lifespan_gate_keeps_testclient_from_reaching_upstream(self) -> None:
        relay = binance_usdm_orderbook.binance_orderbook_collector
        with patch.object(
            relay,
            "start_collection",
            new=AsyncMock(),
        ) as start, patch.object(
            relay,
            "shutdown",
            new=AsyncMock(),
        ) as shutdown:
            with TestClient(app) as client:
                self.assertEqual(
                    client.get(ORDERBOOK_HISTORY_PATH).status_code,
                    200,
                )
            start.assert_not_called()
            shutdown.assert_awaited_once()

    def test_lifespan_starts_collection_when_not_disabled(self) -> None:
        relay = binance_usdm_orderbook.binance_orderbook_collector
        liquidation_relay = binance_usdm_liquidations.binance_liquidations_relay
        with patch.dict(
            os.environ,
            {"OXDECK_DISABLE_ORDERBOOK_COLLECTOR": ""},
        ), patch.object(
            relay,
            "start_collection",
            new=AsyncMock(),
        ) as start, patch.object(
            relay,
            "shutdown",
            new=AsyncMock(),
        ) as shutdown, patch.object(
            liquidation_relay,
            "start_collection",
            new=AsyncMock(),
        ), patch.object(
            liquidation_relay,
            "shutdown",
            new=AsyncMock(),
        ):
            with TestClient(app):
                pass
        start.assert_awaited_once()
        shutdown.assert_awaited_once()


if __name__ == "__main__":
    unittest.main()
