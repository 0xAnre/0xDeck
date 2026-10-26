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
| GET | `/api/market/binance/usdm/btcusdt/klines/volume-profile` | Source klines for fixed-range volume profile (`start_time`, `end_time` as Unix seconds; auto-picks finest Binance interval up to ~5000 candles) |
| GET | `/api/market/hyperliquid/btc/klines` | Latest Hyperliquid BTC perpetual klines (`interval`: `1m` … `1w`) |
| GET | `/api/market/hyperliquid/btc/klines/history` | Older Hyperliquid klines (`interval`, `before`); returns `history_unavailable: true` beyond the 5000-candle window |
| GET | `/api/market/hyperliquid/btc/klines/{daily,weekly,monthly,quarterly,yearly}-context` | Hyperliquid klines for the matching VWAP context window |
| GET | `/api/market/hyperliquid/btc/klines/volume-profile` | Hyperliquid source klines for fixed-range volume profile (`start_time`, `end_time`); source interval is provider-aware (may be `3m`) and the response carries `available_from` / `history_unavailable` when the range predates the 5000-candle window |
| GET | `/api/market/hyperliquid/account/{address}/position` | Read-only `clearinghouseState`; normalizes `positions` and the BTC `btc_position` (side, size, average entry). Invalid address → `422` |
| GET | `/api/market/hyperliquid/account/{address}/fills` | Most recent `userFills` (`count`, `truncated`, `complete`, `response_cap`); upstream cap is 2000 |
| GET | `/api/market/hyperliquid/account/{address}/fills/by-time` | `userFillsByTime` for `start_time` / `end_time` (epoch **milliseconds**), paged forward through the window. `truncated: true` means the 2000-per-response cap or page budget stopped the window early |
| WS | `/api/ws/{channel}` | WebSocket transport; Binance relays on `binance.usdm.btcusdt.kline.{interval}` and `binance.usdm.btcusdt.liquidations`, Hyperliquid relays on `hyperliquid.btc.kline.{interval}` and `hyperliquid.account.{address}.userfills` |

### WebSocket (`/api/ws/{channel}`)

Channel names: letters, digits, `.`, `_`, `-` (1–96 chars). Generic channels accept `ping` / `pong` only.

- **Binance BTC perpetual:** subscribe to `binance.usdm.btcusdt.kline.1m` (or `5m`, `15m`, `30m`, `1h`, `2h`, `4h`, `1d`, `1w`). The backend opens one shared upstream to Binance and relays normalized `event` payloads while at least one client is connected (`app/market/binance_usdm_btc.py`).
- **Binance USD-M BTCUSDT liquidations:** subscribe to `binance.usdm.btcusdt.liquidations` (no interval in the channel; aggregation to a candle interval is a frontend concern). One shared upstream `btcusdt@forceOrder` subscription per channel relays normalized `{ exchange: "binance", symbol: "BTCUSDT", side, price, quantity, notional, time, trade_time, id }` payloads (`app/market/binance_usdm_liquidations.py`). `SELL` orders map to `long` liquidations and `BUY` orders map to `short`; malformed, unknown-side and non-positive/non-finite events are dropped. Live-only: no REST backfill, and Binance `forceOrder` snapshots are not a complete market-wide liquidation total.
- **Hyperliquid BTC perpetual:** subscribe to `hyperliquid.btc.kline.1m` (same eight older intervals plus `1w`). The backend opens one shared upstream, sends a single `candle` subscription per channel, derives closed candles from the next interval open, and relays `{ exchange: "hyperliquid", symbol: "BTC", ... }` payloads (`app/market/hyperliquid_btc.py`). Duplicate client subscriptions reuse the same upstream.
- **Hyperliquid read-only account fills:** subscribe to `hyperliquid.account.0x<40 hex>.userfills`. One shared upstream `userFills` subscription per channel relays normalized `{ user, is_snapshot, fills }` payloads (`app/market/hyperliquid_account.py`); reconnect replays the snapshot and clients dedupe by `tid` (fallback `hash`+`oid`+`time`+`coin`).

Both providers implement the small interface in `app/market/providers.py`; shared calendar/history helpers live in `app/market/common.py`.

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
