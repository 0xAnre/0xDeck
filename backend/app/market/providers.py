from __future__ import annotations

from typing import Protocol

from . import binance_usdm_btc as binance
from . import binance_usdm_liquidations
from . import hyperliquid_account
from . import hyperliquid_btc as hyperliquid
from .common import (
    VOLUME_PROFILE_SOURCE_INTERVALS,
    HistoryPage,
    NormalizedCandle,
    validate_interval,
)


class MarketDataProvider(Protocol):
    """The small surface every BTC-perp market-data provider implements."""

    exchange: str
    symbol: str
    history_limit_candles: int | None
    # Provider-aware FRVP source intervals: only intervals this provider can
    # serve end to end (duration + kline normalization).
    volume_profile_source_intervals: tuple[str, ...]

    def validate_interval(self, interval: str) -> str: ...
    def channel_for_interval(self, interval: str) -> str: ...
    def parse_channel_interval(self, channel: str) -> str | None: ...
    def available_from_seconds(self, now_ms: int, interval: str) -> int | None: ...
    def fetch_klines_sync(self, interval: str, limit: int) -> list[NormalizedCandle]: ...
    def fetch_history_before_sync(
        self,
        interval: str,
        before_epoch_seconds: int,
    ) -> HistoryPage: ...
    def fetch_context_sync(
        self,
        level: str,
        interval: str,
    ) -> list[NormalizedCandle]: ...
    def fetch_volume_profile_source_klines_sync(
        self,
        start_time: int,
        end_time: int,
    ) -> tuple[str, list[NormalizedCandle]]: ...
    @property
    def relay(self) -> object: ...


class BinanceUsdmBtcProvider:
    exchange = "binance"
    symbol = binance.SYMBOL
    history_limit_candles: int | None = None
    volume_profile_source_intervals: tuple[str, ...] = VOLUME_PROFILE_SOURCE_INTERVALS

    def validate_interval(self, interval: str) -> str:
        return binance.validate_interval(interval)

    def channel_for_interval(self, interval: str) -> str:
        return binance.channel_for_interval(interval)

    def parse_channel_interval(self, channel: str) -> str | None:
        return binance.parse_channel_interval(channel)

    def available_from_seconds(self, now_ms: int, interval: str) -> int | None:
        return None

    def fetch_klines_sync(self, interval: str, limit: int) -> list[NormalizedCandle]:
        return binance.fetch_klines_sync(interval, limit)

    def fetch_history_before_sync(
        self,
        interval: str,
        before_epoch_seconds: int,
    ) -> HistoryPage:
        return HistoryPage(
            candles=binance.fetch_klines_history_before_sync(
                interval,
                before_epoch_seconds,
            )
        )

    def fetch_context_sync(
        self,
        level: str,
        interval: str,
    ) -> list[NormalizedCandle]:
        return _fetch_binance_context(level, interval)

    def fetch_volume_profile_source_klines_sync(
        self,
        start_time: int,
        end_time: int,
    ) -> tuple[str, list[NormalizedCandle]]:
        return binance.fetch_volume_profile_source_klines_sync(start_time, end_time)

    @property
    def relay(self) -> object:
        return binance.binance_kline_relay


