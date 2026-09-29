from __future__ import annotations

import asyncio
import json
import re
import time
from dataclasses import dataclass, field
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
    closed: bool


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
    return f"{BINANCE_USDM_WS_BASE}/ws/{SYMBOL_LOWER}@kline_{interval}"


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

    return normalize_ws_kline(kline)


def fetch_klines_sync(interval: str, limit: int) -> list[NormalizedCandle]:
    url = f"{BINANCE_USDM_REST_BASE}{BINANCE_USDM_KLINES_PATH}"
    params = {"symbol": SYMBOL, "interval": interval, "limit": limit}

    try:
        response = httpx.get(url, params=params, timeout=10.0)
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
