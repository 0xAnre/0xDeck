from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from . import config, datasets
from .market.binance_usdm_btc import (
    DEFAULT_INTERVAL,
    DEFAULT_LIMIT,
    binance_kline_relay,
    clamp_limit,
    fetch_klines_daily_context_sync,
    fetch_klines_history_before_sync,
    fetch_klines_monthly_context_sync,
    fetch_klines_quarterly_context_sync,
    fetch_klines_weekly_context_sync,
    fetch_klines_yearly_context_sync,
    fetch_klines_sync,
    validate_before_epoch_seconds,
    validate_interval,
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


@app.websocket("/api/ws/{channel}")
async def websocket_channel(websocket: WebSocket, channel: str) -> None:
    if not is_valid_channel(channel):
        await websocket.close(code=1008, reason="Invalid channel")
        return

    if not await ws_manager.connect(channel, websocket):
        return

    await binance_kline_relay.on_client_connected(channel)

    try:
        while True:
            text = await websocket.receive_text()
            await ws_manager.handle_client_text(channel, websocket, text)
    except WebSocketDisconnect:
        pass
    finally:
        ws_manager.disconnect(channel, websocket)
        await binance_kline_relay.on_client_disconnected(channel)


@app.get("/api/market/binance/usdm/btcusdt/klines/history")
def get_binance_usdm_btcusdt_klines_history(
    before: int,
    interval: str = DEFAULT_INTERVAL,
) -> dict[str, object]:
    safe_interval = validate_interval(interval)
    safe_before = validate_before_epoch_seconds(before)
    candles = fetch_klines_history_before_sync(safe_interval, safe_before)
    return {
        "symbol": "BTCUSDT",
        "interval": safe_interval,
        "candles": candles,
    }


@app.get("/api/market/binance/usdm/btcusdt/klines/daily-context")
def get_binance_usdm_btcusdt_klines_daily_context(
    interval: str = DEFAULT_INTERVAL,
) -> dict[str, object]:
    safe_interval = validate_interval(interval)
    candles = fetch_klines_daily_context_sync(safe_interval)
    return {
        "symbol": "BTCUSDT",
        "interval": safe_interval,
        "candles": candles,
    }


@app.get("/api/market/binance/usdm/btcusdt/klines/weekly-context")
def get_binance_usdm_btcusdt_klines_weekly_context(
    interval: str = DEFAULT_INTERVAL,
) -> dict[str, object]:
    safe_interval = validate_interval(interval)
    candles = fetch_klines_weekly_context_sync(safe_interval)
    return {
        "symbol": "BTCUSDT",
        "interval": safe_interval,
        "candles": candles,
    }


@app.get("/api/market/binance/usdm/btcusdt/klines/monthly-context")
def get_binance_usdm_btcusdt_klines_monthly_context(
    interval: str = DEFAULT_INTERVAL,
) -> dict[str, object]:
    safe_interval = validate_interval(interval)
    candles = fetch_klines_monthly_context_sync(safe_interval)
    return {
        "symbol": "BTCUSDT",
        "interval": safe_interval,
        "candles": candles,
    }


@app.get("/api/market/binance/usdm/btcusdt/klines/quarterly-context")
def get_binance_usdm_btcusdt_klines_quarterly_context(
    interval: str = DEFAULT_INTERVAL,
) -> dict[str, object]:
    safe_interval = validate_interval(interval)
    candles = fetch_klines_quarterly_context_sync(safe_interval)
    return {
        "symbol": "BTCUSDT",
        "interval": safe_interval,
        "candles": candles,
    }


@app.get("/api/market/binance/usdm/btcusdt/klines/yearly-context")
def get_binance_usdm_btcusdt_klines_yearly_context(
    interval: str = DEFAULT_INTERVAL,
) -> dict[str, object]:
    safe_interval = validate_interval(interval)
    candles = fetch_klines_yearly_context_sync(safe_interval)
    return {
        "symbol": "BTCUSDT",
        "interval": safe_interval,
        "candles": candles,
    }


@app.get("/api/market/binance/usdm/btcusdt/klines")
def get_binance_usdm_btcusdt_klines(
    interval: str = DEFAULT_INTERVAL,
    limit: int = DEFAULT_LIMIT,
) -> dict[str, object]:
    safe_interval = validate_interval(interval)
    safe_limit = clamp_limit(limit)
    candles = fetch_klines_sync(safe_interval, safe_limit)
    return {
        "symbol": "BTCUSDT",
        "interval": safe_interval,
        "candles": candles,
    }


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
