from __future__ import annotations

import asyncio
import json
import time
import unittest
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from app.main import app
from app.market import binance_usdm_btc as binance
from app.market import hyperliquid_btc as hyperliquid
from app.market.providers import (
    BINANCE_PROVIDER,
    HYPERLIQUID_PROVIDER,
    provider_for_channel,
    relay_for_channel,
)
from app.ws import WebSocketChannelManager

ONE_HOUR_MS = 3_600_000
BASE_OPEN_MS = 1_800_000_000_000
BASE_CLOSE_MS = BASE_OPEN_MS + ONE_HOUR_MS - 1

SAMPLE_ITEM = {
    "t": BASE_OPEN_MS,
    "T": BASE_CLOSE_MS,
    "s": "BTC",
    "i": "1h",
    "o": "80240.0",
    "c": "80380.0",
    "h": "80454.0",
    "l": "80240.0",
    "v": "446.75956",
    "n": 4430,
}


def _item(open_ms: int, interval: str = "1h", volume: str = "1.5") -> dict:
    duration = hyperliquid.interval_duration_ms(interval)
    price = f"{80240 + open_ms % 1000}.0"
    return {
        "t": open_ms,
        "T": open_ms + duration - 1,
        "s": "BTC",
        "i": interval,
        "o": price,
        "c": price,
        "h": price,
        "l": price,
        "v": volume,
        "n": 1,
    }


def _mock_post_response(payload: object) -> MagicMock:
    response = MagicMock()
    response.raise_for_status = MagicMock()
    response.json.return_value = payload
    return response


