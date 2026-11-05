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
| GET | `/api/market/binance/usdm/btcusdt/liquidations/history` | Persisted normalized `forceOrder` liquidations, newest first (`before` optional epoch-ms cursor, `limit` 1–1000 default 500; returns `events`, `has_more`, `next_before`) |
| GET | `/api/market/binance/usdm/btcusdt/liquidations/buckets` | Pre-aggregated liquidation buckets for one chart interval (`interval` `1m`…`1w`, `from`/`to` epoch-ms half-open; returns `buckets: [{ time, long, short }]`, `truncated`; rejects ranges over 20,000 bucket slots with `400`) |
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
- **Binance USD-M BTCUSDT liquidations:** subscribe to `binance.usdm.btcusdt.liquidations` (no interval in the channel; aggregation to a candle interval is a frontend concern). One process-lifetime upstream `btcusdt@forceOrder` subscription relays normalized `{ exchange: "binance", symbol: "BTCUSDT", side, price, quantity, notional, time, trade_time, id }` payloads (`app/market/binance_usdm_liquidations.py`). Each normalized event is persisted before it is published, so reconnecting or reloading a chart can load stored history. `SELL` orders map to `long` liquidations and `BUY` orders map to `short`; malformed, unknown-side and non-positive/non-finite events are dropped. There is no REST backfill before collection started, and Binance `forceOrder` snapshots are not a complete market-wide liquidation total.
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

### Persistent liquidation history (SQLite)

Liquidation collection starts when the backend process starts, even with no chart clients connected, and stops at shutdown. Disconnecting the last chart does not stop it. Stored history begins with the first run of the backend that had collection enabled, or with the earliest row a backfill import wrote: there is no fabricated data and no upstream REST backfill.

