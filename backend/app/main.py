from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import config, datasets

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