class HyperliquidNormalizationTests(unittest.TestCase):
    def test_normalizes_rest_payload_strings_and_units(self) -> None:
        candle = hyperliquid.normalize_candle(
            SAMPLE_ITEM,
            "1h",
            now_ms=BASE_CLOSE_MS + 1,
        )

        self.assertEqual(candle["exchange"], "hyperliquid")
        self.assertEqual(candle["symbol"], "BTC")
        self.assertEqual(candle["interval"], "1h")
        self.assertEqual(candle["time"], BASE_OPEN_MS // 1000)
        self.assertEqual(candle["open"], 80240.0)
        self.assertEqual(candle["close"], 80380.0)
        self.assertEqual(candle["volume"], 446.75956)
        self.assertTrue(candle["closed"])

    def test_forming_vs_closed_is_derived_from_close_time(self) -> None:
        forming = hyperliquid.normalize_candle(
            SAMPLE_ITEM,
            "1h",
            now_ms=BASE_CLOSE_MS,
        )
        closed = hyperliquid.normalize_candle(
            SAMPLE_ITEM,
            "1h",
            now_ms=BASE_CLOSE_MS + 1,
        )
        self.assertFalse(forming["closed"])
        self.assertTrue(closed["closed"])

    def test_rejects_invalid_volume_and_wrong_coin(self) -> None:
        with self.assertRaises(ValueError):
            hyperliquid.normalize_candle(dict(SAMPLE_ITEM, v="-1"), "1h")
        with self.assertRaises(ValueError):
            hyperliquid.normalize_candle(dict(SAMPLE_ITEM, s="ETH"), "1h")
        with self.assertRaises(ValueError):
            hyperliquid.normalize_candle(dict(SAMPLE_ITEM, i="15m"), "1h")

    def test_subscription_response_is_ignored(self) -> None:
        payload = json.dumps(
            {"channel": "subscriptionResponse", "data": {"subscription": {}}}
        )
        self.assertIsNone(hyperliquid.parse_hyperliquid_ws_payload(payload))

    def test_ws_candle_normalizes_and_derives_closed(self) -> None:
        payload = json.dumps({"channel": "candle", "data": SAMPLE_ITEM})
        forming = hyperliquid.parse_hyperliquid_ws_payload(
            payload,
            now_ms=BASE_CLOSE_MS,
        )
        closed = hyperliquid.parse_hyperliquid_ws_payload(
            payload,
            now_ms=BASE_CLOSE_MS + 1,
        )
        self.assertIsNotNone(forming)
        self.assertIsNotNone(closed)
        assert forming is not None and closed is not None
        self.assertEqual(forming["volume"], 446.75956)
        self.assertFalse(forming["closed"])
        self.assertTrue(closed["closed"])

    def test_ws_invalid_payload_is_ignored(self) -> None:
        self.assertIsNone(hyperliquid.parse_hyperliquid_ws_payload("not-json"))
        self.assertIsNone(
            hyperliquid.parse_hyperliquid_ws_payload(
                json.dumps({"channel": "candle", "data": dict(SAMPLE_ITEM, v="bad")})
            )
        )


class HyperliquidHistoryLimitTests(unittest.TestCase):
    def test_recent_history_horizon_is_5000_candles(self) -> None:
        now_ms = 2_000_000_000_000
        expected = now_ms - 5000 * ONE_HOUR_MS
        self.assertEqual(
            hyperliquid.history_available_from_ms(now_ms, "1h"),
            expected,
        )
        self.assertEqual(
            hyperliquid.history_available_from_seconds(now_ms, "1h"),
            expected // 1000,
        )

    def test_historical_page_before_horizon_is_explicitly_unavailable(self) -> None:
        now_ms = 2_000_000_000_000
        available_from = hyperliquid.history_available_from_seconds(now_ms, "1h")

        with patch("app.market.hyperliquid_btc.httpx.post") as post:
            page = hyperliquid.fetch_klines_history_before_sync(
                "1h",
                available_from,
                now_ms=now_ms,
            )

        post.assert_not_called()
        self.assertEqual(page.candles, [])
        self.assertTrue(page.history_unavailable)
        self.assertEqual(page.available_from, available_from)

    def test_pagination_clamps_request_to_provider_horizon(self) -> None:
        now_ms = 2_000_000_000_000
        available_from_ms = hyperliquid.history_available_from_ms(now_ms, "1h")
        requested_start_ms = available_from_ms - 10 * ONE_HOUR_MS

        with patch("app.market.hyperliquid_btc.httpx.post") as post:
            post.return_value = _mock_post_response(
                [_item(available_from_ms, "1h")]
            )
            candles = hyperliquid.fetch_klines_paginated_sync(
                "1h",
                requested_start_ms,
                now_ms,
                now_ms=now_ms,
            )

        request = post.call_args.kwargs["json"]["req"]
        self.assertGreaterEqual(request["startTime"], available_from_ms)
        self.assertEqual(post.call_args.args[0], hyperliquid.HYPERLIQUID_INFO_URL)
        self.assertEqual(len(candles), 1)
        self.assertEqual(candles[0]["symbol"], "BTC")

    def test_fetch_klines_never_substitutes_other_symbols(self) -> None:
        now_ms = 2_000_000_000_000
        with patch("app.market.hyperliquid_btc.httpx.post") as post:
            post.return_value = _mock_post_response(
                [_item(now_ms - ONE_HOUR_MS, "1h")]
            )
            candles = hyperliquid.fetch_klines_sync("1h", 2, now_ms=now_ms)

        self.assertEqual([candle["symbol"] for candle in candles], ["BTC"])
        self.assertTrue(
            all(candle["exchange"] == "hyperliquid" for candle in candles)
        )


class HyperliquidEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    @patch("app.market.hyperliquid_btc.httpx.post")
    def test_klines_endpoint_returns_hyperliquid_candles(
        self,
        mock_post: MagicMock,
    ) -> None:
        now_ms = int(time.time() * 1000)
        mock_post.return_value = _mock_post_response(
            [_item(now_ms - ONE_HOUR_MS, "1h")]
        )

        result = self.client.get(
            "/api/market/hyperliquid/btc/klines",
            params={"interval": "1h", "limit": 2},
        )

        self.assertEqual(result.status_code, 200)
        body = result.json()
        self.assertEqual(body["exchange"], "hyperliquid")
        self.assertEqual(body["symbol"], "BTC")
        self.assertEqual(body["interval"], "1h")
        self.assertEqual(body["history_limit"], 5000)
        self.assertEqual(body["candles"][0]["symbol"], "BTC")
        self.assertEqual(body["candles"][0]["volume"], 1.5)

    def test_klines_endpoint_rejects_invalid_interval(self) -> None:
        result = self.client.get(
            "/api/market/hyperliquid/btc/klines",
            params={"interval": "3m"},
        )
        self.assertEqual(result.status_code, 400)

    @patch("app.market.hyperliquid_btc.httpx.post")
    def test_history_endpoint_reports_unavailable_window(
        self,
        mock_post: MagicMock,
    ) -> None:
        result = self.client.get(
            "/api/market/hyperliquid/btc/klines/history",
            params={"interval": "1h", "before": 1_000_000_000},
        )

        mock_post.assert_not_called()
        self.assertEqual(result.status_code, 200)
        body = result.json()
        self.assertEqual(body["candles"], [])
        self.assertTrue(body["history_unavailable"])
        self.assertEqual(body["history_limit"], 5000)

    @patch("app.market.hyperliquid_btc.httpx.post")
    def test_context_endpoint_returns_available_candles(
        self,
        mock_post: MagicMock,
    ) -> None:
        now_ms = int(time.time() * 1000)
        mock_post.return_value = _mock_post_response(
            [_item(now_ms - ONE_HOUR_MS, "1h")]
        )

        result = self.client.get(
            "/api/market/hyperliquid/btc/klines/daily-context",
            params={"interval": "1h"},
        )

        self.assertEqual(result.status_code, 200)
        body = result.json()
        self.assertEqual(body["exchange"], "hyperliquid")
        self.assertIsInstance(body["available_from"], int)
        self.assertEqual(body["candles"][0]["symbol"], "BTC")

    @patch("app.market.hyperliquid_btc.httpx.post")
    def test_volume_profile_endpoint_uses_hyperliquid_source(
        self,
        mock_post: MagicMock,
    ) -> None:
        start_time = BASE_OPEN_MS // 1000
        end_time = start_time + 3600
        mock_post.return_value = _mock_post_response(
            [_item(BASE_OPEN_MS, "1m", volume="12.5")]
        )

        result = self.client.get(
            "/api/market/hyperliquid/btc/klines/volume-profile",
            params={"start_time": start_time, "end_time": end_time},
        )

        self.assertEqual(result.status_code, 200)
        body = result.json()
        self.assertEqual(body["exchange"], "hyperliquid")
        self.assertEqual(body["source_interval"], "1m")
        self.assertEqual(body["candles"][0]["volume"], 12.5)


class HyperliquidRelayTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.manager = WebSocketChannelManager()
        self.sent: list[dict] = []
        self.published: list[tuple[str, dict]] = []
        original_publish = self.manager.publish

        async def spy_publish(channel: str, payload: dict) -> None:
            self.published.append((channel, payload))
            await original_publish(channel, payload)

        self.manager.publish = spy_publish  # type: ignore[method-assign]

        self.next_open_ms = BASE_OPEN_MS + 10 * ONE_HOUR_MS

        @asynccontextmanager
        async def fake_connect(_url: str):
            class Upstream:
                async def send(self_inner, raw: str) -> None:
                    self.sent.append(json.loads(raw))

                async def recv(self_inner) -> str:
                    await asyncio.sleep(0.02)
                    if len(self.published) < 2:
                        item = _item(self.next_open_ms + len(self.published) * ONE_HOUR_MS)
                    else:
                        item = _item(
                            self.next_open_ms
                            + (len(self.published) - 1) * ONE_HOUR_MS
                        )
                    return json.dumps({"channel": "candle", "data": item})

            yield Upstream()

        self.relay = hyperliquid.HyperliquidBtcKlineRelay(
            self.manager,
            connect_ws=fake_connect,
        )

    async def test_subscribes_once_and_shares_single_upstream(self) -> None:
        channel = hyperliquid.channel_for_interval("1h")
        socket_a = MagicMock()
        socket_a.accept = AsyncMock()
        socket_a.send_text = AsyncMock()
        socket_b = MagicMock()
        socket_b.accept = AsyncMock()
        socket_b.send_text = AsyncMock()

        await self.manager.connect(channel, socket_a)
        await self.relay.on_client_connected(channel)
        self.assertEqual(self.relay.upstream_count(channel), 1)

        await self.manager.connect(channel, socket_b)
        await self.relay.on_client_connected(channel)
        self.assertEqual(self.relay.upstream_count(channel), 1)

        for _ in range(30):
            if self.sent and len(self.published) >= 2:
                break
            await asyncio.sleep(0.01)

        self.assertEqual(
            self.sent[0],
            {
                "method": "subscribe",
                "subscription": {"type": "candle", "coin": "BTC", "interval": "1h"},
            },
        )
        # One connection means one upstream subscription, even with two clients.
        self.assertEqual(len(self.sent), 1)
        self.assertGreaterEqual(len(self.published), 2)

        # A new candle's open time finalizes the previous (forming) candle.
        finalized = [payload for _, payload in self.published if payload["closed"]]
        self.assertTrue(finalized)
        self.assertTrue(all(payload["symbol"] == "BTC" for _, payload in self.published))

        self.manager.disconnect(channel, socket_a)
        await self.relay.on_client_disconnected(channel)
        self.assertEqual(self.relay.upstream_count(channel), 1)

        self.manager.disconnect(channel, socket_b)
        await self.relay.on_client_disconnected(channel)
        self.assertEqual(self.relay.upstream_count(channel), 0)

    async def test_upstream_stops_when_last_client_leaves(self) -> None:
        channel = hyperliquid.channel_for_interval("5m")
        socket = MagicMock()
        socket.accept = AsyncMock()
        socket.send_text = AsyncMock()

        await self.manager.connect(channel, socket)
        await self.relay.on_client_connected(channel)
        self.assertEqual(self.relay.upstream_count(channel), 1)

        self.manager.disconnect(channel, socket)
        await self.relay.on_client_disconnected(channel)
        self.assertEqual(self.relay.upstream_count(channel), 0)


class MarketProviderRoutingTests(unittest.TestCase):
    def test_provider_routing_by_channel(self) -> None:
        self.assertIs(
            provider_for_channel(binance.channel_for_interval("1m")),
            BINANCE_PROVIDER,
        )
        self.assertIs(
            provider_for_channel(hyperliquid.channel_for_interval("1m")),
            HYPERLIQUID_PROVIDER,
        )
        self.assertIsNone(provider_for_channel("trades.live"))

    def test_relay_routing_by_channel(self) -> None:
        self.assertIs(
            relay_for_channel(binance.channel_for_interval("1d")),
            binance.binance_kline_relay,
        )
        self.assertIs(
            relay_for_channel(hyperliquid.channel_for_interval("1d")),
            hyperliquid.hyperliquid_kline_relay,
        )
        self.assertIsNone(relay_for_channel("trades.live"))


if __name__ == "__main__":
    unittest.main()
