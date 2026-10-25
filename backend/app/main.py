from __future__ import annotations

import time
from pathlib import Path

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from . import config, datasets
from .market.common import (
    DEFAULT_INTERVAL,
    DEFAULT_LIMIT,
    clamp_limit,
    validate_before_epoch_seconds,
    validate_interval,
    validate_volume_profile_time_range,
)
from .market import hyperliquid_account
from .market.providers import (
    BINANCE_PROVIDER,
    HYPERLIQUID_PROVIDER,
    MarketDataProvider,
    relay_for_channel,
)
from .ws import is_valid_channel, ws_manager

app = FastAPI(title="0xDeck API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:57341", "http://localhost:57341"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SettingsBody(BaseModel):
    parquet_folder: str = Field(min_length=1)


def require_folder() -> Path:
    folder = config.get_resolved_folder()
    if folder is None:
        raise HTTPException(status_code=400, detail="Parquet folder is not configured")
    return folder


def _klines_body(
    provider: MarketDataProvider,
    interval: str,
    candles: list,
    *,
    available_from: int | None = None,
    history_unavailable: bool = False,
) -> dict[str, object]:
    if available_from is None:
        available_from = provider.available_from_seconds(
            int(time.time() * 1000),
            interval,
        )
    return {
        "exchange": provider.exchange,
        "symbol": provider.symbol,
        "interval": interval,
        "candles": candles,
        "history_limit": provider.history_limit_candles,
        "available_from": available_from,
        "history_unavailable": history_unavailable,
    }


def _history_body(
    provider: MarketDataProvider,
    interval: str,
    before: int,
) -> dict[str, object]:
    page = provider.fetch_history_before_sync(interval, before)
    return _klines_body(
        provider,
        interval,
        page.candles,
        available_from=page.available_from,
        history_unavailable=page.history_unavailable,
    )


def _context_body(
    provider: MarketDataProvider,
    level: str,
    interval: str,
) -> dict[str, object]:
    candles = provider.fetch_context_sync(level, interval)
    return _klines_body(provider, interval, candles)


def _volume_profile_body_from(
    provider: MarketDataProvider,
    start_time: int,
    end_time: int,
    source_interval: str,
    candles: list,
) -> dict[str, object]:
    # Explicit availability metadata: a provider with a recent-history horizon
    # (Hyperliquid) reports the earliest source candle it can serve so the UI
    # can show "history unavailable / available from" instead of an empty
    # profile. Providers without a horizon report `null` / `false` (unchanged
    # Binance behaviour, additive fields only).
    available_from = provider.available_from_seconds(
        int(time.time() * 1000),
        source_interval,
    )
    history_unavailable = available_from is not None and start_time < available_from
    return {
        "exchange": provider.exchange,
        "symbol": provider.symbol,
        "start_time": start_time,
        "end_time": end_time,
        "source_interval": source_interval,
        "candles": candles,
        "history_limit": provider.history_limit_candles,
        "available_from": available_from,
        "history_unavailable": history_unavailable,
    }


def _volume_profile_body(
    provider: MarketDataProvider,
    start_time: int,
    end_time: int,
) -> dict[str, object]:
    source_interval, candles = provider.fetch_volume_profile_source_klines_sync(
        start_time,
        end_time,
    )
    return _volume_profile_body_from(
        provider,
        start_time,
        end_time,
        source_interval,
        candles,
    )


@app.websocket("/api/ws/{channel}")
async def websocket_channel(websocket: WebSocket, channel: str) -> None:
    if not is_valid_channel(channel):
        await websocket.close(code=1008, reason="Invalid channel")
        return

    if not await ws_manager.connect(channel, websocket):
        return

    relay = relay_for_channel(channel)
    if relay is not None:
        await relay.on_client_connected(channel)  # type: ignore[attr-defined]

    try:
        while True:
            text = await websocket.receive_text()
            await ws_manager.handle_client_text(channel, websocket, text)
    except WebSocketDisconnect:
        pass
    finally:
        ws_manager.disconnect(channel, websocket)
        if relay is not None:
            await relay.on_client_disconnected(channel)  # type: ignore[attr-defined]


def _binance_history(before: int, interval: str) -> dict[str, object]:
    safe_interval = validate_interval(interval)
    safe_before = validate_before_epoch_seconds(before)
    return _history_body(BINANCE_PROVIDER, safe_interval, safe_before)


# Every Binance route goes through `BINANCE_PROVIDER`, exactly like the
# Hyperliquid routes go through `HYPERLIQUID_PROVIDER`. A module-level import of
# a market fetcher here would bypass the provider seam: patching the provider in
# tests would not intercept the call, so the route would reach the live upstream
# (PR #141 backend CI failure).
def _binance_context(level: str, interval: str) -> dict[str, object]:
    safe_interval = validate_interval(interval)
    return _context_body(BINANCE_PROVIDER, level, safe_interval)


def _binance_volume_profile(start_time: int, end_time: int) -> dict[str, object]:
    safe_start, safe_end = validate_volume_profile_time_range(start_time, end_time)
    return _volume_profile_body(BINANCE_PROVIDER, safe_start, safe_end)


@app.get("/api/market/binance/usdm/btcusdt/klines/history")
def get_binance_usdm_btcusdt_klines_history(
    before: int,
    interval: str = DEFAULT_INTERVAL,
) -> dict[str, object]:
    return _binance_history(before, interval)


@app.get("/api/market/binance/usdm/btcusdt/klines/daily-context")
def get_binance_usdm_btcusdt_klines_daily_context(
    interval: str = DEFAULT_INTERVAL,
) -> dict[str, object]:
    return _binance_context("daily", interval)


@app.get("/api/market/binance/usdm/btcusdt/klines/weekly-context")
def get_binance_usdm_btcusdt_klines_weekly_context(
    interval: str = DEFAULT_INTERVAL,
) -> dict[str, object]:
    return _binance_context("weekly", interval)


@app.get("/api/market/binance/usdm/btcusdt/klines/monthly-context")
def get_binance_usdm_btcusdt_klines_monthly_context(
    interval: str = DEFAULT_INTERVAL,
) -> dict[str, object]:
    return _binance_context("monthly", interval)


@app.get("/api/market/binance/usdm/btcusdt/klines/quarterly-context")
def get_binance_usdm_btcusdt_klines_quarterly_context(
    interval: str = DEFAULT_INTERVAL,
) -> dict[str, object]:
    return _binance_context("quarterly", interval)


@app.get("/api/market/binance/usdm/btcusdt/klines/yearly-context")
def get_binance_usdm_btcusdt_klines_yearly_context(
    interval: str = DEFAULT_INTERVAL,
) -> dict[str, object]:
    return _binance_context("yearly", interval)


@app.get("/api/market/binance/usdm/btcusdt/klines/volume-profile")
def get_binance_usdm_btcusdt_klines_volume_profile(
    start_time: int,
    end_time: int,
) -> dict[str, object]:
    return _binance_volume_profile(start_time, end_time)


@app.get("/api/market/binance/usdm/btcusdt/klines")
def get_binance_usdm_btcusdt_klines(
    interval: str = DEFAULT_INTERVAL,
    limit: int = DEFAULT_LIMIT,
) -> dict[str, object]:
    safe_interval = validate_interval(interval)
    safe_limit = clamp_limit(limit)
    candles = BINANCE_PROVIDER.fetch_klines_sync(safe_interval, safe_limit)
    return _klines_body(BINANCE_PROVIDER, safe_interval, candles)


def _hyperliquid_history(before: int, interval: str) -> dict[str, object]:
    safe_interval = validate_interval(interval)
    safe_before = validate_before_epoch_seconds(before)
    return _history_body(HYPERLIQUID_PROVIDER, safe_interval, safe_before)


def _hyperliquid_context(level: str, interval: str) -> dict[str, object]:
    safe_interval = validate_interval(interval)
    return _context_body(HYPERLIQUID_PROVIDER, level, safe_interval)


def _hyperliquid_volume_profile(start_time: int, end_time: int) -> dict[str, object]:
    safe_start, safe_end = validate_volume_profile_time_range(start_time, end_time)
    return _volume_profile_body(HYPERLIQUID_PROVIDER, safe_start, safe_end)


@app.get("/api/market/hyperliquid/btc/klines/history")
def get_hyperliquid_btc_klines_history(
    before: int,
    interval: str = DEFAULT_INTERVAL,
) -> dict[str, object]:
    return _hyperliquid_history(before, interval)


@app.get("/api/market/hyperliquid/btc/klines/daily-context")
def get_hyperliquid_btc_klines_daily_context(
    interval: str = DEFAULT_INTERVAL,
) -> dict[str, object]:
    return _hyperliquid_context("daily", interval)


@app.get("/api/market/hyperliquid/btc/klines/weekly-context")
def get_hyperliquid_btc_klines_weekly_context(
    interval: str = DEFAULT_INTERVAL,
) -> dict[str, object]:
    return _hyperliquid_context("weekly", interval)


@app.get("/api/market/hyperliquid/btc/klines/monthly-context")
def get_hyperliquid_btc_klines_monthly_context(
    interval: str = DEFAULT_INTERVAL,
) -> dict[str, object]:
    return _hyperliquid_context("monthly", interval)


@app.get("/api/market/hyperliquid/btc/klines/quarterly-context")
def get_hyperliquid_btc_klines_quarterly_context(
    interval: str = DEFAULT_INTERVAL,
) -> dict[str, object]:
    return _hyperliquid_context("quarterly", interval)


@app.get("/api/market/hyperliquid/btc/klines/yearly-context")
def get_hyperliquid_btc_klines_yearly_context(
    interval: str = DEFAULT_INTERVAL,
) -> dict[str, object]:
    return _hyperliquid_context("yearly", interval)


@app.get("/api/market/hyperliquid/btc/klines/volume-profile")
def get_hyperliquid_btc_klines_volume_profile(
    start_time: int,
    end_time: int,
) -> dict[str, object]:
    return _hyperliquid_volume_profile(start_time, end_time)


@app.get("/api/market/hyperliquid/btc/klines")
def get_hyperliquid_btc_klines(
    interval: str = DEFAULT_INTERVAL,
    limit: int = DEFAULT_LIMIT,
) -> dict[str, object]:
    safe_interval = validate_interval(interval)
    safe_limit = clamp_limit(limit)
    candles = HYPERLIQUID_PROVIDER.fetch_klines_sync(safe_interval, safe_limit)
    return _klines_body(HYPERLIQUID_PROVIDER, safe_interval, candles)


# Read-only Hyperliquid account data. These routes are deliberately separate
# from the candle provider seam: positions/fills are account concerns, not
# market-data concerns. `hyperliquid_account._post_info` is the patchable
# upstream seam for hermetic tests.
@app.get("/api/market/hyperliquid/account/{address}/position")
def get_hyperliquid_account_position(address: str) -> dict[str, object]:
    return hyperliquid_account.fetch_clearinghouse_state_sync(address)


@app.get("/api/market/hyperliquid/account/{address}/fills")
def get_hyperliquid_account_fills(address: str) -> dict[str, object]:
    return hyperliquid_account.fetch_user_fills_sync(address)


@app.get("/api/market/hyperliquid/account/{address}/fills/by-time")
def get_hyperliquid_account_fills_by_time(
    address: str,
    start_time: int,
    end_time: int,
) -> dict[str, object]:
    return hyperliquid_account.fetch_user_fills_by_time_sync(
        address,
        start_time,
        end_time,
    )


@app.get("/api/health")
def health() -> dict[str, str]:
    folder = config.get_resolved_folder()
    return {
        "status": "ok",
        "parquet_folder": str(folder) if folder else "",
    }


@app.get("/api/settings")
def get_settings() -> dict[str, str | bool]:
    folder = config.get_resolved_folder()
    return {
        "parquet_folder": config.load_parquet_folder() or "",
        "folder_ready": folder is not None,
    }


@app.put("/api/settings")
def put_settings(body: SettingsBody) -> dict[str, str | bool]:
    path = Path(body.parquet_folder).expanduser()
    if not path.is_dir():
        raise HTTPException(status_code=400, detail="Folder does not exist")
    saved = config.save_parquet_folder(body.parquet_folder)
    return {"parquet_folder": str(saved), "folder_ready": True}


@app.get("/api/datasets")
def get_datasets() -> dict[str, object]:
    folder = require_folder()
    return {"datasets": datasets.list_datasets(folder)}


@app.get("/api/registry")
def get_registry() -> dict[str, object]:
    folder = require_folder()
    return {"registry": datasets.dataset_registry(folder)}


@app.get("/api/datasets/{name}/schema")
def get_dataset_schema(name: str) -> dict[str, object]:
    folder = require_folder()
    try:
        target = datasets.resolve_dataset(folder, name)
        return {"name": name, "schema": datasets.dataset_schema(target)}
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/datasets/{name}/preview")
def get_dataset_preview(name: str, limit: int = 50, range: str = "all") -> dict[str, object]:
    folder = require_folder()
    safe_limit = max(1, min(limit, 500))
    safe_range = datasets.normalize_time_range(range)
    try:
        target = datasets.resolve_dataset(folder, name)
        preview = datasets.dataset_preview(target, safe_limit, safe_range)
        return {"name": name, **preview}
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/datasets/{name}/series")
def get_dataset_series(name: str, limit: int = 120, range: str = "all") -> dict[str, object]:
    folder = require_folder()
    safe_limit = max(1, min(limit, 1000))
    safe_range = datasets.normalize_time_range(range)
    try:
        target = datasets.resolve_dataset(folder, name)
        columns = datasets.guess_chart_columns(target)
        if columns is None:
            raise HTTPException(status_code=400, detail="Could not infer chart columns")
        x_column, y_column = columns
        points = datasets.dataset_series(target, x_column, y_column, safe_limit, safe_range)
        return {
            "name": name,
            "x_column": x_column,
            "y_column": y_column,
            "points": points,
        }
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/datasets/{name}/kpi")
def get_dataset_kpi(
    name: str,
    metric: str,
    agg: str = "last",
    range: str = "1h",
) -> dict[str, object]:
    folder = require_folder()
    safe_agg = datasets.normalize_aggregation(agg)
    safe_range = datasets.normalize_time_range(range)
    if not metric.strip():
        raise HTTPException(status_code=400, detail="Metric column is required")
    try:
        target = datasets.resolve_dataset(folder, name)
        return datasets.dataset_kpi(target, metric, safe_agg, safe_range)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
