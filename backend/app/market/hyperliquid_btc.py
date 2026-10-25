from __future__ import annotations

import asyncio
import json
import re
import time
from dataclasses import dataclass, field
from typing import Any, Callable

import httpx
import websockets
from fastapi import HTTPException

from app.ws import WebSocketChannelManager, ws_manager
from .common import (
    DEFAULT_INTERVAL,
    DEFAULT_LIMIT,
    HISTORY_BATCH_BARS,
    INTERVAL_DURATION_MS,
    MAX_LIMIT,
    MIN_INITIAL_HISTORY_BARS,
    MIN_LIMIT,
    MONTHLY_CONTEXT_INTERVALS,
    MS_PER_UTC_WEEK,
    NormalizedCandle,
    QUARTERLY_CONTEXT_INTERVALS,
    SUPPORTED_INTERVALS,
    VOLUME_PROFILE_END_TIME_INVALID_DETAIL,
    VOLUME_PROFILE_INTERVAL_DURATION_MS,
    VOLUME_PROFILE_MAX_ESTIMATED_CANDLES,
    VOLUME_PROFILE_RANGE_TOO_LARGE_DETAIL,
    VOLUME_PROFILE_SOURCE_INTERVALS,
    VOLUME_PROFILE_START_TIME_INVALID_DETAIL,
    VOLUME_PROFILE_TIME_ORDER_INVALID_DETAIL,
    YEARLY_CONTEXT_INTERVALS,
    HistoryPage,
    _parse_volume,
    clamp_limit,
    context_fetch_window_ms,
    daily_context_window_ms,
    estimate_volume_profile_candle_count,
    history_before_window_ms,
    interval_duration_ms,
    monthly_context_window_ms,
    quarterly_context_window_ms,
    recent_history_start_ms,
    select_volume_profile_source_interval,
    utc_day_start_ms,
    utc_month_start_ms,
    utc_quarter_start_ms,
    utc_week_start_ms,
    utc_year_start_ms,
    validate_before_epoch_seconds,
    validate_interval,
    validate_monthly_context_interval,
    validate_quarterly_context_interval,
    validate_volume_profile_time_range,
    validate_yearly_context_interval,
    volume_profile_interval_duration_ms,
    weekly_context_window_ms,
    yearly_context_window_ms,
)

HYPERLIQUID_INFO_URL = "https://api.hyperliquid.xyz/info"
HYPERLIQUID_WS_URL = "wss://api.hyperliquid.xyz/ws"

EXCHANGE = "hyperliquid"
COIN = "BTC"
SYMBOL = "BTC"

# Hyperliquid: "Only the most recent 5000 candles are available" per interval.
HYPERLIQUID_HISTORY_LIMIT_CANDLES = 5000
# Hyperliquid prices use 5 significant figures and max 6 - szDecimals decimals.
HYPERLIQUID_BTC_SIZE_DECIMALS = 5

CHANNEL_PREFIX = "hyperliquid.btc.kline."
CHANNEL_PATTERN = re.compile(
    r"^hyperliquid\.btc\.kline\.(1m|5m|15m|30m|1h|2h|4h|1d|1w)$",
)

BASE_RECONNECT_DELAY_S = 1.0
MAX_RECONNECT_DELAY_S = 30.0


def channel_for_interval(interval: str) -> str:
    return f"{CHANNEL_PREFIX}{interval}"


def parse_channel_interval(channel: str) -> str | None:
    match = CHANNEL_PATTERN.fullmatch(channel)
    if not match:
        return None
    return match.group(1)


def hyperliquid_ws_url() -> str:
    return HYPERLIQUID_WS_URL


def subscription_payload(interval: str) -> dict[str, Any]:
    return {
        "method": "subscribe",
        "subscription": {"type": "candle", "coin": COIN, "interval": interval},
    }


