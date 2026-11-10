from __future__ import annotations

import asyncio
import json
import threading
import time
import unittest
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
from fastapi.testclient import TestClient

from app.main import app
from app.market import binance_usdm_btc as binance
from app.market import hyperliquid_btc as hyperliquid
from app.market.klines_cache import (
    DEFAULT_KLINES_CACHE_TTL_SECONDS,
    TTLCache,
    klines_cache,
)
from app.market.providers import BINANCE_PROVIDER, HYPERLIQUID_PROVIDER
from app.ws import WebSocketChannelManager

BINANCE_KLINES_URL = "/api/market/binance/usdm/btcusdt/klines"
HYPERLIQUID_KLINES_URL = "/api/market/hyperliquid/btc/klines"

ONE_MINUTE_MS = 60_000
ONE_HOUR_MS = 3_600_000
SAMPLE_OPEN_MS = 1_700_000_000_000

# Shaped like a Binance USD-M REST kline row: [open, o, h, l, c, v, close].
SAMPLE_REST_ROW = [
    SAMPLE_OPEN_MS,
    "62000.1",
    "62100.2",
    "61900.3",
    "62050.4",
    "100.0",
    SAMPLE_OPEN_MS + ONE_MINUTE_MS - 1,
]


class FakeClock:
    def __init__(self, start: float = 1_000.0) -> None:
        self.now = start

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


def _binance_response(rows: list) -> MagicMock:
    response = MagicMock()
    response.raise_for_status = MagicMock()
    response.json.return_value = rows
    return response


def _hyperliquid_item(open_ms: int, interval: str = "1h") -> dict:
    return {
        "t": open_ms,
        "T": open_ms + hyperliquid.hyperliquid_interval_duration_ms(interval) - 1,
        "s": "BTC",
        "i": interval,
        "o": "80240.0",
        "c": "80380.0",
        "h": "80454.0",
        "l": "80240.0",
        "v": "1.5",
        "n": 1,
    }


def _hyperliquid_response(items: list) -> MagicMock:
    response = MagicMock()
    response.raise_for_status = MagicMock()
    response.json.return_value = items
    return response


