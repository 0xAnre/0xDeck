from __future__ import annotations

import asyncio
import json
import math
import unittest
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import app
from app.market.binance_usdm_btc import (
    BinanceUsdmBtcKlineRelay,
    binance_ws_stream_url,
    channel_for_interval,
    daily_context_window_ms,
    fetch_klines_daily_context_sync,
    fetch_klines_history_before_sync,
    fetch_klines_paginated_sync,
    fetch_klines_weekly_context_sync,
    history_before_window_ms,
    normalize_rest_kline_row,
    normalize_ws_kline,
    parse_binance_ws_payload,
    utc_day_start_ms,
    utc_week_start_ms,
    validate_interval,
    weekly_context_window_ms,
)
from app.ws import WebSocketChannelManager

SAMPLE_REST_ROW = [
    1_710_000_000_000,
    "62000.1",
    "62100.2",
    "61900.3",
    "62050.4",
    "100.0",
    1_710_000_059_999,
    "0",
    10,
    "0",
    "0",
    "0",
]

FIXED_NOW_MS = int(datetime(2024, 1, 2, 15, 30, tzinfo=timezone.utc).timestamp() * 1000)
ONE_MINUTE_MS = 60_000


def _kline_row(open_ms: int, close_ms: int | None = None) -> list:
    resolved_close = close_ms if close_ms is not None else open_ms + ONE_MINUTE_MS - 1
    return [
        open_ms,
        "62000.1",
        "62100.2",
        "61900.3",
        "62050.4",
        "100.0",
        resolved_close,
        "0",
        10,
        "0",
        "0",
        "0",
    ]


def _mock_klines_response(rows: list) -> MagicMock:
    response = MagicMock()
    response.raise_for_status = MagicMock()
    response.json.return_value = rows
    return response


SAMPLE_WS_KLINE = {
    "t": 1_710_000_000_000,
    "T": 1_710_000_059_999,
    "s": "BTCUSDT",
    "i": "1m",
    "o": "62000.1",
    "h": "62100.2",
    "l": "61900.3",
    "c": "62050.4",
    "v": "100.0",
    "x": False,
}


class BinanceUsdmBtcNormalizationTests(unittest.TestCase):
    def test_binance_ws_stream_url_uses_market_route(self) -> None:
        self.assertEqual(
            binance_ws_stream_url("1m"),
            "wss://fstream.binance.com/market/ws/btcusdt@kline_1m",
        )

    def test_supported_intervals_accepted(self) -> None:
        for interval in ("1m", "5m", "30m", "4h", "1d"):
            self.assertEqual(validate_interval(interval), interval)

    def test_invalid_interval_rejected(self) -> None:
        with self.assertRaises(HTTPException) as ctx:
            validate_interval("15m")
        self.assertEqual(ctx.exception.status_code, 400)

    def test_normalize_rest_row_open_and_closed(self) -> None:
        open_candle = normalize_rest_kline_row(SAMPLE_REST_ROW, "1m", now_ms=1_710_000_030_000)
        self.assertEqual(open_candle["time"], 1_710_000_000)
        self.assertEqual(open_candle["open"], 62000.1)
        self.assertEqual(open_candle["volume"], 100.0)
        self.assertEqual(open_candle["closed"], False)

        closed_candle = normalize_rest_kline_row(SAMPLE_REST_ROW, "1m", now_ms=1_710_000_060_000)
        self.assertTrue(closed_candle["closed"])

    def test_normalize_ws_kline(self) -> None:
        candle = normalize_ws_kline(SAMPLE_WS_KLINE)
        self.assertEqual(candle["symbol"], "BTCUSDT")
        self.assertEqual(candle["interval"], "1m")
        self.assertEqual(candle["time"], 1_710_000_000)
        self.assertEqual(candle["volume"], 100.0)
        self.assertFalse(candle["closed"])

    def test_normalize_rest_row_rejects_invalid_volume(self) -> None:
        bad_row = list(SAMPLE_REST_ROW)
        bad_row[5] = "-1"
        with self.assertRaises(ValueError):
            normalize_rest_kline_row(bad_row, "1m")

    def test_normalize_rest_row_rejects_infinite_volume(self) -> None:
        bad_row = list(SAMPLE_REST_ROW)
        bad_row[5] = "Infinity"
        with self.assertRaises(ValueError):
            normalize_rest_kline_row(bad_row, "1m")

    def test_normalize_rest_row_accepts_zero_and_positive_volume(self) -> None:
        zero_row = list(SAMPLE_REST_ROW)
        zero_row[5] = "0"
        self.assertEqual(normalize_rest_kline_row(zero_row, "1m")["volume"], 0.0)

        positive_row = list(SAMPLE_REST_ROW)
        positive_row[5] = "42.5"
        self.assertEqual(normalize_rest_kline_row(positive_row, "1m")["volume"], 42.5)

    def test_normalize_ws_kline_rejects_missing_volume(self) -> None:
        kline = dict(SAMPLE_WS_KLINE)
        del kline["v"]
        with self.assertRaises(KeyError):
            normalize_ws_kline(kline)

    def test_parse_ws_payload_rejects_invalid_volume(self) -> None:
        kline = dict(SAMPLE_WS_KLINE)
        kline["v"] = "-5"
        payload = json.dumps({"e": "kline", "k": kline})
        self.assertIsNone(parse_binance_ws_payload(payload))

    def test_parse_ws_payload_rejects_infinite_volume(self) -> None:
        kline = dict(SAMPLE_WS_KLINE)
        kline["v"] = "Infinity"
        payload = json.dumps({"e": "kline", "k": kline})
        self.assertIsNone(parse_binance_ws_payload(payload))

    def test_parse_ws_payload(self) -> None:
        payload = json.dumps({"e": "kline", "k": SAMPLE_WS_KLINE})
        candle = parse_binance_ws_payload(payload)
        self.assertIsNotNone(candle)
        self.assertEqual(candle["close"], 62050.4)


class BinanceUsdmBtcRestEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    @patch("app.market.binance_usdm_btc.httpx.get")
    def test_rest_endpoint_returns_normalized_candles(self, mock_get: MagicMock) -> None:
        response = MagicMock()
        response.raise_for_status = MagicMock()
        response.json.return_value = [SAMPLE_REST_ROW]
        mock_get.return_value = response

        result = self.client.get(
            "/api/market/binance/usdm/btcusdt/klines",
            params={"interval": "1m", "limit": 2},
        )

        self.assertEqual(result.status_code, 200)
        body = result.json()
        self.assertEqual(body["symbol"], "BTCUSDT")
        self.assertEqual(body["interval"], "1m")
        self.assertEqual(len(body["candles"]), 1)
        self.assertEqual(body["candles"][0]["open"], 62000.1)
        self.assertEqual(body["candles"][0]["volume"], 100.0)

    def test_rest_endpoint_rejects_invalid_interval(self) -> None:
        result = self.client.get(
            "/api/market/binance/usdm/btcusdt/klines",
            params={"interval": "2h"},
        )
        self.assertEqual(result.status_code, 400)

    @patch("app.market.binance_usdm_btc.httpx.get")
    def test_rest_endpoint_rejects_malformed_kline_row(self, mock_get: MagicMock) -> None:
        response = MagicMock()
        response.raise_for_status = MagicMock()
        response.json.return_value = [[1, "not-a-number", "62100.2", "61900.3", "62050.4", "0", 999]]
        mock_get.return_value = response

        result = self.client.get(
            "/api/market/binance/usdm/btcusdt/klines",
            params={"interval": "1m"},
        )

        self.assertEqual(result.status_code, 502)
        self.assertEqual(result.json()["detail"], "Binance market data response was invalid")


class BinanceUsdmBtcRelayTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.manager = WebSocketChannelManager()
        self.published: list[tuple[str, dict]] = []
        original_publish = self.manager.publish

        async def spy_publish(channel: str, payload: dict) -> None:
            self.published.append((channel, payload))
            await original_publish(channel, payload)

        self.manager.publish = spy_publish  # type: ignore[method-assign]

        @asynccontextmanager
        async def fake_connect(_url: str):
            class Upstream:
                async def recv(self_inner) -> str:
                    await asyncio.sleep(0.05)
                    return json.dumps({"e": "kline", "k": SAMPLE_WS_KLINE})

            yield Upstream()

        self.relay = BinanceUsdmBtcKlineRelay(self.manager, connect_ws=fake_connect)

    async def test_two_clients_share_single_upstream(self) -> None:
        channel = channel_for_interval("1m")
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

        await asyncio.sleep(0.15)
        self.assertGreaterEqual(len(self.published), 1)

        self.manager.disconnect(channel, socket_a)
        await self.relay.on_client_disconnected(channel)
        self.assertEqual(self.relay.upstream_count(channel), 1)

        self.manager.disconnect(channel, socket_b)
        await self.relay.on_client_disconnected(channel)
        self.assertEqual(self.relay.upstream_count(channel), 0)

    async def test_upstream_stops_when_last_client_leaves(self) -> None:
        channel = channel_for_interval("5m")
        socket = MagicMock()
        socket.accept = AsyncMock()
        socket.send_text = AsyncMock()

        await self.manager.connect(channel, socket)
        await self.relay.on_client_connected(channel)
        self.assertEqual(self.relay.upstream_count(channel), 1)

        self.manager.disconnect(channel, socket)
        await self.relay.on_client_disconnected(channel)
        self.assertEqual(self.relay.upstream_count(channel), 0)

    async def test_upstream_retries_past_eight_failures_while_subscriber_connected(self) -> None:
        connect_attempts = 0

        @asynccontextmanager
        async def always_failing_connect(_url: str):
            nonlocal connect_attempts
            connect_attempts += 1
            raise ConnectionError("upstream unavailable")
            yield  # pragma: no cover

        manager = WebSocketChannelManager()
        relay = BinanceUsdmBtcKlineRelay(
            manager,
            connect_ws=always_failing_connect,
            base_reconnect_delay_s=0.001,
            max_reconnect_delay_s=0.001,
        )
        channel = channel_for_interval("30m")
        socket = MagicMock()
        socket.accept = AsyncMock()
        socket.send_text = AsyncMock()

        await manager.connect(channel, socket)
        await relay.on_client_connected(channel)
        self.assertEqual(relay.upstream_count(channel), 1)

        for _ in range(50):
            if connect_attempts > 10:
                break
            await asyncio.sleep(0.01)

        self.assertGreater(connect_attempts, 8)
        self.assertEqual(relay.upstream_count(channel), 1)
        state = relay._upstreams[channel]
        self.assertFalse(state.task.done())

        manager.disconnect(channel, socket)
        await relay.on_client_disconnected(channel)
        self.assertEqual(relay.upstream_count(channel), 0)
        await asyncio.sleep(0.02)
        self.assertTrue(state.task.done())


