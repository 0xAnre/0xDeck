from __future__ import annotations

import asyncio
import json
import math
import re
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, TypedDict

import httpx
import websockets
from fastapi import HTTPException

from app.ws import WebSocketChannelManager, ws_manager

BINANCE_USDM_REST_BASE = "https://fapi.binance.com"
BINANCE_USDM_KLINES_PATH = "/fapi/v1/klines"
BINANCE_USDM_WS_BASE = "wss://fstream.binance.com"

SYMBOL = "BTCUSDT"
SYMBOL_LOWER = "btcusdt"

SUPPORTED_INTERVALS = frozenset({"1m", "5m", "30m", "4h", "1d"})
DEFAULT_INTERVAL = "1m"
DEFAULT_LIMIT = 500
MIN_LIMIT = 1
MAX_LIMIT = 1000

CHANNEL_PREFIX = "binance.usdm.btcusdt.kline."
CHANNEL_PATTERN = re.compile(
    r"^binance\.usdm\.btcusdt\.kline\.(1m|5m|30m|4h|1d)$",
)

BASE_RECONNECT_DELAY_S = 1.0
MAX_RECONNECT_DELAY_S = 30.0


class NormalizedCandle(TypedDict):
    symbol: str
    interval: str
    time: int
    open: float
    high: float
    low: float
    close: float
    volume: float
    closed: bool


def _parse_volume(value: Any) -> float:
    try:
        volume = float(value)
    except (TypeError, ValueError):
        raise ValueError("Invalid volume") from None
    if not math.isfinite(volume) or volume < 0:
        raise ValueError("Invalid volume")
    return volume


def channel_for_interval(interval: str) -> str:
    return f"{CHANNEL_PREFIX}{interval}"


def parse_channel_interval(channel: str) -> str | None:
    match = CHANNEL_PATTERN.fullmatch(channel)
    if not match:
        return None
    return match.group(1)


def validate_interval(interval: str) -> str:
    if interval not in SUPPORTED_INTERVALS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported interval '{interval}'. Allowed: {', '.join(sorted(SUPPORTED_INTERVALS))}",
        )
    return interval


def clamp_limit(limit: int) -> int:
    return max(MIN_LIMIT, min(limit, MAX_LIMIT))


def binance_ws_stream_url(interval: str) -> str:
    return f"{BINANCE_USDM_WS_BASE}/market/ws/{SYMBOL_LOWER}@kline_{interval}"


def normalize_rest_kline_row(row: list[Any], interval: str, now_ms: int | None = None) -> NormalizedCandle:
    if len(row) < 7:
        raise ValueError("Invalid Binance kline row")

    open_time_ms = int(row[0])
    close_time_ms = int(row[6])
    reference_ms = now_ms if now_ms is not None else int(time.time() * 1000)

    return {
        "symbol": SYMBOL,
        "interval": interval,
        "time": open_time_ms // 1000,
        "open": float(row[1]),
        "high": float(row[2]),
        "low": float(row[3]),
        "close": float(row[4]),
        "volume": _parse_volume(row[5]),
        "closed": reference_ms >= close_time_ms,
    }


def normalize_ws_kline(kline: dict[str, Any]) -> NormalizedCandle:
    interval = str(kline["i"])
    if interval not in SUPPORTED_INTERVALS:
        raise ValueError("Unsupported kline interval in stream")

    return {
        "symbol": SYMBOL,
        "interval": interval,
        "time": int(kline["t"]) // 1000,
        "open": float(kline["o"]),
        "high": float(kline["h"]),
        "low": float(kline["l"]),
        "close": float(kline["c"]),
        "volume": _parse_volume(kline["v"]),
        "closed": bool(kline["x"]),
    }


def parse_binance_ws_payload(raw: str) -> NormalizedCandle | None:
    payload = json.loads(raw)
    if not isinstance(payload, dict):
        return None

    event = payload.get("data") if isinstance(payload.get("data"), dict) else payload
    if not isinstance(event, dict) or event.get("e") != "kline":
        return None

    kline = event.get("k")
    if not isinstance(kline, dict):
        return None

    try:
        return normalize_ws_kline(kline)
    except (KeyError, TypeError, ValueError):
        return None


