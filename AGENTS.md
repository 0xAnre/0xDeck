# 0xDeck — Agent Guide

Context for AI agents helping users customize this repository.

## Read order (bootstrap)

1. This file (`AGENTS.md`)
2. [docs/README.md](docs/README.md) — documentation index and typical workflows
3. Task-specific documentation:
   - **Widget work** → [docs/WIDGET-STANDARD.md](docs/WIDGET-STANDARD.md) + [docs/WIDGET-GUIDE.md](docs/WIDGET-GUIDE.md)
   - **Backend work** → [backend/README.md](backend/README.md)

## What this project is

A **market research workspace canvas** with a **reusable widget model** — not a finished product. Users clone it to build personal interfaces for:

- Market data research and analytics
- Charting and dashboards
- Trade execution UI
- Bot monitoring and control panels

**Included:** draggable/resizable widget grid, layout persistence, 5 shadcn color themes, shadcn/ui components, local Parquet backend (FastAPI + DuckDB), reusable widget model, Parquet-backed widgets (table, chart, KPI, dashboard, reports preview, notes, market times), **BTC Perpetual** chart (Binance USD-M `BTCUSDT` klines via backend REST + WebSocket relay, TradingView Lightweight Charts, indicators and tools in `src/market/`).

**Not included:** auth, generic multi-exchange connectors, trade execution APIs. Parquet widgets do not use live feeds; **BTC Perp** is the live market widget (see `src/widgets/stream/`, `/api/ws/{channel}`, `backend/app/market/`).

Stack: Vite, React 19, TypeScript, Tailwind v4, shadcn/ui (Radix Mira), `react-grid-layout` v2, FastAPI, DuckDB.

## Architecture (read this first)

```
App.tsx                    → header, theme/widget menus, grid shell; renders registry component
widgets/registry/          → WidgetDefinition catalog (id, layout, headerSettings, data metadata)
widgets/stream/            → WebSocket message contract + client (BTC Perp relay channels)
BtcPerpetualChartPanel.tsx → BTC Perpetual widget body (lightweight-charts)
market/                    → Candles, EMA/VWAP indicators, rolling VWAP, fixed-range volume profile
api/client.ts              → Parquet datasets: preview, series, kpi
api/fixedRangeVolumeProfileClient.ts → Volume-profile klines client
panels.ts                  → instance ids (chart-abc123), layout helpers; catalog derived from registry
ParquetDataContext.tsx     → dataset catalog + useWidgetParquetData hook
backend/app/               → FastAPI + DuckDB Parquet queries
backend/app/market/        → Binance USD-M BTCUSDT klines, VWAP context, volume-profile source
layoutStorage.ts           → localStorage workspace (activePanels + lg layout)
datasetStorage.ts          → per-widget dataset + workspace column defaults
timeRangeStorage.ts        → per-widget time range
WidgetSettingsContext.tsx  → per-widget settings registry
PanelHeaderControls.tsx    → header dropdowns (dataset, columns, range, metric, aggregation)
```

Grid: 36/24/12 columns (lg/md/sm), `rowHeight` 11px, overlap allowed, z-index on last interaction. Only **lg** layout is persisted.

**Widget instances:** `WIDGET_REGISTRY` defines templates; each open panel gets a unique id (`chart-a1b2c3`). Widgets menu **adds** instances; panel **X** closes. Each instance has its own dataset, time range, and KPI config in localStorage. **Reusable widget** = one registry entry, add many instances, port bodies from other projects ([WIDGET-GUIDE.md](docs/WIDGET-GUIDE.md)).

## Common user tasks

