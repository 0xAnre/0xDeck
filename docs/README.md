# Documentation

Guides for building and extending the 0xDeck market research workspace canvas.

## Start here

| Guide | What it covers |
|-------|----------------|
| [../README.md](../README.md) | Product overview, quick start, custom widget path |
| [WIDGET-STANDARD.md](./WIDGET-STANDARD.md) | Normative widget rules (registry, data, states, DoD) |
| [WIDGET-GUIDE.md](./WIDGET-GUIDE.md) | How-to: add widgets, wire Parquet data |
| [CHART-OBJECT-STANDARD.md](./CHART-OBJECT-STANDARD.md) | Normative chart tool / indicator rules: capability matrix, color picker, mouse, settings, persistence, primitive redraw lifecycle, performance/cost contracts, feature parity |
| [CHART-PERFORMANCE-AUDIT.md](./CHART-PERFORMANCE-AUDIT.md) | Per-object performance inventory and audit: what each chart object costs today, measured evidence, unmeasured risks and follow-up register |
| [MARKETLENS-LIQUIDATION-LEVELS.md](./MARKETLENS-LIQUIDATION-LEVELS.md) | Live **price-level** profiles: Liquidation Levels plus the stop-loss / take-profit trigger-order profiles, their MarketLens Hyperliquid L4 sources and protocol (incl. verified TPSL semantics), rendering/cost contract, settings/persistence, and the PR #279 shared-module convergence note |
| [../templates/widget/README.md](../templates/widget/README.md) | Copy-paste starter panel + registry snippet |
| [THEME-GUIDE.md](./THEME-GUIDE.md) | Color themes, shadcn tokens, shell rules |
| [../backend/README.md](../backend/README.md) | FastAPI + DuckDB API, streams, KPI, time range |
| [NEXT-STEPS.md](./NEXT-STEPS.md) | Roadmap — done vs remaining |
| [MARKETLENS-LIQUIDATIONS-DEMO.md](./MARKETLENS-LIQUIDATIONS-DEMO.md) | Standalone experiment: live BTC liquidation-price liquidity ladder from the public MarketLens L4 stream |
| [../AGENTS.md](../AGENTS.md) | Architecture + AI agent conventions |
| [../.agents/WORKFLOW.md](../.agents/WORKFLOW.md) | Agent-independent development lifecycle, including mandatory post-merge preview cleanup |
| [../.agents/runtimes/pi.md](../.agents/runtimes/pi.md) | Pi runtime adapter: verified VPS three-Coder deployment and Mac migration runbook |
| [../.agents/runtimes/hostinger-pargali.md](../.agents/runtimes/hostinger-pargali.md) | Hostinger preview artifact, routing and automatic merged-preview retirement procedure; separate user-confirmed production publish authorization |
| [PRODUCT-POSITIONING.md](./PRODUCT-POSITIONING.md) | Product positioning + UX direction |

## AI-assisted development

The project's development process is **agent and model independent**. See:

- [Development workflow](../.agents/WORKFLOW.md) — Issue → Coder → PR → independent review → user-only merge
- [Role contracts](../.agents/roles/) — Orchestrator, Coder, Reviewer, on-demand Principal Engineer
- [AGENTS.md](../AGENTS.md) — project architecture, conventions, verification and skills

Runtime adapters configure how a particular agent tool loads these rules; the shared workflow is not tied to a specific provider.

## Typical workflows

**Load your data**

1. Start backend → `uvicorn app.main:app --reload --port 57342`
2. Start frontend → `npm run dev` (http://localhost:57341)
3. **Data source** → absolute path to your Parquet folder → Save
4. Registry refreshes automatically

**Build a workspace**

1. Add a widget: Chart, KPI Card, Data Table, Notes, Market Times, Dashboard, Reports, **BTC Perp**
2. Use the dropdowns in the widget header for dataset, columns, time range, metric, and aggregation (BTC Perp: exchange, interval, indicators, tools)
3. Drag, resize, stack panels — layout persists in `localStorage`
4. Scroll the workspace when content extends below the viewport; jump to screens 1–9 with `m` then `1`–`9`, or use the header **Screen Lock** button to pin the workspace to the active screen (see [README](../README.md#workspace-navigation))

**Create a reusable widget**

- Register template → `widgets/registry/definitions.tsx` + panel component ([WIDGET-GUIDE](./WIDGET-GUIDE.md)); `panels.ts` derives catalog and instance helpers
- Port from another project → libs in `src/lib/`, body in `*Panel.tsx`, one registry entry
- New theme → `index.css` + `themeStorage.ts` ([THEME-GUIDE](./THEME-GUIDE.md))
- New API endpoint → `backend/app/` ([backend README](../backend/README.md))

## Widgets at a glance

| Widget | Live data | Notes |
|--------|-----------|-------|
| Data Table | Parquet preview | Column picker, workspace defaults |
| Chart | Line series | Per-widget dataset + time range |
| KPI Card | `/kpi` API | Metric, aggregation, range dropdown |
| Dashboard | KPI + chart + table | Combined panel |
| Reports | Preview tab | Export mock; saved queries planned |
| Notes | localStorage | Markdown edit + preview |
| Market Times | — | Exchange sessions, open/close countdown |
| BTC Perp | REST klines + WebSocket relay (Binance USD-M / Hyperliquid); Position Markers from the global Hyperliquid/Lighter wallet; opt-in live Liquidation Levels from MarketLens Hyperliquid L4 | Candles, indicators, rolling VWAP overlays, FRVP / rectangle / line / anchored VWAP tools, Entry/Close markers, open-position liquidation-price profile |

## Data layout

```
your-data-folder/
├── market_ticks.parquet      # flat file dataset
├── trades/                   # stream (nested parquet)
│   └── **/*.parquet
└── prediction_price/
    └── **/*.parquet
```

Streams are auto-discovered as top-level subfolders with parquet files inside.