def utc_day_start_ms(epoch_ms: int) -> int:
    dt = datetime.fromtimestamp(epoch_ms / 1000, tz=timezone.utc)
    day_start = datetime(dt.year, dt.month, dt.day, tzinfo=timezone.utc)
    return int(day_start.timestamp() * 1000)


def daily_context_window_ms(now_ms: int) -> tuple[int, int]:
    current_day_start = utc_day_start_ms(now_ms)
    start_ms = current_day_start - 86_400_000
    end_ms = now_ms
    return start_ms, end_ms


MS_PER_UTC_WEEK = 7 * 86_400_000


def utc_week_start_ms(epoch_ms: int) -> int:
    dt = datetime.fromtimestamp(epoch_ms / 1000, tz=timezone.utc)
    monday = datetime(dt.year, dt.month, dt.day, tzinfo=timezone.utc) - timedelta(days=dt.weekday())
    return int(monday.timestamp() * 1000)


def weekly_context_window_ms(now_ms: int) -> tuple[int, int]:
    current_week_start = utc_week_start_ms(now_ms)
    start_ms = current_week_start - MS_PER_UTC_WEEK
    end_ms = now_ms
    return start_ms, end_ms


def history_before_window_ms(before_epoch_seconds: int) -> tuple[int, int]:
    """One full UTC day immediately before the UTC day that contains `before`."""
    if before_epoch_seconds <= 0:
        raise ValueError("Invalid before timestamp")

    before_ms = before_epoch_seconds * 1000
    before_day_start_ms = utc_day_start_ms(before_ms)
    end_ms = before_day_start_ms - 1
    start_ms = before_day_start_ms - 86_400_000
    return start_ms, end_ms


def validate_before_epoch_seconds(before: int) -> int:
    if before <= 0:
        raise HTTPException(
            status_code=400,
            detail="Query parameter 'before' must be a positive Unix timestamp in seconds",
        )
    return before


def fetch_klines_history_before_sync(
    interval: str,
    before_epoch_seconds: int,
    now_ms: int | None = None,
    http_get: Callable[..., httpx.Response] | None = None,
) -> list[NormalizedCandle]:
    reference_ms = now_ms if now_ms is not None else int(time.time() * 1000)
    start_ms, end_ms = history_before_window_ms(before_epoch_seconds)
    if start_ms > end_ms:
        return []

    candles = fetch_klines_paginated_sync(
        interval,
        start_ms,
        end_ms,
        now_ms=reference_ms,
        http_get=http_get,
    )
    return [candle for candle in candles if candle["time"] < before_epoch_seconds]


def _fetch_binance_klines_rows(
    params: dict[str, Any],
    http_get: Callable[..., httpx.Response] | None = None,
) -> list[Any]:
    get = http_get if http_get is not None else httpx.get
    url = f"{BINANCE_USDM_REST_BASE}{BINANCE_USDM_KLINES_PATH}"

    try:
        response = get(url, params=params, timeout=10.0)
        response.raise_for_status()
    except httpx.TimeoutException:
        raise HTTPException(status_code=502, detail="Binance market data request timed out") from None
    except httpx.HTTPStatusError:
        raise HTTPException(status_code=502, detail="Binance market data request failed") from None
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Binance market data request failed") from None

    try:
        rows = response.json()
    except ValueError:
        raise HTTPException(status_code=502, detail="Binance market data response was invalid") from None

    if not isinstance(rows, list):
        raise HTTPException(status_code=502, detail="Binance market data response was invalid") from None

    return rows


