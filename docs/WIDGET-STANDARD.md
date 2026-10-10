# Widget Standard (normative)

Rules for adding a widget to 0xDeck. For step-by-step wiring, see [WIDGET-GUIDE.md](./WIDGET-GUIDE.md). For a copy-paste starting point, see [../templates/widget/README.md](../templates/widget/README.md).

---

## WidgetDefinition

Every template is one entry in `src/widgets/registry/definitions.tsx` with these fields:

| Field | Requirement |
|-------|-------------|
| `id` | Stable template id (kebab-case); used as instance id prefix |
| `title` | Widgets menu label |
| `description` | Short hint in catalog / docs |
| `component` | React body implementing `WidgetInstanceProps` |
| `grid` | Default position and **minimum** size (`minW`, `minH`); also default open size |
| `headerSettings` | Which header controls this widget supports (see below) |
| `stateScope` | `'instance'` or `'workspace'` |
| `data` | Data mode metadata (see below); does not fetch by itself |

---

## Identity and instances

- **`id`** is the template id only (e.g. `chart`, `my-tool`).
- **Runtime instance id** = `{templateId}-{randomSuffix}` (see `createPanelInstance()` in `panels.ts`).
- **Per-instance state** (dataset, range, KPI config, layout slot) is keyed by **`panelId`** (the instance id).
- Use **`stateScope: 'workspace'`** only when state is intentionally shared across all instances (e.g. Notes workspace). Default is **`'instance'`**.

---

## Layout

- `grid` defines default placement and minimum dimensions on the lg grid (36 columns).
- The widget **body must not** render the outer Card, title bar, close button, drag handle, or resize chrome — `App.tsx` owns the shell.

---

## Header settings

- **`headerSettings` in the registry is the single source of truth** for which header fields appear.
- Do not enable a field the body does not support.
- Parquet widgets register live values via **`useParquetWidgetSettings({ headerSettings, panelId, … })`**.
- BTC Perp registers interval, indicators, and tools via **`useMarketWidgetSettings`**.
- `PanelHeaderControls` renders the shared header.

| Field | Meaning |
|-------|---------|
| `dataset` | Dataset picker |
| `timeRange` | Time range picker |
| `columns` | Column multi-select (table) |
| `metric` | KPI metric column |
| `aggregation` | KPI aggregation |
| `interval` | Candle interval (`1m`, `5m`, `30m`, `1h`, `2h`, `4h`, `1d`, `1w`) for live market widgets |
| `indicators` | Market indicator multi-select (BTC Perp; availability is interval-specific) |
| `tools` | Chart tools menu (BTC Perp: FRVP, rectangle/box, line) |

---

## Data modes (`data`)

| `kind` | Meaning |
|--------|---------|
| `none` | No backend/stream queries declared |
| `rest` | REST queries only; `queries: readonly WidgetDataQuerySource[]` |
| `stream` | Live channel only; **`channel: string`** required |
| `query-and-stream` | REST `queries` + **`channel`** or **`channels`** |

**REST query sources** (metadata labels; hooks fetch today via `api/client.ts`):

- `preview` — tabular preview
- `series` — chart series
- `schema` — column schema
- `kpi` — KPI endpoint
- `candles` — Binance BTC perpetual klines (`/api/market/binance/usdm/btcusdt/klines`)

**Stream:** `channel` or `channels` must match `/api/ws/{channel}` (see `src/widgets/stream/`). **BTC Perpetual** (`btc-perpetual-chart`) uses `query-and-stream`: REST klines + context endpoints for VWAP, fixed-range volume profile source (`/klines/volume-profile`), and one WebSocket relay channel per interval (`binance.usdm.btcusdt.kline.{interval}`). Indicator availability is timeframe-specific (see README BTC Perpetual section). Instance interval, indicators, rolling VWAP, and drawing tools persist via the `0xdeck-widget-market-*` and related keys in [AGENTS.md](../AGENTS.md).

---

## Data states (Parquet-backed widgets)

- Hook state types use **`WidgetDataState<TReady>`** (`src/widgets/data/types.ts`).
- **Non-ready** (`loading`, `offline`, `no-folder`, `empty`, `error`) → **`WidgetDataStateView`** with optional `loadingFallback`.
- **`ready`** content is rendered only in the widget component.
- **Do not** show mock or placeholder market data as a fallback when real data is unavailable.

Non-data widgets (`data.kind: 'none'`) do not require `WidgetDataStateView`.

---

## Persistence

- Instance settings use existing storage keyed by **`panelId`** (`0xdeck-widget-datasets`, `0xdeck-widget-time-ranges`, `0xdeck-widget-market-intervals`, etc.).
- **New** workspace keys must use the **`0xdeck-`** prefix.
- **Changing a template `id`** breaks saved layouts and stored settings that reference old instance prefixes — treat `id` as stable.

---

## Definition of Done

- [ ] `WidgetDefinition` added to `definitions.tsx`
- [ ] Body component (`WidgetInstanceProps`); no duplicate shell
- [ ] `headerSettings` match actual header registration
- [ ] `data` metadata matches real hooks (when added)
- [ ] Data widgets use `WidgetDataStateView` for non-ready states
- [ ] Instance state keyed by `panelId`; `stateScope` correct
- [ ] `npm run build` and `npm run lint` (no new lint debt)
- [ ] [WIDGET-GUIDE.md](./WIDGET-GUIDE.md) or this doc updated if behavior is non-obvious
