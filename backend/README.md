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
| GET | `/api/market/binance/usdm/btcusdt/klines` | Latest BTCUSDT perpetual klines (`interval`: `1m` … `1w`) |
| GET | `/api/market/binance/usdm/btcusdt/klines/history` | Older klines before a timestamp (`interval`, `before`) |
| GET | `/api/market/binance/usdm/btcusdt/klines/daily-context` | Intraday klines for daily VWAP window |
| GET | `/api/market/binance/usdm/btcusdt/klines/weekly-context` | Klines for weekly VWAP window |
| GET | `/api/market/binance/usdm/btcusdt/klines/monthly-context` | Klines for monthly VWAP (`4h`, `1d`) |
| GET | `/api/market/binance/usdm/btcusdt/klines/quarterly-context` | Klines for quarterly VWAP (`4h`, `1d`) |
| GET | `/api/market/binance/usdm/btcusdt/klines/yearly-context` | Klines for yearly VWAP (`1d`, `1w`) |
| GET | `/api/market/binance/usdm/btcusdt/klines/volume-profile` | Source klines for fixed-range volume profile (`start_time`, `end_time` ms; auto-picks finest Binance interval up to ~5000 candles) |
| WS | `/api/ws/{channel}` | WebSocket transport; Binance BTC kline relay on `binance.usdm.btcusdt.kline.{interval}` |

### WebSocket (`/api/ws/{channel}`)

Channel names: letters, digits, `.`, `_`, `-` (1–64 chars). Generic channels accept `ping` / `pong` only. **Binance BTC perpetual:** subscribe to `binance.usdm.btcusdt.kline.1m` (or `5m`, `30m`, `1h`, `2h`, `4h`, `1d`, `1w`). The backend opens a shared upstream to Binance and relays normalized `event` payloads while at least one client is connected (`app/market/binance_usdm_btc.py`).

**Server → client** (every message includes `type`, `channel`, `timestamp` UTC ISO):

| `type` | Extra fields |
|--------|----------------|
| `connected` | — |
| `event` | `payload` (any JSON) |
| `pong` | — |
| `error` | `message` |

**Client → server:**

| `type` | Purpose |
|--------|---------|
| `ping` | Server replies with `pong` |

Invalid JSON or unsupported client messages receive an `error` message. Implementation: `app/ws.py` (`WebSocketChannelManager`, `publish(channel, payload)` for future use).

Frontend dev: Vite (`57341`) proxies `/api` WebSocket upgrades to this backend (`57342`).

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