class BinanceDailyContextTests(unittest.TestCase):
    def test_daily_context_window_uses_previous_utc_midnight_through_now(self) -> None:
        start_ms, end_ms = daily_context_window_ms(FIXED_NOW_MS)
        current_day_start = utc_day_start_ms(FIXED_NOW_MS)
        self.assertEqual(end_ms, FIXED_NOW_MS)
        self.assertEqual(start_ms, current_day_start - 86_400_000)

    @patch("app.market.binance_usdm_btc.httpx.get")
    def test_daily_context_paginates_1m_across_multiple_pages(self, mock_get: MagicMock) -> None:
        start_ms, end_ms = daily_context_window_ms(FIXED_NOW_MS)
        page_one = [_kline_row(start_ms + i * ONE_MINUTE_MS) for i in range(1000)]
        page_two_start = page_one[-1][0] + ONE_MINUTE_MS
        page_two = [_kline_row(page_two_start + i * ONE_MINUTE_MS) for i in range(50)]
        mock_get.side_effect = [
            _mock_klines_response(page_one),
            _mock_klines_response(page_two),
        ]

        candles = fetch_klines_daily_context_sync("1m", now_ms=FIXED_NOW_MS)

        self.assertEqual(mock_get.call_count, 2)
        self.assertEqual(len(candles), 1050)
        self.assertEqual(candles[0]["time"], start_ms // 1000)
        self.assertEqual(candles[-1]["time"], page_two[-1][0] // 1000)
        times = [candle["time"] for candle in candles]
        self.assertEqual(times, sorted(times))
        self.assertEqual(len(times), len(set(times)))

    @patch("app.market.binance_usdm_btc.httpx.get")
    def test_daily_context_deduplicates_boundary_candle(self, mock_get: MagicMock) -> None:
        start_ms, end_ms = daily_context_window_ms(FIXED_NOW_MS)
        boundary_open = start_ms + ONE_MINUTE_MS
        next_open = boundary_open + ONE_MINUTE_MS
        page_one = [_kline_row(boundary_open), _kline_row(next_open)]
        page_two = [
            _kline_row(next_open),
            _kline_row(next_open + ONE_MINUTE_MS),
        ]
        mock_get.side_effect = [
            _mock_klines_response(page_one),
            _mock_klines_response(page_two),
            _mock_klines_response([]),
        ]

        candles = fetch_klines_paginated_sync(
            "1m",
            start_ms,
            end_ms,
            now_ms=FIXED_NOW_MS,
            page_limit=2,
        )

        self.assertEqual(mock_get.call_count, 3)
        next_times = [c["time"] for c in candles if c["time"] == next_open // 1000]
        self.assertEqual(len(next_times), 1)
        self.assertEqual(len(candles), 3)

    @patch("app.market.binance_usdm_btc.httpx.get")
    def test_pagination_cursor_advances_after_full_page(self, mock_get: MagicMock) -> None:
        start_ms = 1_700_000_000_000
        end_ms = start_ms + 3 * ONE_MINUTE_MS
        page_one = [_kline_row(start_ms), _kline_row(start_ms + ONE_MINUTE_MS)]
        page_two = [_kline_row(start_ms + 2 * ONE_MINUTE_MS)]
        mock_get.side_effect = [
            _mock_klines_response(page_one),
            _mock_klines_response(page_two),
        ]

        candles = fetch_klines_paginated_sync(
            "1m",
            start_ms,
            end_ms,
            now_ms=FIXED_NOW_MS,
            page_limit=2,
        )

        second_call_params = mock_get.call_args_list[1].kwargs["params"]
        self.assertEqual(second_call_params["startTime"], start_ms + ONE_MINUTE_MS + 1)
        self.assertEqual(len(candles), 3)

    @patch("app.market.binance_usdm_btc.httpx.get")
    def test_empty_follow_up_page_ends_pagination(self, mock_get: MagicMock) -> None:
        start_ms, end_ms = daily_context_window_ms(FIXED_NOW_MS)
        page_one = [_kline_row(start_ms)]
        mock_get.side_effect = [
            _mock_klines_response(page_one),
            _mock_klines_response([]),
        ]

        candles = fetch_klines_paginated_sync(
            "1m",
            start_ms,
            end_ms,
            now_ms=FIXED_NOW_MS,
            page_limit=1,
        )

        self.assertEqual(mock_get.call_count, 2)
        self.assertEqual(len(candles), 1)

    @patch("app.market.binance_usdm_btc.httpx.get")
    def test_non_advancing_upstream_page_raises(self, mock_get: MagicMock) -> None:
        start_ms = 1_700_000_000_000
        end_ms = start_ms + 10 * ONE_MINUTE_MS
        cursor_start = start_ms + 5 * ONE_MINUTE_MS
        page = [
            _kline_row(cursor_start - 1),
            _kline_row(cursor_start - 1),
        ]
        mock_get.return_value = _mock_klines_response(page)

        with self.assertRaises(HTTPException) as ctx:
            fetch_klines_paginated_sync(
                "1m",
                cursor_start,
                end_ms,
                now_ms=FIXED_NOW_MS,
                page_limit=2,
            )

        self.assertEqual(ctx.exception.status_code, 502)

    @patch("app.market.binance_usdm_btc.httpx.get")
    def test_second_page_failure_does_not_return_partial_data(self, mock_get: MagicMock) -> None:
        start_ms, end_ms = daily_context_window_ms(FIXED_NOW_MS)
        page_one = [_kline_row(start_ms)]
        failing = MagicMock()
        failing.raise_for_status.side_effect = httpx.HTTPStatusError(
            "error",
            request=MagicMock(),
            response=MagicMock(status_code=500),
        )
        mock_get.side_effect = [_mock_klines_response(page_one), failing]

        with self.assertRaises(HTTPException) as ctx:
            fetch_klines_paginated_sync(
                "1m",
                start_ms,
                end_ms,
                now_ms=FIXED_NOW_MS,
                page_limit=1,
            )

        self.assertEqual(ctx.exception.status_code, 502)

    @patch("app.market.binance_usdm_btc.httpx.get")
    def test_max_pages_exhausted_before_range_complete_raises(self, mock_get: MagicMock) -> None:
        start_ms = 1_700_000_000_000
        end_ms = start_ms + 10 * ONE_MINUTE_MS
        page_one = [_kline_row(start_ms), _kline_row(start_ms + ONE_MINUTE_MS)]
        page_two = [_kline_row(start_ms + 2 * ONE_MINUTE_MS), _kline_row(start_ms + 3 * ONE_MINUTE_MS)]
        mock_get.side_effect = [
            _mock_klines_response(page_one),
            _mock_klines_response(page_two),
        ]

        with self.assertRaises(HTTPException) as ctx:
            fetch_klines_paginated_sync(
                "1m",
                start_ms,
                end_ms,
                now_ms=FIXED_NOW_MS,
                page_limit=2,
                max_pages=2,
            )

        self.assertEqual(ctx.exception.status_code, 502)
        self.assertEqual(mock_get.call_count, 2)

    @patch("app.market.binance_usdm_btc.httpx.get")
    def test_full_last_page_at_end_time_ms_completes_without_extra_request(
        self, mock_get: MagicMock
    ) -> None:
        start_ms = 1_700_000_000_000
        end_ms = start_ms + ONE_MINUTE_MS
        page = [_kline_row(start_ms), _kline_row(end_ms)]
        mock_get.return_value = _mock_klines_response(page)

        candles = fetch_klines_paginated_sync(
            "1m",
            start_ms,
            end_ms,
            now_ms=FIXED_NOW_MS,
            page_limit=2,
        )

        self.assertEqual(mock_get.call_count, 1)
        self.assertEqual(len(candles), 2)
        self.assertEqual(candles[-1]["time"], end_ms // 1000)

    @patch("app.market.binance_usdm_btc.httpx.get")
    def test_next_cursor_past_end_time_ms_completes_without_extra_request(
        self, mock_get: MagicMock
    ) -> None:
        start_ms = 1_700_000_000_000
        end_ms = start_ms + ONE_MINUTE_MS
        mock_get.side_effect = [
            _mock_klines_response([_kline_row(start_ms)]),
            _mock_klines_response([_kline_row(end_ms)]),
        ]

        candles = fetch_klines_paginated_sync(
            "1m",
            start_ms,
            end_ms,
            now_ms=FIXED_NOW_MS,
            page_limit=1,
        )

        self.assertEqual(mock_get.call_count, 2)
        self.assertEqual(len(candles), 2)


class BinanceHistoryBeforeTests(unittest.TestCase):
    def test_history_before_window_is_previous_utc_day(self) -> None:
        before_seconds = int(datetime(2024, 1, 2, 15, 30, tzinfo=timezone.utc).timestamp())
        start_ms, end_ms = history_before_window_ms(before_seconds)
        day_two_start = utc_day_start_ms(before_seconds * 1000)
        day_one_start = day_two_start - 86_400_000
        self.assertEqual(start_ms, day_one_start)
        self.assertEqual(end_ms, day_two_start - 1)

    @patch("app.market.binance_usdm_btc.httpx.get")
    def test_history_before_excludes_candles_at_or_after_before(self, mock_get: MagicMock) -> None:
        before_seconds = int(datetime(2024, 1, 2, 0, 0, tzinfo=timezone.utc).timestamp())
        day_one_start = utc_day_start_ms(before_seconds * 1000) - 86_400_000
        rows = [
            _kline_row(day_one_start),
            _kline_row(day_one_start + ONE_MINUTE_MS),
            _kline_row(before_seconds * 1000),
        ]
        mock_get.return_value = _mock_klines_response(rows)

        candles = fetch_klines_history_before_sync("1m", before_seconds, now_ms=FIXED_NOW_MS)

        self.assertEqual(len(candles), 2)
        self.assertTrue(all(candle["time"] < before_seconds for candle in candles))
        times = [candle["time"] for candle in candles]
        self.assertEqual(times, sorted(times))
        self.assertEqual(len(times), len(set(times)))

    @patch("app.market.binance_usdm_btc.httpx.get")
    def test_history_before_paginates_1m_day(self, mock_get: MagicMock) -> None:
        before_seconds = int(datetime(2024, 1, 3, 12, 0, tzinfo=timezone.utc).timestamp())
        start_ms, end_ms = history_before_window_ms(before_seconds)
        page_one = [_kline_row(start_ms + i * ONE_MINUTE_MS) for i in range(1000)]
        page_two_start = page_one[-1][0] + ONE_MINUTE_MS
        remaining = int((end_ms - page_two_start) / ONE_MINUTE_MS) + 1
        page_two = [_kline_row(page_two_start + i * ONE_MINUTE_MS) for i in range(remaining)]
        mock_get.side_effect = [
            _mock_klines_response(page_one),
            _mock_klines_response(page_two),
        ]

        candles = fetch_klines_history_before_sync("1m", before_seconds, now_ms=FIXED_NOW_MS)

        self.assertEqual(mock_get.call_count, 2)
        self.assertEqual(candles[0]["time"], start_ms // 1000)
        self.assertLess(candles[-1]["time"], before_seconds)

    def test_history_before_rejects_invalid_before(self) -> None:
        client = TestClient(app)
        result = client.get(
            "/api/market/binance/usdm/btcusdt/klines/history",
            params={"interval": "1m", "before": 0},
        )
        self.assertEqual(result.status_code, 400)

    def test_history_before_rejects_invalid_interval(self) -> None:
        client = TestClient(app)
        result = client.get(
            "/api/market/binance/usdm/btcusdt/klines/history",
            params={"interval": "2h", "before": 1_700_000_000},
        )
        self.assertEqual(result.status_code, 400)

    @patch("app.market.binance_usdm_btc.fetch_klines_paginated_sync")
    def test_history_before_pagination_failure_raises(self, mock_paginated: MagicMock) -> None:
        mock_paginated.side_effect = HTTPException(status_code=502, detail="Binance market data request failed")
        before_seconds = int(datetime(2024, 1, 3, 12, 0, tzinfo=timezone.utc).timestamp())

        with self.assertRaises(HTTPException) as ctx:
            fetch_klines_history_before_sync("1m", before_seconds, now_ms=FIXED_NOW_MS)

        self.assertEqual(ctx.exception.status_code, 502)


class BinanceWeeklyContextTests(unittest.TestCase):
    def test_wednesday_week_start_is_monday_utc_midnight(self) -> None:
        wed_ms = int(datetime(2024, 1, 3, 12, 0, tzinfo=timezone.utc).timestamp() * 1000)
        mon_ms = int(datetime(2024, 1, 1, 0, 0, tzinfo=timezone.utc).timestamp() * 1000)
        self.assertEqual(utc_week_start_ms(wed_ms), mon_ms)

    def test_sunday_remains_in_same_utc_week(self) -> None:
        sun_ms = int(datetime(2024, 1, 7, 23, 0, tzinfo=timezone.utc).timestamp() * 1000)
        mon_ms = int(datetime(2024, 1, 1, 0, 0, tzinfo=timezone.utc).timestamp() * 1000)
        self.assertEqual(utc_week_start_ms(sun_ms), mon_ms)

    def test_monday_midnight_starts_new_utc_week(self) -> None:
        mon_ms = int(datetime(2024, 1, 8, 0, 0, tzinfo=timezone.utc).timestamp() * 1000)
        prior_mon_ms = int(datetime(2024, 1, 1, 0, 0, tzinfo=timezone.utc).timestamp() * 1000)
        self.assertEqual(utc_week_start_ms(mon_ms), mon_ms)
        self.assertNotEqual(utc_week_start_ms(mon_ms), prior_mon_ms)

    def test_year_boundary_week_grouping(self) -> None:
        wed_new_year_ms = int(datetime(2025, 1, 1, 12, 0, tzinfo=timezone.utc).timestamp() * 1000)
        mon_dec_30_ms = int(datetime(2024, 12, 30, 0, 0, tzinfo=timezone.utc).timestamp() * 1000)
        mon_jan_6_ms = int(datetime(2025, 1, 6, 0, 0, tzinfo=timezone.utc).timestamp() * 1000)
        self.assertEqual(utc_week_start_ms(wed_new_year_ms), mon_dec_30_ms)
        self.assertEqual(utc_week_start_ms(mon_jan_6_ms), mon_jan_6_ms)

    def test_weekly_context_window_starts_previous_monday_through_now(self) -> None:
        now_ms = int(datetime(2024, 1, 10, 15, 30, tzinfo=timezone.utc).timestamp() * 1000)
        start_ms, end_ms = weekly_context_window_ms(now_ms)
        current_week_start = utc_week_start_ms(now_ms)
        previous_monday_ms = current_week_start - 7 * 86_400_000
        self.assertEqual(end_ms, now_ms)
        self.assertEqual(start_ms, previous_monday_ms)

    @patch("app.market.binance_usdm_btc.fetch_klines_paginated_sync")
    def test_fetch_weekly_context_uses_single_reference_ms(self, mock_paginated: MagicMock) -> None:
        mock_paginated.return_value = []
        now_ms = FIXED_NOW_MS
        start_ms, end_ms = weekly_context_window_ms(now_ms)

        fetch_klines_weekly_context_sync("1m", now_ms=now_ms)

        mock_paginated.assert_called_once_with(
            "1m",
            start_ms,
            end_ms,
            now_ms=now_ms,
            http_get=None,
        )

    @patch("app.market.binance_usdm_btc.fetch_klines_paginated_sync")
    def test_weekly_context_pagination_failure_raises(self, mock_paginated: MagicMock) -> None:
        mock_paginated.side_effect = HTTPException(
            status_code=502,
            detail="Binance market data response was invalid",
        )

        with self.assertRaises(HTTPException) as ctx:
            fetch_klines_weekly_context_sync("1m", now_ms=FIXED_NOW_MS)

        self.assertEqual(ctx.exception.status_code, 502)

    def test_1m_weekly_window_fits_within_default_max_pages(self) -> None:
        worst_case_now_ms = int(
            datetime(2024, 1, 7, 23, 59, tzinfo=timezone.utc).timestamp() * 1000
        )
        start_ms, end_ms = weekly_context_window_ms(worst_case_now_ms)
        span_ms = end_ms - start_ms
        max_one_minute_candles = span_ms // ONE_MINUTE_MS + 1
        pages_needed = math.ceil(max_one_minute_candles / 1000)
        self.assertLessEqual(pages_needed, 32)
        self.assertLessEqual(max_one_minute_candles, 32 * 1000)


class BinanceWeeklyContextEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    @patch("app.main.fetch_klines_weekly_context_sync")
    def test_weekly_context_endpoint_shape(self, mock_fetch: MagicMock) -> None:
        mock_fetch.return_value = [
            normalize_rest_kline_row(SAMPLE_REST_ROW, "1m", now_ms=FIXED_NOW_MS),
        ]

        result = self.client.get(
            "/api/market/binance/usdm/btcusdt/klines/weekly-context",
            params={"interval": "1m"},
        )

        self.assertEqual(result.status_code, 200)
        body = result.json()
        self.assertEqual(body["symbol"], "BTCUSDT")
        self.assertEqual(body["interval"], "1m")
        self.assertEqual(len(body["candles"]), 1)

    def test_weekly_context_rejects_invalid_interval(self) -> None:
        result = self.client.get(
            "/api/market/binance/usdm/btcusdt/klines/weekly-context",
            params={"interval": "2h"},
        )
        self.assertEqual(result.status_code, 400)

    @patch("app.main.fetch_klines_weekly_context_sync")
    def test_weekly_context_pagination_failure_returns_502(self, mock_fetch: MagicMock) -> None:
        mock_fetch.side_effect = HTTPException(
            status_code=502,
            detail="Binance market data response was invalid",
        )

        result = self.client.get(
            "/api/market/binance/usdm/btcusdt/klines/weekly-context",
            params={"interval": "1m"},
        )

        self.assertEqual(result.status_code, 502)


class BinanceDailyContextEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    @patch("app.main.fetch_klines_daily_context_sync")
    def test_daily_context_endpoint_shape(self, mock_fetch: MagicMock) -> None:
        mock_fetch.return_value = [
            normalize_rest_kline_row(SAMPLE_REST_ROW, "1m", now_ms=FIXED_NOW_MS),
        ]

        result = self.client.get(
            "/api/market/binance/usdm/btcusdt/klines/daily-context",
            params={"interval": "1m"},
        )

        self.assertEqual(result.status_code, 200)
        body = result.json()
        self.assertEqual(body["symbol"], "BTCUSDT")
        self.assertEqual(body["interval"], "1m")
        self.assertEqual(len(body["candles"]), 1)


class BinanceUsdmBtcGenericWsTests(unittest.TestCase):
    def test_generic_ping_pong_still_works(self) -> None:
        client = TestClient(app)
        with client.websocket_connect("/api/ws/trades.live") as websocket:
            websocket.receive_json()
            websocket.send_json({"type": "ping"})
            message = websocket.receive_json()
            self.assertEqual(message["type"], "pong")


if __name__ == "__main__":
    unittest.main()
