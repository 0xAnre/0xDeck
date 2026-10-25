from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, TypedDict

from fastapi import HTTPException

SUPPORTED_INTERVALS = frozenset({"1m", "5m", "15m", "30m", "1h", "2h", "4h", "1d", "1w"})
DEFAULT_INTERVAL = "1m"
DEFAULT_LIMIT = 500
MIN_LIMIT = 1
MAX_LIMIT = 1000
MIN_INITIAL_HISTORY_BARS = 750

# Candle interval durations (milliseconds) shared by market providers.
INTERVAL_DURATION_MS: dict[str, int] = {
    "1m": 60_000,
    "5m": 5 * 60_000,
    "15m": 15 * 60_000,
    "30m": 30 * 60_000,
    "1h": 60 * 60_000,
    "2h": 2 * 60 * 60_000,
    "4h": 4 * 60 * 60_000,
    "1d": 24 * 60 * 60_000,
    "1w": 7 * 24 * 60 * 60_000,
}

HISTORY_BATCH_BARS = 500

VOLUME_PROFILE_SOURCE_INTERVALS: tuple[str, ...] = (
    "1m",
    "3m",
    "5m",
    "15m",
    "30m",
    "1h",
    "2h",
    "4h",
    "1d",
)
VOLUME_PROFILE_INTERVAL_DURATION_MS: dict[str, int] = {
    "1m": 60_000,
    "3m": 3 * 60_000,
    "5m": 5 * 60_000,
    "15m": 15 * 60_000,
    "30m": 30 * 60_000,
    "1h": 60 * 60_000,
    "2h": 2 * 60 * 60_000,
    "4h": 4 * 60 * 60_000,
    "1d": 24 * 60 * 60_000,
}
VOLUME_PROFILE_MAX_ESTIMATED_CANDLES = 5000
VOLUME_PROFILE_START_TIME_INVALID_DETAIL = (
    "Query parameter 'start_time' must be a positive Unix timestamp in seconds"
)
VOLUME_PROFILE_END_TIME_INVALID_DETAIL = (
    "Query parameter 'end_time' must be a positive Unix timestamp in seconds"
)
VOLUME_PROFILE_TIME_ORDER_INVALID_DETAIL = (
    "Query parameter 'end_time' must be greater than 'start_time'"
)
VOLUME_PROFILE_RANGE_TOO_LARGE_DETAIL = (
    "Time range is too large for volume profile source data at the maximum supported interval"
)
MONTHLY_CONTEXT_INTERVALS = frozenset({"4h", "1d"})
QUARTERLY_CONTEXT_INTERVALS = frozenset({"4h", "1d"})
YEARLY_CONTEXT_INTERVALS = frozenset({"1d", "1w"})


class NormalizedCandle(TypedDict):
    exchange: str
    symbol: str
    interval: str
    time: int
    open: float
    high: float
    low: float
    close: float
    volume: float
    closed: bool


@dataclass(frozen=True)
class HistoryPage:
    """One backward-history page plus provider availability metadata."""

    candles: list[NormalizedCandle]
    history_unavailable: bool = False
    available_from: int | None = None


def _parse_volume(value: Any) -> float:
    try:
        volume = float(value)
    except (TypeError, ValueError):
        raise ValueError("Invalid volume") from None
    if not math.isfinite(volume) or volume < 0:
        raise ValueError("Invalid volume")
    return volume


def validate_interval(interval: str) -> str:
    if interval not in SUPPORTED_INTERVALS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported interval '{interval}'. Allowed: {', '.join(sorted(SUPPORTED_INTERVALS))}",
        )
    return interval


def clamp_limit(limit: int) -> int:
    return max(MIN_LIMIT, min(limit, MAX_LIMIT))


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


def interval_duration_ms(interval: str) -> int:
    duration = INTERVAL_DURATION_MS.get(interval)
    if duration is None:
        raise ValueError(f"Unsupported interval '{interval}'")
    return duration


def volume_profile_interval_duration_ms(interval: str) -> int:
    duration = VOLUME_PROFILE_INTERVAL_DURATION_MS.get(interval)
    if duration is None:
        raise ValueError(f"Unsupported volume profile interval '{interval}'")
    return duration


def estimate_volume_profile_candle_count(
    start_time: int,
    end_time: int,
    interval: str,
) -> int:
    duration_ms = (end_time - start_time) * 1000
    if duration_ms <= 0:
        return 0
    interval_ms = volume_profile_interval_duration_ms(interval)
    return math.ceil(duration_ms / interval_ms)


def validate_volume_profile_time_range(start_time: int, end_time: int) -> tuple[int, int]:
    if start_time <= 0:
        raise HTTPException(status_code=400, detail=VOLUME_PROFILE_START_TIME_INVALID_DETAIL)
    if end_time <= 0:
        raise HTTPException(status_code=400, detail=VOLUME_PROFILE_END_TIME_INVALID_DETAIL)
    if end_time <= start_time:
        raise HTTPException(status_code=400, detail=VOLUME_PROFILE_TIME_ORDER_INVALID_DETAIL)
    return start_time, end_time