def normalize_candle(
    item: dict[str, Any],
    interval: str | None = None,
    now_ms: int | None = None,
) -> NormalizedCandle:
    if not isinstance(item, dict):
        raise ValueError("Invalid Hyperliquid candle")

    item_interval = str(item["i"])
    if item_interval not in SUPPORTED_INTERVALS:
        raise ValueError("Unsupported candle interval")
    if interval is not None and item_interval != interval:
        raise ValueError("Candle interval mismatch")
    if str(item.get("s")) != COIN:
        raise ValueError("Unexpected candle coin")

    open_time_ms = int(item["t"])
    close_time_ms = int(item["T"])
    if open_time_ms < 0 or close_time_ms < open_time_ms:
        raise ValueError("Invalid candle time")
    reference_ms = now_ms if now_ms is not None else int(time.time() * 1000)

    return {
        "exchange": EXCHANGE,
        "symbol": SYMBOL,
        "interval": item_interval,
        "time": open_time_ms // 1000,
        "open": float(item["o"]),
        "high": float(item["h"]),
        "low": float(item["l"]),
        "close": float(item["c"]),
        "volume": _parse_volume(item["v"]),
        # `T` is the inclusive close timestamp. Finalization is derived from
        # time (and from the next candle open in the relay), never from arrival.
        "closed": reference_ms > close_time_ms,
    }


def parse_hyperliquid_ws_payload(
    raw: str,
    now_ms: int | None = None,
) -> NormalizedCandle | None:
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if not isinstance(payload, dict):
        return None
    if payload.get("channel") != "candle":
        return None
    data = payload.get("data")
    if not isinstance(data, dict):
        return None

    try:
        return normalize_candle(data, now_ms=now_ms)
    except (KeyError, TypeError, ValueError):
        return None


def history_available_from_ms(now_ms: int, interval: str) -> int:
    return now_ms - HYPERLIQUID_HISTORY_LIMIT_CANDLES * interval_duration_ms(interval)


def history_available_from_seconds(now_ms: int, interval: str) -> int:
    return history_available_from_ms(now_ms, interval) // 1000


def price_tick_size(reference_price: float | None = None) -> float:
    """Hyperliquid BTC perp price increment (5 significant figures).

    Integer prices are always valid and perps allow at most
    `6 - szDecimals` (= 1) decimals for BTC.
    """
    if reference_price is None or reference_price <= 0:
        return 1.0
    magnitude = int(f"{reference_price:e}".split("e")[1])
    five_significant_figures = 10 ** (magnitude - 4)
    max_decimals = 6 - HYPERLIQUID_BTC_SIZE_DECIMALS
    return max(10 ** -max_decimals, five_significant_figures)


def _fetch_candle_snapshot(
    interval: str,
    start_time_ms: int,
    end_time_ms: int,
    http_post: Callable[..., httpx.Response] | None = None,
) -> list[Any]:
    post = http_post if http_post is not None else httpx.post
    body = {
        "type": "candleSnapshot",
        "req": {
            "coin": COIN,
            "interval": interval,
            "startTime": int(start_time_ms),
            "endTime": int(end_time_ms),
        },
    }

    try:
        response = post(HYPERLIQUID_INFO_URL, json=body, timeout=10.0)
        response.raise_for_status()
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=502,
            detail="Hyperliquid market data request timed out",
        ) from None
    except httpx.HTTPStatusError:
        raise HTTPException(
            status_code=502,
            detail="Hyperliquid market data request failed",
        ) from None
    except httpx.HTTPError:
        raise HTTPException(
            status_code=502,
            detail="Hyperliquid market data request failed",
        ) from None

    try:
        items = response.json()
    except ValueError:
        raise HTTPException(
            status_code=502,
            detail="Hyperliquid market data response was invalid",
        ) from None

    if not isinstance(items, list):
        raise HTTPException(
            status_code=502,
            detail="Hyperliquid market data response was invalid",
        ) from None

    return items