class TTLCacheTests(unittest.TestCase):
    def setUp(self) -> None:
        self.clock = FakeClock()
        self.cache: TTLCache[str] = TTLCache(ttl_seconds=5.0, clock=self.clock)
        self.calls = 0

    def _fetch(self) -> str:
        self.calls += 1
        return f"response-{self.calls}"

    def test_same_key_is_fetched_once_within_ttl(self) -> None:
        first = self.cache.get_or_fetch(("binance", "1m", 500), self._fetch)
        second = self.cache.get_or_fetch(("binance", "1m", 500), self._fetch)
        self.assertEqual(self.calls, 1)
        self.assertEqual(first, second)
        self.assertEqual(self.cache.stats().hits, 1)

    def test_entry_expires_after_ttl(self) -> None:
        self.cache.get_or_fetch(("binance", "1m", 500), self._fetch)
        self.clock.advance(5.0)
        refreshed = self.cache.get_or_fetch(("binance", "1m", 500), self._fetch)
        self.assertEqual(self.calls, 2)
        self.assertEqual(refreshed, "response-2")

    def test_distinct_keys_do_not_share_entries(self) -> None:
        self.cache.get_or_fetch(("binance", "1m", 500), self._fetch)
        self.cache.get_or_fetch(("binance", "5m", 500), self._fetch)
        self.cache.get_or_fetch(("binance", "1m", 1000), self._fetch)
        self.cache.get_or_fetch(("binance", "context", "daily", "1m"), self._fetch)
        self.cache.get_or_fetch(("hyperliquid", "1m", 500), self._fetch)
        self.assertEqual(self.calls, 5)

    def test_errors_are_not_cached(self) -> None:
        attempts = 0

        def failing_fetch() -> str:
            nonlocal attempts
            attempts += 1
            raise RuntimeError("upstream failed")

        for _ in range(2):
            with self.assertRaises(RuntimeError):
                self.cache.get_or_fetch("key", failing_fetch)
        self.assertEqual(attempts, 2)
        self.assertEqual(len(self.cache), 0)

    def test_disabled_cache_never_stores(self) -> None:
        disabled = TTLCache(ttl_seconds=5.0, enabled=False, clock=self.clock)
        calls = 0

        def fetch() -> str:
            nonlocal calls
            calls += 1
            return "value"

        disabled.get_or_fetch("key", fetch)
        disabled.get_or_fetch("key", fetch)
        self.assertEqual(calls, 2)
        self.assertEqual(len(disabled), 0)

    def test_zero_ttl_disables_the_cache(self) -> None:
        zero = TTLCache(ttl_seconds=0.0, clock=self.clock)
        self.assertFalse(zero.enabled)

    def test_clear_drops_entries_and_reset_stats_zeroes_counters(self) -> None:
        self.cache.get_or_fetch("key", self._fetch)
        self.cache.get_or_fetch("key", self._fetch)
        self.assertEqual(self.cache.stats().hits, 1)
        self.cache.clear()
        self.cache.reset_stats()
        self.assertEqual(len(self.cache), 0)
        self.assertEqual(self.cache.stats().hits, 0)
        self.assertEqual(self.cache.stats().misses, 0)

    def test_concurrent_same_key_requests_coalesce_into_one_fetch(self) -> None:
        started = threading.Event()
        release = threading.Event()
        calls = 0
        calls_lock = threading.Lock()

        def slow_fetch() -> str:
            nonlocal calls
            with calls_lock:
                calls += 1
            started.set()
            release.wait(timeout=5.0)
            return "value"

        results: list[str] = []

        def worker() -> None:
            results.append(self.cache.get_or_fetch("key", slow_fetch))

        first = threading.Thread(target=worker)
        first.start()
        self.assertTrue(started.wait(timeout=5.0))
        followers = [threading.Thread(target=worker) for _ in range(4)]
        for thread in followers:
            thread.start()
        # Give the followers time to block on the per-key lock, then let the
        # single in-flight fetch return.
        threading.Event().wait(0.05)
        release.set()
        for thread in [first, *followers]:
            thread.join(timeout=5.0)

        self.assertEqual(calls, 1)
        self.assertEqual(results, ["value"] * 5)


class KlinesCacheContractTests(unittest.TestCase):
    def test_documented_default_ttl_is_five_seconds(self) -> None:
        self.assertEqual(DEFAULT_KLINES_CACHE_TTL_SECONDS, 5.0)


