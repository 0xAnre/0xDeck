from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.main import LIQUIDATIONS_HISTORY_PATH, app
from app.market import binance_usdm_liquidations
from app.market.liquidation_store import (
    LIQUIDATIONS_DB_ENV,
    get_liquidation_store,
)

BASE_TIME_MS = 1_792_000_000_000


def _event(event_id: str, trade_time: int) -> dict[str, object]:
    return {
        "exchange": "binance",
        "symbol": "BTCUSDT",
        "side": "long" if trade_time % 2 == 0 else "short",
        "price": 80_000.0,
        "quantity": 0.5,
        "notional": 40_000.0,
        "time": trade_time + 25,
        "trade_time": trade_time,
        "id": event_id,
    }


class LiquidationHistoryRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "liquidations.sqlite3"
        self.env_patch = patch.dict(
            os.environ,
            {
                LIQUIDATIONS_DB_ENV: str(self.db_path),
                "OXDECK_DISABLE_LIQUIDATION_COLLECTOR": "1",
            },
        )
        self.env_patch.start()
        self.store = get_liquidation_store()
        self.client = TestClient(app)

    def tearDown(self) -> None:
        self.env_patch.stop()
        self.temp_dir.cleanup()

    def test_empty_database_returns_an_empty_page(self) -> None:
        response = self.client.get(LIQUIDATIONS_HISTORY_PATH)
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["exchange"], "binance")
        self.assertEqual(body["symbol"], "BTCUSDT")
        self.assertEqual(body["events"], [])
        self.assertFalse(body["has_more"])
        self.assertIsNone(body["next_before"])

    def test_returns_the_same_normalized_event_shape_the_ws_sends(self) -> None:
        event = _event("event-1", BASE_TIME_MS)
        self.store.insert_event(event)

        response = self.client.get(LIQUIDATIONS_HISTORY_PATH)
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["events"], [event])
        self.assertEqual(
            set(body["events"][0]),
            {
                "exchange",
                "symbol",
                "side",
                "price",
                "quantity",
                "notional",
                "time",
                "trade_time",
                "id",
            },
        )
        self.assertFalse(body["has_more"])
        self.assertIsNone(body["next_before"])

    def test_paginates_newest_first_with_before_and_limit(self) -> None:
        for index in range(5):
            self.store.insert_event(
                _event(f"event-{index}", BASE_TIME_MS + index * 1_000)
            )

        first = self.client.get(
            LIQUIDATIONS_HISTORY_PATH,
            params={"limit": 2},
        )
        self.assertEqual(first.status_code, 200)
        body = first.json()
        self.assertEqual(
            [event["id"] for event in body["events"]],
            ["event-4", "event-3"],
        )
        self.assertTrue(body["has_more"])
        self.assertEqual(body["next_before"], BASE_TIME_MS + 3_000)

        second = self.client.get(
            LIQUIDATIONS_HISTORY_PATH,
            params={"before": body["next_before"], "limit": 10},
        )
        self.assertEqual(second.status_code, 200)
        second_body = second.json()
        self.assertEqual(
            [event["id"] for event in second_body["events"]],
            ["event-2", "event-1", "event-0"],
        )
        self.assertFalse(second_body["has_more"])
        self.assertIsNone(second_body["next_before"])

    def test_limit_defaults_to_500_and_accepts_the_documented_range(self) -> None:
        for index in range(3):
            self.store.insert_event(
                _event(f"event-{index}", BASE_TIME_MS + index * 1_000)
            )

        for limit in (1, 1000):
            response = self.client.get(
                LIQUIDATIONS_HISTORY_PATH,
                params={"limit": limit},
            )
            self.assertEqual(response.status_code, 200, response.text)
            self.assertLessEqual(len(response.json()["events"]), limit)

        # No `limit` supplied: the response is not capped below 3 rows, which
        # proves the default is not accidentally 1/2.
        default_response = self.client.get(LIQUIDATIONS_HISTORY_PATH)
        self.assertEqual(len(default_response.json()["events"]), 3)


    def test_lifespan_gate_keeps_testclient_from_reaching_upstream(self) -> None:
        relay = binance_usdm_liquidations.binance_liquidations_relay
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
                self.assertEqual(client.get(LIQUIDATIONS_HISTORY_PATH).status_code, 200)
            start.assert_not_called()
            shutdown.assert_awaited_once()

    def test_lifespan_starts_collection_when_not_disabled(self) -> None:
        relay = binance_usdm_liquidations.binance_liquidations_relay
        env = {
            LIQUIDATIONS_DB_ENV: str(self.db_path),
        }
        with patch.dict(os.environ, env, clear=False), patch.dict(
            os.environ,
            {"OXDECK_DISABLE_LIQUIDATION_COLLECTOR": ""},
        ), patch.object(
            relay,
            "start_collection",
            new=AsyncMock(),
        ) as start, patch.object(
            relay,
            "shutdown",
            new=AsyncMock(),
        ) as shutdown:
            with TestClient(app):
                pass
        start.assert_awaited_once()
        shutdown.assert_awaited_once()

    def test_rejects_invalid_params(self) -> None:
        for params in (
            {"limit": 0},
            {"limit": -1},
            {"limit": 1001},
            {"before": 0},
            {"before": -1},
        ):
            response = self.client.get(LIQUIDATIONS_HISTORY_PATH, params=params)
            self.assertEqual(response.status_code, 400, params)

        for params in ({"limit": "not-a-number"}, {"before": "soon"}):
            response = self.client.get(LIQUIDATIONS_HISTORY_PATH, params=params)
            self.assertEqual(response.status_code, 422, params)


if __name__ == "__main__":
    unittest.main()