| User goal | Where to work | Doc |
|-----------|---------------|-----|
| Add a widget | `widgets/registry/definitions.tsx` | [docs/WIDGET-GUIDE.md](docs/WIDGET-GUIDE.md) |
| Wire Parquet / API data | `api/client.ts`, hooks, panel components | [docs/WIDGET-GUIDE.md](docs/WIDGET-GUIDE.md) |
| Add KPI aggregation | `backend/app/datasets.py`, `KpiCardPanel.tsx` | [backend/README.md](backend/README.md) |
| Add a color theme | `index.css`, `themeStorage.ts` | [docs/THEME-GUIDE.md](docs/THEME-GUIDE.md) |
| Add shadcn component | `npx shadcn@latest add <component>` | [shadcn docs](https://ui.shadcn.com) |
| Change default layout | `DEFAULT_ACTIVE_PANELS` in `panels.ts` | — |
| Backend folder / streams | `DataSourceDialog`, `backend/app/datasets.py` | [backend/README.md](backend/README.md) |
| BTC Perp / market chart | `BtcPerpetualChartPanel.tsx`, `src/market/`, `backend/app/market/` | [README.md](README.md) (BTC Perpetual), [backend/README.md](backend/README.md) |

## Agent conventions

1. **Minimize scope** — match existing patterns; no unrelated refactors
2. **No hardcoded colors in widgets** — shadcn semantic tokens (`text-up`, `text-bid`, `bg-card`, …)
3. **Shell vs body** — panel chrome in `App.tsx` (Card); widget body from registry `component`
4. **Registry-first widgets** — add one `WidgetDefinition` entry; no manual kind union or router switch
5. **Imports at top of file** — no inline imports
6. **`minW`/`minH` in registry `grid`** = minimum and default open size
7. **Do not start dev servers** unless the user asks — frontend `npm run dev` (57341), backend `uvicorn` (57342)
8. **Do not commit** unless the user explicitly asks
9. **Read `.agents/skills/shadcn/SKILL.md`** when working with shadcn components
10. **shadcn first** — before building UI, check if shadcn has the component; compose thin wrappers only

## Lead Developer Rule

- **Codex is the Lead Developer and MUST NOT implement application code.**
- **Cursor is the implementation/coding agent.**
- For implementation requests, Codex analyzes the task, creates one implementation-ready GitHub Issue, then posts this exact top-level Issue comment:

  ```text
  cursor-ready
  ```

- Codex reviews Cursor's pull request but does not implement the feature itself.
- Neither Codex nor Cursor merges. The final merge belongs to the user.

## shadcn-first workflow

Before any new UI work:

1. Read `.agents/skills/shadcn/SKILL.md`
2. Search: `npx shadcn@latest search @shadcn -q "<name>"`
3. Docs: `npx shadcn@latest docs <component>`
4. Add: `npx shadcn@latest add <component>`
5. Compose in app code — only build custom **wrappers** (e.g. `ThemeSelect`, `WidgetSelect`), not custom primitives

## UI inventory

### shadcn installed + in use

| Component | Used in |
|-----------|---------|
| `button` | `App.tsx`, header controls, pickers |
| `card` | `App.tsx` (panel shell), `DashboardPanel`, `ReportsPanel` |
| `tabs` | `NotesPanel.tsx`, `ReportsPanel.tsx` |
| `textarea` | `NotesPanel.tsx` |
| `chart` | `ChartPanel.tsx`, `DashboardPanel.tsx` |
| `table` | `DataTablePanel.tsx`, `ReportsPanel.tsx` |
| `badge` | `DashboardPanel`, `ReportsPanel`, `DataSourceDialog` |
| `dropdown-menu` | `ThemeSelect`, `WidgetSelect`, `HeaderSelect`, `HeaderColumnsSelect` |
| `dialog` | `DataSourceDialog` |
| `skeleton` | loading states in data widgets |

### Intentionally custom (not shadcn)

| Area | Why |
|------|-----|
| `react-grid-layout` + `App.css` | Drag/resize grid — no shadcn equivalent |
| `layoutStorage.ts`, `themeStorage.ts`, `datasetStorage.ts` | Persistence logic |
| `ThemeSelect`, `WidgetSelect` | Thin app wrappers composing shadcn |
| `PanelHeaderControls`, `useParquetWidgetSettings`, `useMarketWidgetSettings` | Header dropdowns (Parquet + interval/indicators/tools) |
| `BtcPerpetualChartPanel`, `src/market/*` | Lightweight Charts candlestick + indicators + FRVP tool |
| `formatTime.ts`, `formatCellValue.ts` | Epoch timestamp + cell display helpers |

## Themes

| ID | Label |
|----|-------|
| `neutral` | Neutral (default) |
| `stone` | Stone |
| `mauve` | Mauve |
| `taupe` | Taupe |
| `olive` | Olive |

## Widgets

| kind | Purpose |
|------|---------|
| `notes` | Markdown editor + preview (localStorage) |
| `market-times` | Exchange sessions — open/close, countdown (no backend) |
| `dashboard` | KPI row, chart, symbol table |
| `reports` | Report library + dataset preview (export mock) |
| `chart` | Line chart (Recharts), per-widget dataset + time range |
| `kpi-card` | Metric + aggregation + time range via `/kpi` API |
| `data-table` | Parquet preview table, column picker, workspace defaults |
| `btc-perpetual-chart` | Binance USD-M BTCUSDT perpetual candles; header interval (`1m`–`1w`), indicators (3 EMA, daily/weekly/monthly/quarterly/yearly VWAP, rolling VWAP), fixed-range volume profile tool; REST history + live kline WebSocket relay |

**`src/market/` (BTC Perp):** candle parsing/merge, chart history and live updates, VWAP context requests, rolling VWAP instances/settings UI, fixed-range volume profile selection/render pipeline. Indicator availability is interval-specific (see `market/indicators.ts` and [README.md](README.md) BTC Perpetual section).

## Persistence keys (localStorage)

| Key | Content |
|-----|---------|
| `0xdeck-workspace` | `{ activePanels, layout, gridVersion }` — instance ids |
| `0xdeck-theme` | Theme id string |
| `0xdeck-notes` | Notes workspace (files, contents, active tab) |
| `0xdeck-widget-datasets` | Per-widget dataset name |
| `0xdeck-widget-time-ranges` | Per-widget time range (`15m` … `all`) |
| `0xdeck-widget-kpi-config` | Per-widget `{ metricColumn, aggregation }` |
| `0xdeck-data-config` | Workspace default dataset + columns (from Data Table) |
| `0xdeck-widget-market-intervals` | Per-instance BTC Perp candle interval |
| `0xdeck-widget-market-indicators` | Per-instance enabled market indicators |
| `0xdeck-widget-rolling-vwap-instances` | Rolling VWAP overlay instances (BTC Perp) |
| `0xdeck-widget-rolling-vwap-settings` | Rolling VWAP band/settings per instance |
| `0xdeck-widget-fixed-range-vp-instances` | Fixed-range volume profile instances (BTC Perp) |

Invalid saved theme ids fall back to `neutral`. Older browser data from pre-0xDeck builds is not migrated automatically.

Backend state: `backend/.canvas-state.json` (parquet folder path, gitignored).

## Run & build

```bash
# frontend
npm install
npm run dev
npm run build

# backend (separate terminal)
cd backend && source .venv/bin/activate
uvicorn app.main:app --reload --port 57342
```

## Verification

Use these for checks after changes. **Do not start dev servers** (`npm run dev`, `uvicorn`) unless the user explicitly asks — manual UI verification needs both (57341 proxies `/api` to 57342).

```bash
# frontend (repo root)
npm run build
npm run lint
npm run test:market

# backend (from backend/, venv activated)
python -m unittest discover -s tests
```

## Extended docs

- [README.md](README.md) — project overview, quick start
- [docs/README.md](docs/README.md) — documentation index
- [docs/WIDGET-STANDARD.md](docs/WIDGET-STANDARD.md) — normative widget rules
- [docs/WIDGET-GUIDE.md](docs/WIDGET-GUIDE.md) — add/customize widgets
- [docs/THEME-GUIDE.md](docs/THEME-GUIDE.md) — add/customize themes
- [docs/NEXT-STEPS.md](docs/NEXT-STEPS.md) — roadmap
- [backend/README.md](backend/README.md) — API reference