def select_volume_profile_source_interval(
    start_time: int,
    end_time: int,
    intervals: tuple[str, ...] = VOLUME_PROFILE_SOURCE_INTERVALS,
) -> str:
    """Pick the finest source interval that keeps the profile request legal.

    `intervals` is provider-aware: every provider passes the intervals it can
    actually serve as volume-profile source data, so the chosen interval is
    always serviceable (a duration exists for candle estimation and the
    provider can normalize that interval).
    """
    for interval in intervals:
        estimated = estimate_volume_profile_candle_count(start_time, end_time, interval)
        if estimated <= VOLUME_PROFILE_MAX_ESTIMATED_CANDLES:
            return interval
    raise HTTPException(status_code=400, detail=VOLUME_PROFILE_RANGE_TOO_LARGE_DETAIL)


def recent_history_start_ms(
    now_ms: int,
    interval: str,
    bar_count: int = MIN_INITIAL_HISTORY_BARS,
) -> int:
    return now_ms - bar_count * interval_duration_ms(interval)


def context_fetch_window_ms(
    calendar_start_ms: int,
    now_ms: int,
    interval: str,
) -> tuple[int, int]:
    """Earliest start needed for VWAP calendar context and minimum recent bar history."""
    start_ms = min(calendar_start_ms, recent_history_start_ms(now_ms, interval))
    return start_ms, now_ms


def utc_month_start_ms(epoch_ms: int) -> int:
    dt = datetime.fromtimestamp(epoch_ms / 1000, tz=timezone.utc)
    month_start = datetime(dt.year, dt.month, 1, tzinfo=timezone.utc)
    return int(month_start.timestamp() * 1000)


def previous_month_start_ms(epoch_ms: int) -> int:
    current_month_start = utc_month_start_ms(epoch_ms)
    dt = datetime.fromtimestamp(current_month_start / 1000, tz=timezone.utc)
    if dt.month == 1:
        previous = datetime(dt.year - 1, 12, 1, tzinfo=timezone.utc)
    else:
        previous = datetime(dt.year, dt.month - 1, 1, tzinfo=timezone.utc)
    return int(previous.timestamp() * 1000)


def monthly_context_window_ms(now_ms: int) -> tuple[int, int]:
    start_ms = previous_month_start_ms(now_ms)
    return start_ms, now_ms


def utc_quarter_start_ms(epoch_ms: int) -> int:
    dt = datetime.fromtimestamp(epoch_ms / 1000, tz=timezone.utc)
    quarter_month = ((dt.month - 1) // 3) * 3 + 1
    quarter_start = datetime(dt.year, quarter_month, 1, tzinfo=timezone.utc)
    return int(quarter_start.timestamp() * 1000)


def previous_quarter_start_ms(epoch_ms: int) -> int:
    current_quarter_start = utc_quarter_start_ms(epoch_ms)
    dt = datetime.fromtimestamp(current_quarter_start / 1000, tz=timezone.utc)
    if dt.month == 1:
        previous = datetime(dt.year - 1, 10, 1, tzinfo=timezone.utc)
    else:
        previous = datetime(dt.year, dt.month - 3, 1, tzinfo=timezone.utc)
    return int(previous.timestamp() * 1000)


def quarterly_context_window_ms(now_ms: int) -> tuple[int, int]:
    start_ms = previous_quarter_start_ms(now_ms)
    return start_ms, now_ms


def utc_year_start_ms(epoch_ms: int) -> int:
    dt = datetime.fromtimestamp(epoch_ms / 1000, tz=timezone.utc)
    year_start = datetime(dt.year, 1, 1, tzinfo=timezone.utc)
    return int(year_start.timestamp() * 1000)


def previous_year_start_ms(epoch_ms: int) -> int:
    dt = datetime.fromtimestamp(epoch_ms / 1000, tz=timezone.utc)
    previous = datetime(dt.year - 1, 1, 1, tzinfo=timezone.utc)
    return int(previous.timestamp() * 1000)


def yearly_context_window_ms(now_ms: int) -> tuple[int, int]:
    start_ms = previous_year_start_ms(now_ms)
    return start_ms, now_ms


def validate_monthly_context_interval(interval: str) -> str:
    if interval not in MONTHLY_CONTEXT_INTERVALS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Monthly VWAP context does not support interval '{interval}'. "
                f"Allowed: {', '.join(sorted(MONTHLY_CONTEXT_INTERVALS))}"
            ),
        )
    return interval


def validate_quarterly_context_interval(interval: str) -> str:
    if interval not in QUARTERLY_CONTEXT_INTERVALS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Quarterly VWAP context does not support interval '{interval}'. "
                f"Allowed: {', '.join(sorted(QUARTERLY_CONTEXT_INTERVALS))}"
            ),
        )
    return interval


def validate_yearly_context_interval(interval: str) -> str:
    if interval not in YEARLY_CONTEXT_INTERVALS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Yearly VWAP context does not support interval '{interval}'. "
                f"Allowed: {', '.join(sorted(YEARLY_CONTEXT_INTERVALS))}"
            ),
        )
    return interval


def history_before_window_ms(before_epoch_seconds: int, interval: str) -> tuple[int, int]:
    """`HISTORY_BATCH_BARS` ending immediately before `before` (exclusive)."""
    if before_epoch_seconds <= 0:
        raise ValueError("Invalid before timestamp")

    before_ms = before_epoch_seconds * 1000
    end_ms = before_ms - 1
    start_ms = before_ms - HISTORY_BATCH_BARS * interval_duration_ms(interval)
    return start_ms, end_ms


def validate_before_epoch_seconds(before: int) -> int:
    if before <= 0:
        raise HTTPException(
            status_code=400,
            detail="Query parameter 'before' must be a positive Unix timestamp in seconds",
        )
    return before