def _normalize_rows_in_range(
    rows: list[Any],
    interval: str,
    start_time_ms: int,
    end_time_ms: int,
    now_ms: int,
    by_time: dict[int, NormalizedCandle],
) -> int | None:
    last_open_ms: int | None = None

    for row in rows:
        if not isinstance(row, list):
            raise HTTPException(status_code=502, detail="Binance market data response was invalid")
        try:
            open_time_ms = int(row[0])
        except (TypeError, ValueError):
            raise HTTPException(status_code=502, detail="Binance market data response was invalid") from None

        last_open_ms = open_time_ms
        if open_time_ms < start_time_ms or open_time_ms > end_time_ms:
            continue

        try:
            candle = normalize_rest_kline_row(row, interval, now_ms)
        except (TypeError, ValueError):
            raise HTTPException(
                status_code=502,
                detail="Binance market data response was invalid",
            ) from None

        by_time[candle["time"]] = candle

    return last_open_ms


def fetch_klines_paginated_sync(
    interval: str,
    start_time_ms: int,
    end_time_ms: int,
    *,
    now_ms: int,
    page_limit: int = MAX_LIMIT,
    http_get: Callable[..., httpx.Response] | None = None,
    max_pages: int = 32,
) -> list[NormalizedCandle]:
    if start_time_ms > end_time_ms:
        return []

    safe_limit = clamp_limit(page_limit)
    by_time: dict[int, NormalizedCandle] = {}
    cursor = start_time_ms
    range_complete = False

    for _ in range(max_pages):
        params = {
            "symbol": SYMBOL,
            "interval": interval,
            "startTime": cursor,
            "endTime": end_time_ms,
            "limit": safe_limit,
        }
        rows = _fetch_binance_klines_rows(params, http_get=http_get)

        if len(rows) == 0:
            range_complete = True
            break

        last_open_ms = _normalize_rows_in_range(
            rows,
            interval,
            start_time_ms,
            end_time_ms,
            now_ms,
            by_time,
        )
        if last_open_ms is None:
            raise HTTPException(status_code=502, detail="Binance market data response was invalid")

        if len(rows) < safe_limit:
            range_complete = True
            break

        next_cursor = last_open_ms + 1
        if next_cursor <= cursor:
            raise HTTPException(status_code=502, detail="Binance market data response was invalid")

        if last_open_ms >= end_time_ms or next_cursor > end_time_ms:
            range_complete = True
            break

        cursor = next_cursor

    if not range_complete:
        raise HTTPException(status_code=502, detail="Binance market data response was invalid")

    return [by_time[key] for key in sorted(by_time)]


def fetch_klines_daily_context_sync(
    interval: str,
    now_ms: int | None = None,
    http_get: Callable[..., httpx.Response] | None = None,
) -> list[NormalizedCandle]:
    reference_ms = now_ms if now_ms is not None else int(time.time() * 1000)
    start_ms, end_ms = daily_context_window_ms(reference_ms)
    return fetch_klines_paginated_sync(
        interval,
        start_ms,
        end_ms,
        now_ms=reference_ms,
        http_get=http_get,
    )


def fetch_klines_weekly_context_sync(
    interval: str,
    now_ms: int | None = None,
    http_get: Callable[..., httpx.Response] | None = None,
) -> list[NormalizedCandle]:
    reference_ms = now_ms if now_ms is not None else int(time.time() * 1000)
    start_ms, end_ms = weekly_context_window_ms(reference_ms)
    return fetch_klines_paginated_sync(
        interval,
        start_ms,
        end_ms,
        now_ms=reference_ms,
        http_get=http_get,
    )


def fetch_klines_sync(interval: str, limit: int) -> list[NormalizedCandle]:
    params = {"symbol": SYMBOL, "interval": interval, "limit": clamp_limit(limit)}
    rows = _fetch_binance_klines_rows(params)
    now_ms = int(time.time() * 1000)
    candles: list[NormalizedCandle] = []
    for row in rows:
        if not isinstance(row, list):
            raise HTTPException(status_code=502, detail="Binance market data response was invalid")
        try:
            candles.append(normalize_rest_kline_row(row, interval, now_ms))
        except (TypeError, ValueError):
            raise HTTPException(
                status_code=502,
                detail="Binance market data response was invalid",
            ) from None

    return candles


