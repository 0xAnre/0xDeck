# 0xDeck API

Local FastAPI + DuckDB service for Parquet folders.

## Setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python scripts/generate_sample.py
```

Sample file is written to `../data/sample/market_ticks.parquet`.

## Run

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 57342
```

## Set the data folder

1. Start backend (`uvicorn` above)
2. Start frontend (`npm run dev` at http://localhost:57341)
3. Open **Data source** → set Parquet folder to the absolute path of your data root
4. Save folder

## Dataset layout

Scans the folder for:

- Root-level `*.parquet` files (e.g. `data/sample/market_ticks.parquet`)
- **Streams** — each top-level subfolder with parquet files (`trades`, `prediction_price`, …)

Streams read all nested parquet via `subfolder/**/*.parquet`.

Folder path is stored in `backend/.canvas-state.json` (gitignored).

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Backend status + folder |
| GET/PUT | `/api/settings` | Read/write parquet folder |
| GET | `/api/datasets` | List datasets (files + streams) |
| GET | `/api/registry` | Streams with schema + sample rows |
| GET | `/api/datasets/{name}/schema` | Column names + types |
| GET | `/api/datasets/{name}/preview` | Row preview (`limit`, `range`) |
| GET | `/api/datasets/{name}/series` | Chart series (`limit`, `range`) |
| GET | `/api/datasets/{name}/kpi` | KPI aggregation (`metric`, `agg`, `range`) |

### Query parameters

**`range`** (preview, series, kpi): `15m | 1h | 6h | 24h | 7d | all`

Filter uses `max(timestamp) - range` on the dataset. Default: `all`.

**`kpi`**

| Param | Values |
|-------|--------|
| `metric` | Column name (required) |
| `agg` | `last`, `avg`, `sum`, `min`, `max`, `count`, `change` |
| `range` | Same as above; default `1h` |

Response: `{ value, row_count, as_of, metric_column, aggregation, range }`.

**`preview`**

| Param | Default |
|-------|---------|
| `limit` | 50 (max 500) |

**`series`**

| Param | Default |
|-------|---------|
| `limit` | 120 (max 1000) |

Auto-detects `x_column` (timestamp) and `y_column` (price/close/value).

## Performance note

Large streams (10k+ parquet files) can be slow on first query. Range filters require scanning recent timestamps.