def fetch_klines_paginated_sync(
    interval: str,
    start_time_ms: int,
    end_time_ms: int,
    *,
    now_ms: int,
    page_limit: int = MAX_LIMIT,
    http_post: Callable[..., httpx.Response] | None = None,
    max_pages: int = 32,
) -> list[NormalizedCandle]:
    if start_time_ms > end_time_ms:
        return []

    available_from_ms = history_available_from_ms(now_ms, interval)
    cursor = max(start_time_ms, available_from_ms)
    if cursor > end_time_ms:
        return []

    safe_limit = clamp_limit(page_limit)
    by_time: dict[int, NormalizedCandle] = {}
    range_complete = False

    for _ in range(max_pages):
        items = _fetch_candle_snapshot(interval, cursor, end_time_ms, http_post=http_post)
        if len(items) == 0:
            range_complete = True
            break

        last_open_ms: int | None = None
        for item in items:
            if not isinstance(item, dict):
                raise HTTPException(
                    status_code=502,
                    detail="Hyperliquid market data response was invalid",
                )
            try:
                candle = normalize_candle(item, interval, now_ms)
            except (KeyError, TypeError, ValueError):
                raise HTTPException(
                    status_code=502,
                    detail="Hyperliquid market data response was invalid",
                ) from None

            open_ms = candle["time"] * 1000
            last_open_ms = open_ms if last_open_ms is None else max(last_open_ms, open_ms)
            if open_ms < start_time_ms or open_ms > end_time_ms:
                continue
            by_time[candle["time"]] = candle

        if last_open_ms is None:
            raise HTTPException(
                status_code=502,
                detail="Hyperliquid market data response was invalid",
            )

        if last_open_ms < cursor:
            # The provider returned only buckets opening before the cursor; no
            # requested candle exists in this window.
            range_complete = True
            break

        next_cursor = last_open_ms + 1
        if last_open_ms >= end_time_ms or next_cursor > end_time_ms:
            range_complete = True
            break
        # No more requested candles can fit after the last returned open.
        if last_open_ms + interval_duration_ms(interval) > end_time_ms:
            range_complete = True
            break

        cursor = next_cursor

    if not range_complete:
        raise HTTPException(
            status_code=502,
            detail="Hyperliquid market data response was invalid",
        )

    return [by_time[key] for key in sorted(by_time)]