class KlinesCacheProviderTests(unittest.TestCase):
    def setUp(self) -> None:
        klines_cache.clear()
        klines_cache.reset_stats()
        self.client = TestClient(app)

    def tearDown(self) -> None:
        klines_cache.clear()
        klines_cache.reset_stats()

    @patch("app.market.binance_usdm_btc.httpx.get")
    def test_identical_binance_requests_hit_upstream_once(
        self,
        mock_get: MagicMock,
    ) -> None:
        mock_get.return_value = _binance_response([SAMPLE_REST_ROW])

        cold = self.client.get(
            BINANCE_KLINES_URL,
            params={"interval": "1m", "limit": 2},
        )
        hot = self.client.get(
            BINANCE_KLINES_URL,
            params={"interval": "1m", "limit": 2},
        )

        self.assertEqual(cold.status_code, 200)
        self.assertEqual(hot.status_code, 200)
        self.assertEqual(mock_get.call_count, 1)
        # Binance has no availability horizon, so the whole body is stable and
        # the hot response must be byte-identical to the cold one.
        self.assertEqual(cold.content, hot.content)
        self.assertEqual(klines_cache.stats().hits, 1)

    @patch("app.market.hyperliquid_btc.httpx.post")
    def test_identical_hyperliquid_requests_hit_upstream_once(
        self,
        mock_post: MagicMock,
    ) -> None:
        now_ms = int(time.time() * 1000)
        mock_post.return_value = _hyperliquid_response(
            [_hyperliquid_item(now_ms - ONE_HOUR_MS)]
        )

        cold = self.client.get(
            HYPERLIQUID_KLINES_URL,
            params={"interval": "1h", "limit": 2},
        )
        posts_after_cold = mock_post.call_count
        hot = self.client.get(
            HYPERLIQUID_KLINES_URL,
            params={"interval": "1h", "limit": 2},
        )

        self.assertEqual(cold.status_code, 200)
        self.assertEqual(hot.status_code, 200)
        self.assertGreaterEqual(posts_after_cold, 1)
        # The hot request performs no upstream work at all.
        self.assertEqual(mock_post.call_count, posts_after_cold)
        # `available_from` is response metadata computed for this request, so
        # the cached candle payload (not the whole body) is what must match.
        self.assertTrue(cold.json()["candles"])
        self.assertEqual(cold.json()["candles"], hot.json()["candles"])
        self.assertEqual(klines_cache.stats().hits, 1)

    @patch("app.market.binance_usdm_btc.httpx.get")
    def test_interval_limit_history_context_and_range_are_distinct_keys(
        self,
        mock_get: MagicMock,
    ) -> None:
        mock_get.return_value = _binance_response([SAMPLE_REST_ROW])

        def upstream_calls() -> int:
            return mock_get.call_count

        # Latest klines: interval + limit participate in the key.
        BINANCE_PROVIDER.fetch_klines_sync("1m", 2)
        BINANCE_PROVIDER.fetch_klines_sync("1m", 2)
        self.assertEqual(upstream_calls(), 1)
        BINANCE_PROVIDER.fetch_klines_sync("5m", 2)
        BINANCE_PROVIDER.fetch_klines_sync("1m", 3)
        self.assertEqual(upstream_calls(), 3)

        # Context levels are separate variants even for the same interval.
        BINANCE_PROVIDER.fetch_context_sync("daily", "1m")
        BINANCE_PROVIDER.fetch_context_sync("weekly", "1m")
        self.assertEqual(upstream_calls(), 5)
        BINANCE_PROVIDER.fetch_context_sync("daily", "1m")
        self.assertEqual(upstream_calls(), 5)

        # History is keyed by its `before` cursor.
        BINANCE_PROVIDER.fetch_history_before_sync("1m", 1_700_000_000)
        BINANCE_PROVIDER.fetch_history_before_sync("1m", 1_700_100_000)
        self.assertEqual(upstream_calls(), 7)
        BINANCE_PROVIDER.fetch_history_before_sync("1m", 1_700_000_000)
        self.assertEqual(upstream_calls(), 7)

        # Volume profile is keyed by its explicit start/end time range.
        BINANCE_PROVIDER.fetch_volume_profile_source_klines_sync(
            1_700_000_000,
            1_700_003_600,
        )
        BINANCE_PROVIDER.fetch_volume_profile_source_klines_sync(
            1_700_100_000,
            1_700_103_600,
        )
        self.assertEqual(upstream_calls(), 9)
        BINANCE_PROVIDER.fetch_volume_profile_source_klines_sync(
            1_700_000_000,
            1_700_003_600,
        )
        self.assertEqual(upstream_calls(), 9)

        # Exchanges never share an entry, even for identical interval/limit.
        now_ms = int(time.time() * 1000)
        with patch("app.market.hyperliquid_btc.httpx.post") as mock_post:
            mock_post.return_value = _hyperliquid_response(
                [_hyperliquid_item(now_ms - ONE_MINUTE_MS, "1m")]
            )
            HYPERLIQUID_PROVIDER.fetch_klines_sync("1m", 2)
        self.assertGreaterEqual(mock_post.call_count, 1)

    @patch("app.market.binance_usdm_btc.httpx.get")
    def test_upstream_failure_is_not_cached(self, mock_get: MagicMock) -> None:
        mock_get.side_effect = httpx.ConnectError("upstream unreachable")

        first = self.client.get(
            BINANCE_KLINES_URL,
            params={"interval": "1m", "limit": 2},
        )
        second = self.client.get(
            BINANCE_KLINES_URL,
            params={"interval": "1m", "limit": 2},
        )

        self.assertEqual(first.status_code, 502)
        self.assertEqual(second.status_code, 502)
        self.assertEqual(mock_get.call_count, 2)

        # A later success is served, proving the failure left no entry behind.
        mock_get.side_effect = None
        mock_get.return_value = _binance_response([SAMPLE_REST_ROW])
        third = self.client.get(
            BINANCE_KLINES_URL,
            params={"interval": "1m", "limit": 2},
        )
        self.assertEqual(third.status_code, 200)
        self.assertEqual(mock_get.call_count, 3)

    def test_ttl_expiry_sends_the_next_request_upstream_again(self) -> None:
        clock = FakeClock()
        with (
            patch.object(klines_cache, "_clock", clock),
            patch("app.market.binance_usdm_btc.httpx.get") as mock_get,
        ):
            mock_get.return_value = _binance_response([SAMPLE_REST_ROW])

            BINANCE_PROVIDER.fetch_klines_sync("1m", 2)
            BINANCE_PROVIDER.fetch_klines_sync("1m", 2)
            self.assertEqual(mock_get.call_count, 1)

            clock.advance(DEFAULT_KLINES_CACHE_TTL_SECONDS + 0.001)
            BINANCE_PROVIDER.fetch_klines_sync("1m", 2)
            self.assertEqual(mock_get.call_count, 2)

    def test_disabled_cache_sends_every_request_upstream(self) -> None:
        with (
            patch.object(klines_cache, "enabled", False),
            patch("app.market.binance_usdm_btc.httpx.get") as mock_get,
        ):
            mock_get.return_value = _binance_response([SAMPLE_REST_ROW])
            for _ in range(2):
                self.client.get(
                    BINANCE_KLINES_URL,
                    params={"interval": "1m", "limit": 2},
                )
        self.assertEqual(mock_get.call_count, 2)

    def test_injected_upstream_seams_bypass_the_cache(self) -> None:
        before_seconds = 1_700_000_000
        upstream = MagicMock(return_value=_binance_response([SAMPLE_REST_ROW]))

        binance.fetch_klines_history_before_sync(
            "1m",
            before_seconds,
            now_ms=SAMPLE_OPEN_MS,
            http_get=upstream,
        )
        binance.fetch_klines_history_before_sync(
            "1m",
            before_seconds,
            now_ms=SAMPLE_OPEN_MS,
            http_get=upstream,
        )

        self.assertEqual(upstream.call_count, 2)
        self.assertEqual(len(klines_cache), 0)


class KlinesCacheWebSocketIsolationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        klines_cache.clear()
        klines_cache.reset_stats()

    async def asyncTearDown(self) -> None:
        klines_cache.clear()
        klines_cache.reset_stats()

    async def test_binance_relay_candles_never_touch_the_klines_cache(self) -> None:
        manager = WebSocketChannelManager()
        published: list[tuple[str, dict]] = []
        original_publish = manager.publish

        async def spy_publish(channel: str, payload: dict) -> None:
            published.append((channel, payload))
            await original_publish(channel, payload)

        manager.publish = spy_publish  # type: ignore[method-assign]

        @asynccontextmanager
        async def fake_connect(_url: str):
            class Upstream:
                async def recv(self_inner) -> str:
                    await asyncio.sleep(0.02)
                    return json.dumps(
                        {
                            "e": "kline",
                            "k": {
                                "t": SAMPLE_OPEN_MS,
                                "T": SAMPLE_OPEN_MS + ONE_MINUTE_MS - 1,
                                "s": "BTCUSDT",
                                "i": "1m",
                                "o": "62000.1",
                                "c": "62050.4",
                                "h": "62100.2",
                                "l": "61900.3",
                                "v": "100.0",
                                "x": False,
                            },
                        }
                    )

            yield Upstream()

        relay = binance.BinanceUsdmBtcKlineRelay(manager, connect_ws=fake_connect)
        channel = binance.channel_for_interval("1m")
        socket = MagicMock()
        socket.accept = AsyncMock()
        socket.send_text = AsyncMock()

        await manager.connect(channel, socket)
        await relay.on_client_connected(channel)
        for _ in range(100):
            if published:
                break
            await asyncio.sleep(0.01)
        manager.disconnect(channel, socket)
        await relay.on_client_disconnected(channel)

        self.assertTrue(published)
        self.assertEqual(len(klines_cache), 0)
        stats = klines_cache.stats()
        self.assertEqual((stats.hits, stats.misses), (0, 0))


if __name__ == "__main__":
    unittest.main()