class HyperliquidBtcProvider:
    exchange = "hyperliquid"
    symbol = hyperliquid.SYMBOL
    history_limit_candles: int | None = hyperliquid.HYPERLIQUID_HISTORY_LIMIT_CANDLES
    volume_profile_source_intervals: tuple[str, ...] = (
        hyperliquid.HYPERLIQUID_VOLUME_PROFILE_SOURCE_INTERVALS
    )

    def validate_interval(self, interval: str) -> str:
        return validate_interval(interval)

    def channel_for_interval(self, interval: str) -> str:
        return hyperliquid.channel_for_interval(interval)

    def parse_channel_interval(self, channel: str) -> str | None:
        return hyperliquid.parse_channel_interval(channel)

    def available_from_seconds(self, now_ms: int, interval: str) -> int | None:
        return hyperliquid.history_available_from_seconds(now_ms, interval)

    def fetch_klines_sync(self, interval: str, limit: int) -> list[NormalizedCandle]:
        return hyperliquid.fetch_klines_sync(interval, limit)

    def fetch_history_before_sync(
        self,
        interval: str,
        before_epoch_seconds: int,
    ) -> HistoryPage:
        return hyperliquid.fetch_klines_history_before_sync(interval, before_epoch_seconds)

    def fetch_context_sync(
        self,
        level: str,
        interval: str,
    ) -> list[NormalizedCandle]:
        return _fetch_hyperliquid_context(level, interval)

    def fetch_volume_profile_source_klines_sync(
        self,
        start_time: int,
        end_time: int,
    ) -> tuple[str, list[NormalizedCandle]]:
        return hyperliquid.fetch_volume_profile_source_klines_sync(start_time, end_time)

    @property
    def relay(self) -> object:
        return hyperliquid.hyperliquid_kline_relay


def _fetch_binance_context(level: str, interval: str) -> list[NormalizedCandle]:
    fetchers = {
        "daily": binance.fetch_klines_daily_context_sync,
        "weekly": binance.fetch_klines_weekly_context_sync,
        "monthly": binance.fetch_klines_monthly_context_sync,
        "quarterly": binance.fetch_klines_quarterly_context_sync,
        "yearly": binance.fetch_klines_yearly_context_sync,
    }
    fetcher = fetchers.get(level)
    if fetcher is None:
        raise ValueError(f"Unsupported VWAP context level '{level}'")
    return fetcher(interval)


def _fetch_hyperliquid_context(level: str, interval: str) -> list[NormalizedCandle]:
    fetchers = {
        "daily": hyperliquid.fetch_klines_daily_context_sync,
        "weekly": hyperliquid.fetch_klines_weekly_context_sync,
        "monthly": hyperliquid.fetch_klines_monthly_context_sync,
        "quarterly": hyperliquid.fetch_klines_quarterly_context_sync,
        "yearly": hyperliquid.fetch_klines_yearly_context_sync,
    }
    fetcher = fetchers.get(level)
    if fetcher is None:
        raise ValueError(f"Unsupported VWAP context level '{level}'")
    return fetcher(interval)


BINANCE_PROVIDER = BinanceUsdmBtcProvider()
HYPERLIQUID_PROVIDER = HyperliquidBtcProvider()

MARKET_PROVIDERS: dict[str, MarketDataProvider] = {
    BINANCE_PROVIDER.exchange: BINANCE_PROVIDER,
    HYPERLIQUID_PROVIDER.exchange: HYPERLIQUID_PROVIDER,
}


def provider_for_exchange(exchange: str) -> MarketDataProvider:
    provider = MARKET_PROVIDERS.get(exchange)
    if provider is None:
        raise ValueError(f"Unsupported exchange '{exchange}'")
    return provider


def provider_for_channel(channel: str) -> MarketDataProvider | None:
    for provider in MARKET_PROVIDERS.values():
        if provider.parse_channel_interval(channel) is not None:
            return provider
    return None


def relay_for_channel(channel: str) -> object | None:
    provider = provider_for_channel(channel)
    if provider is not None:
        return provider.relay
    # Account channels are not candle channels, so they are not part of the
    # candle provider protocol; route them to the dedicated account relay.
    if hyperliquid_account.parse_account_user_fills_channel(channel) is not None:
        return hyperliquid_account.hyperliquid_user_fills_relay
    # Liquidation order flow is also not a candle channel; route it to the
    # dedicated forceOrder relay without widening the provider protocol.
    if binance_usdm_liquidations.parse_liquidations_channel(channel) is not None:
        return binance_usdm_liquidations.binance_liquidations_relay
    return None