def fetch_klines_history_before_sync(
    interval: str,
    before_epoch_seconds: int,
    now_ms: int | None = None,
    http_post: Callable[..., httpx.Response] | None = None,
) -> HistoryPage:
    reference_ms = now_ms if now_ms is not None else int(time.time() * 1000)
    available_from_ms = history_available_from_ms(reference_ms, interval)
    if before_epoch_seconds * 1000 <= available_from_ms:
        return HistoryPage(
            candles=[],
            history_unavailable=True,
            available_from=available_from_ms // 1000,
        )

    start_ms, end_ms = history_before_window_ms(before_epoch_seconds, interval)
    if start_ms > end_ms:
        return HistoryPage(candles=[], available_from=available_from_ms // 1000)

    clamped_start_ms = max(start_ms, available_from_ms)
    candles = fetch_klines_paginated_sync(
        interval,
        clamped_start_ms,
        end_ms,
        now_ms=reference_ms,
        http_post=http_post,
    )
    return HistoryPage(
        candles=[candle for candle in candles if candle["time"] < before_epoch_seconds],
        history_unavailable=start_ms < available_from_ms,
        available_from=available_from_ms // 1000,
    )


def fetch_klines_daily_context_sync(
    interval: str,
    now_ms: int | None = None,
    http_post: Callable[..., httpx.Response] | None = None,
) -> list[NormalizedCandle]:
    reference_ms = now_ms if now_ms is not None else int(time.time() * 1000)
    calendar_start_ms, _ = daily_context_window_ms(reference_ms)
    start_ms, end_ms = context_fetch_window_ms(calendar_start_ms, reference_ms, interval)
    return fetch_klines_paginated_sync(
        interval,
        start_ms,
        end_ms,
        now_ms=reference_ms,
        http_post=http_post,
    )


def fetch_klines_weekly_context_sync(
    interval: str,
    now_ms: int | None = None,
    http_post: Callable[..., httpx.Response] | None = None,
) -> list[NormalizedCandle]:
    reference_ms = now_ms if now_ms is not None else int(time.time() * 1000)
    calendar_start_ms, _ = weekly_context_window_ms(reference_ms)
    start_ms, end_ms = context_fetch_window_ms(calendar_start_ms, reference_ms, interval)
    return fetch_klines_paginated_sync(
        interval,
        start_ms,
        end_ms,
        now_ms=reference_ms,
        http_post=http_post,
    )


def fetch_klines_monthly_context_sync(
    interval: str,
    now_ms: int | None = None,
    http_post: Callable[..., httpx.Response] | None = None,
) -> list[NormalizedCandle]:
    validate_monthly_context_interval(interval)
    reference_ms = now_ms if now_ms is not None else int(time.time() * 1000)
    calendar_start_ms, _ = monthly_context_window_ms(reference_ms)
    start_ms, end_ms = context_fetch_window_ms(calendar_start_ms, reference_ms, interval)
    return fetch_klines_paginated_sync(
        interval,
        start_ms,
        end_ms,
        now_ms=reference_ms,
        http_post=http_post,
    )


def fetch_klines_quarterly_context_sync(
    interval: str,
    now_ms: int | None = None,
    http_post: Callable[..., httpx.Response] | None = None,
) -> list[NormalizedCandle]:
    validate_quarterly_context_interval(interval)
    reference_ms = now_ms if now_ms is not None else int(time.time() * 1000)
    calendar_start_ms, _ = quarterly_context_window_ms(reference_ms)
    start_ms, end_ms = context_fetch_window_ms(calendar_start_ms, reference_ms, interval)
    return fetch_klines_paginated_sync(
        interval,
        start_ms,
        end_ms,
        now_ms=reference_ms,
        http_post=http_post,
    )


def fetch_klines_yearly_context_sync(
    interval: str,
    now_ms: int | None = None,
    http_post: Callable[..., httpx.Response] | None = None,
) -> list[NormalizedCandle]:
    validate_yearly_context_interval(interval)
    reference_ms = now_ms if now_ms is not None else int(time.time() * 1000)
    calendar_start_ms, _ = yearly_context_window_ms(reference_ms)
    start_ms, end_ms = context_fetch_window_ms(calendar_start_ms, reference_ms, interval)
    return fetch_klines_paginated_sync(
        interval,
        start_ms,
        end_ms,
        now_ms=reference_ms,
        http_post=http_post,
    )


def fetch_klines_sync(
    interval: str,
    limit: int,
    now_ms: int | None = None,
    http_post: Callable[..., httpx.Response] | None = None,
) -> list[NormalizedCandle]:
    reference_ms = now_ms if now_ms is not None else int(time.time() * 1000)
    safe_limit = clamp_limit(limit)
    start_ms = reference_ms - safe_limit * interval_duration_ms(interval)
    candles = fetch_klines_paginated_sync(
        interval,
        start_ms,
        reference_ms,
        now_ms=reference_ms,
        page_limit=safe_limit,
        http_post=http_post,
    )
    return candles[-safe_limit:]


def fetch_volume_profile_source_klines_sync(
    start_time: int,
    end_time: int,
    *,
    now_ms: int | None = None,
    http_post: Callable[..., httpx.Response] | None = None,
) -> tuple[str, list[NormalizedCandle]]:
    validate_volume_profile_time_range(start_time, end_time)
    source_interval = select_volume_profile_source_interval(start_time, end_time)
    start_ms = start_time * 1000
    end_ms = end_time * 1000 - 1
    reference_ms = now_ms if now_ms is not None else int(time.time() * 1000)

    candles = fetch_klines_paginated_sync(
        source_interval,
        start_ms,
        end_ms,
        now_ms=reference_ms,
        http_post=http_post,
    )
    return source_interval, [
        candle for candle in candles if start_time <= candle["time"] < end_time
    ]


@dataclass
class _UpstreamState:
    task: asyncio.Task[None]
    stop_event: asyncio.Event = field(default_factory=asyncio.Event)


class HyperliquidBtcKlineRelay:
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
            url = hyperliquid_ws_url()

            while not stop_event.is_set():
                if self._manager.connection_count(channel) == 0:
                    return

                try:
                    await self._consume_upstream(channel, url, interval, stop_event)
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
        interval: str,
        stop_event: asyncio.Event,
    ) -> None:
        connect = self._connect_ws or websockets.connect
        async with connect(url) as upstream:
            await upstream.send(json.dumps(subscription_payload(interval)))
            last_candle: NormalizedCandle | None = None

            while not stop_event.is_set():
                if self._manager.connection_count(channel) == 0:
                    return

                raw = await upstream.recv()
                if isinstance(raw, bytes):
                    raw = raw.decode()

                candle = parse_hyperliquid_ws_payload(str(raw))
                if candle is None or candle["interval"] != interval:
                    continue

                if last_candle is not None:
                    if candle["time"] < last_candle["time"]:
                        continue
                    if candle["time"] > last_candle["time"] and not last_candle["closed"]:
                        # The next interval opening proves the previous candle
                        # closed even if its final update was never delivered.
                        await self._manager.publish(
                            channel,
                            {**last_candle, "closed": True},
                        )

                await self._manager.publish(channel, candle)
                last_candle = candle


hyperliquid_kline_relay = HyperliquidBtcKlineRelay(ws_manager)