- Database file: `backend/.liquidations.sqlite3` (gitignored, WAL mode). Override with `OXDECK_LIQUIDATIONS_DB=/absolute/path.sqlite3`.
- Schema (`liquidation_events`): `id` (stable normalized event id, primary key), `trade_time`, `event_time`, `side`, `price`, `quantity`, `notional`, `exchange`, `symbol`, `created_at`, `source`, `order_price`; index on `(trade_time DESC, id DESC)` for pagination.
- `source` is `live` for rows the collector writes and `import` for rows the parquet importer writes. `order_price` keeps the source's order price for imported rows and is `NULL` on live rows.
- The schema is migrated additively: opening the store adds any missing column (`source TEXT NOT NULL DEFAULT 'live'`, `order_price REAL`) and is idempotent, so an existing database keeps working and its rows stay `source = 'live'`.
- Writes use `INSERT OR IGNORE`, so replaying the same Binance snapshot never creates a second row.
- `GET /api/market/binance/usdm/btcusdt/liquidations/history?before=<epoch_ms>&before_id=<id>&limit=<n>` reads newest first. `before` is an exclusive epoch-millisecond cursor and `limit` is 1–1000 (default 500). Pass `before_id` together with `before` to page with a `(trade_time, id)` keyset, which is the only way to page through several events that share one `trade_time` without losing the tail of the group; `before` alone keeps the historical timestamp-only cursor and is unchanged for existing callers. `before_id` requires `before`. The response is `{ exchange: "binance", symbol: "BTCUSDT", events: [...], has_more: bool, next_before: int | null, next_before_id: string | null }`, where `events` are the same normalized objects the WebSocket relays and both cursor halves are null when there is no further page.
- `GET /api/market/binance/usdm/btcusdt/liquidations/buckets?interval=<interval>&from=<epoch_ms>&to=<epoch_ms>` serves the same events pre-aggregated for one chart interval. `interval` is `1m`, `5m`, `15m`, `30m`, `1h`, `2h`, `4h`, `1d` or `1w`; `from` is inclusive and `to` exclusive. The response is `{ exchange: "binance", symbol: "BTCUSDT", interval, buckets: [{ time, long, short }], truncated }`, where `time` is the bucket open in Unix **seconds** (identical to the frontend's `liquidationBucketTime`, including the Monday epoch offset for `1w`) and `long`/`short` are summed positive USD notionals. Only non-empty buckets are returned, ascending by `time`; gaps stay gaps and are not filled.
- The buckets route is one SQL `GROUP BY trade_time / interval` over the `trade_time` range. There is **no bucket table**, no materialization and no schema change: the response is computed from the event rows on every read, so a live or imported event is visible to the next request with no invalidation step. A range covering at least half of the stored span is read with a sequential table scan (`NOT INDEXED`); per-event index probing is measurably slower there, and the result is identical because the `trade_time` filter is unchanged.
- Bucket times and side attribution are identical to the frontend's `bucketAggregatedLiquidationEvents`; the summed notionals can differ only in the last bits from floating-point summation order (measured max relative difference `2.7e-15` over 127k rows). The normative parity check is the event-level total: `sum(long) + sum(short)` over the range equals the sum over the underlying events.
- Guard rails: `from`/`to` must be positive epoch milliseconds with `from < to`; an unknown interval, an invalid timestamp, or a range spanning more than `20_000` bucket slots is rejected with `400` (non-integer query values are `422` from FastAPI). Because the range is rejected rather than silently narrowed, a `200` always covers the requested range, and `truncated` is `false` on every successful response today. It stays in the contract so a future looser cap can signal a partial response without a breaking change.
- The frontend switches by interval: `30m` and above read this endpoint once for the loaded candle range and refresh the same request every 15 s so the live bucket stays current, while `15m` and below keep the paged `liquidations/history` events path so the newest events stay per-event accurate. A request whose loaded range exceeds the 20,000-slot cap is narrowed client-side to its newest slots, and both that case and a page-capped event walk show an explicit coverage notice instead of leaving silent gaps.
- Measured on a 127,459-event / 137-day database (9-day real archive + synthetic backfill): `1h` returns 3,289 buckets in a 196,198-byte (191.6 KiB) response, the bucket query p95 is 102 ms CPU / 111 ms wall and the HTTP route p95 is 126 ms over 60 runs on a shared 2-vCPU VPS (load average ~6); `4h` and `1d` responses are 48.7 KiB and 8.5 KiB. The old 12-page event walk covered only 72 `4h` / 13 `1d` buckets (~12 days) of the same database, while the bucket route covers 823 / 138 buckets (~137 days).
- Tests set `OXDECK_DISABLE_LIQUIDATION_COLLECTOR=1`; the collector also accepts an injected `connect_ws` and store, so backend tests never open a real upstream socket.

### Historical backfill (parquet import)

The collector cannot reach back before it started, but the same Binance `forceOrder` feed was recorded to immutable parquet by a separate recorder. `backend/scripts/import_liquidation_parquet.py` turns those files into rows of the same table, keeping live collection untouched.

```bash
cd backend
# read everything, write nothing
python scripts/import_liquidation_parquet.py \
  --path /root/Pargali-Ibrahim-Library/data/liquidations --dry-run

# import (the database is copied first: <db>.bak-<UTC timestamp>)
python scripts/import_liquidation_parquet.py \
  --path /root/Pargali-Ibrahim-Library/data/liquidations
```

- `--path` is repeatable and accepts a directory (searched recursively for `*.parquet`), a glob, or a single file, so the same command serves several archives.
- `--db` targets a specific database (defaults to `OXDECK_LIQUIDATIONS_DB` or `backend/.liquidations.sqlite3`). `--dry-run`, `--backup` / `--no-backup` and `--batch-size` control the run.
- Source files are only read. The database is snapshotted with SQLite's backup API before the first write.
- Column mapping: `event_time = timestamp` (Binance event time `E` in **milliseconds**), `price = avg_price` (the real fill price, matching live rows), `order_price = price` (the source's `o.p`, kept for provenance), `quantity = filled_qty`, `notional = avg_price * filled_qty`, `side` `SELL → long` / `BUY → short`, `source = 'import'`.
- **`trade_time = event_time`**: that recorder never persisted Binance's `o.T`, so an imported row's trade time is its event time (roughly 1 s late). `trade_time` stays the pagination and ordering key, so imported history pages exactly like live history; only the sub-second ordering is approximate.
- Imported ids live in the `import|binance|BTCUSDT|…` namespace and can never collide with live ids (`binance|BTCUSDT|…`).
- Duplicates collapse at import time on `(event_time, side, price, quantity)`, and rows whose content already exists are counted as *already present* and skipped, so a re-run inserts 0 rows. There is deliberately **no global UNIQUE constraint**: live and imported rows may legitimately repeat a timestamp, and a constraint would reject real live events.
- The report prints files read, rows read, duplicates folded, invalid rows, already present, inserted, the source range, row counts before/after, the number of duplicate content keys in the whole table and elapsed time. `rows read = duplicates folded + invalid rows + already present + inserted` always holds; the script exits non-zero if it does not.
- Two guards turn silent success into failure: an archive where **every** row is rejected (schema drift, wrong timestamp unit, another symbol) is reported as an error and exits non-zero, and a post-import scan that finds duplicate `(event_time, side, price, quantity)` rows in the table prints a warning and exits non-zero. An unreadable source (a missing required column, a corrupt file) is reported as `import failed: …` rather than a traceback.
- Invalid rows (unknown side, non-BTCUSDT symbol, non-positive or non-finite price/quantity, non-millisecond timestamps) are counted and skipped, never fatal.

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