@dataclass
class _UpstreamState:
    task: asyncio.Task[None]
    stop_event: asyncio.Event = field(default_factory=asyncio.Event)


class BinanceUsdmBtcKlineRelay:
    def __init__(
        self,
        manager: WebSocketChannelManager,
        connect_ws: Callable[[str], Any] | None = None,
        base_reconnect_delay_s: float = BASE_RECONNECT_DELAY_S,
        max_reconnect_delay_s: float = MAX_RECONNECT_DELAY_S,
    ) -> None:
        self._manager = manager
        self._connect_ws = connect_ws
        self._base_reconnect_delay_s = base_reconnect_delay_s
        self._max_reconnect_delay_s = max_reconnect_delay_s
        self._upstreams: dict[str, _UpstreamState] = {}

    def upstream_count(self, channel: str) -> int:
        return 1 if channel in self._upstreams else 0

    async def on_client_connected(self, channel: str) -> None:
        interval = parse_channel_interval(channel)
        if interval is None:
            return
        if self._manager.connection_count(channel) != 1:
            return
        await self._start_upstream(channel, interval)

    async def on_client_disconnected(self, channel: str) -> None:
        interval = parse_channel_interval(channel)
        if interval is None:
            return
        if self._manager.connection_count(channel) != 0:
            return
        await self._stop_upstream(channel)

    async def shutdown(self) -> None:
        for channel in list(self._upstreams):
            await self._stop_upstream(channel)

    def _clear_upstream_if_current(self, channel: str, task: asyncio.Task[None]) -> None:
        state = self._upstreams.get(channel)
        if state is not None and state.task is task:
            del self._upstreams[channel]

    async def _start_upstream(self, channel: str, interval: str) -> None:
        existing = self._upstreams.get(channel)
        if existing is not None:
            if not existing.task.done():
                return
            del self._upstreams[channel]

        stop_event = asyncio.Event()
        task = asyncio.create_task(self._run_upstream(channel, interval, stop_event))
        self._upstreams[channel] = _UpstreamState(task=task, stop_event=stop_event)

    async def _stop_upstream(self, channel: str) -> None:
        state = self._upstreams.get(channel)
        if state is None:
            return

        task = state.task
        self._upstreams.pop(channel, None)
        state.stop_event.set()
        if not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

    async def _run_upstream(self, channel: str, interval: str, stop_event: asyncio.Event) -> None:
        task = asyncio.current_task()
        if task is None:
            return

        try:
            attempt = 0
            url = binance_ws_stream_url(interval)

            while not stop_event.is_set():
                if self._manager.connection_count(channel) == 0:
                    return

                try:
                    await self._consume_upstream(channel, url, stop_event)
                    attempt = 0
                except asyncio.CancelledError:
                    raise
                except Exception:
                    attempt += 1
                    if stop_event.is_set() or self._manager.connection_count(channel) == 0:
                        return
                    delay = min(
                        self._base_reconnect_delay_s * (2 ** (attempt - 1)),
                        self._max_reconnect_delay_s,
                    )
                    try:
                        await asyncio.wait_for(stop_event.wait(), timeout=delay)
                        return
                    except asyncio.TimeoutError:
                        continue
        finally:
            self._clear_upstream_if_current(channel, task)

    async def _consume_upstream(
        self,
        channel: str,
        url: str,
        stop_event: asyncio.Event,
    ) -> None:
        connect = self._connect_ws or websockets.connect
        async with connect(url) as upstream:
            while not stop_event.is_set():
                if self._manager.connection_count(channel) == 0:
                    return

                raw = await upstream.recv()
                if isinstance(raw, bytes):
                    raw = raw.decode()

                candle = parse_binance_ws_payload(str(raw))
                if candle is None:
                    continue

                await self._manager.publish(channel, candle)


binance_kline_relay = BinanceUsdmBtcKlineRelay(ws_manager)
