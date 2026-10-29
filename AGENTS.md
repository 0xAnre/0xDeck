# 0xDeck — Agent Guide

Context for AI agents helping users customize this repository.

## Development workflow (role and runtime independent)

0xDeck's development process is defined by **roles** and GitHub records, not by any one agent application or model.

- [Development workflow](.agents/WORKFLOW.md) — scope, handoffs, review, evidence, cancellation and user-only final merge.
- [Role contracts](.agents/roles/) — Orchestrator, Coder, Reviewer and an **on-demand** Principal Engineer.
- Runtime-specific setup (agent launcher, model choice, local paths, tools and permissions) belongs in its own adapter and must not redefine these shared project rules.
- **Only the user merges to `main`.** Agents never merge or enable auto-merge.
- Do not infer authorization from a GitHub event/comment or automatically invoke an optional specialist.

## Read order (bootstrap)

1. This file (`AGENTS.md`)
2. [docs/README.md](docs/README.md) — documentation index and typical workflows
3. Task-specific documentation:
   - **Widget work** → [docs/WIDGET-STANDARD.md](docs/WIDGET-STANDARD.md) + [docs/WIDGET-GUIDE.md](docs/WIDGET-GUIDE.md)
   - **Chart tool / indicator work** → [docs/CHART-OBJECT-STANDARD.md](docs/CHART-OBJECT-STANDARD.md)
   - **Backend work** → [backend/README.md](backend/README.md)

## What this project is

A **market research workspace canvas** with a **reusable widget model** — not a finished product. Users clone it to build personal interfaces for:

- Market data research and analytics
- Charting and dashboards
- Trade execution UI
- Bot monitoring and control panels

**Included:** draggable/resizable widget grid, layout persistence, 6 built-in color themes (including `black`), shadcn/ui components, local Parquet backend (FastAPI + DuckDB), reusable widget model, Parquet-backed widgets (table, chart, KPI, dashboard, reports preview, notes, market times), **BTC Perpetual** chart (Binance USD-M `BTCUSDT` and Hyperliquid `BTC` klines via backend REST + WebSocket relay, TradingView Lightweight Charts, indicators and chart tools in `src/market/`), plus a built-in read-only Hyperliquid account and automatic Entry/Close markers on the existing candle series.

**Not included:** auth, generic multi-exchange connectors, trade execution APIs. Parquet widgets do not use live feeds; **BTC Perp** is the live market widget (see `src/widgets/stream/`, `/api/ws/{channel}`, `backend/app/market/`).

Stack: Vite, React 19, TypeScript, Tailwind v4, shadcn/ui (Radix Mira), `react-grid-layout` v2, FastAPI, DuckDB.

## Architecture (read this first)

```
App.tsx                    → header, theme/widget menus, grid shell; renders registry component
widgets/registry/          → WidgetDefinition catalog (id, layout, headerSettings, data metadata)
widgets/stream/            → WebSocket message contract + client (BTC Perp relay channels)
BtcPerpetualChartPanel.tsx → BTC Perpetual widget body (lightweight-charts, account markers)
market/                    → Candles, EMA/VWAP indicators, rolling VWAP overlays, Aggregated Liquidations pane, FRVP, rectangle/line tools, exchange routing/tick/history limits, Hyperliquid account fill grouping/markers
screenNavigationShortcuts.ts → Workspace screen jumps (`m` then `1`–`9`) + Screen Lock alignment helpers
api/client.ts              → Parquet datasets: preview, series, kpi
api/fixedRangeVolumeProfileClient.ts → Volume-profile klines client
panels.ts                  → instance ids (chart-abc123), layout helpers; catalog derived from registry
ParquetDataContext.tsx     → dataset catalog + useWidgetParquetData hook
backend/app/               → FastAPI + DuckDB Parquet queries
backend/app/market/        → exchange-aware BTC perp providers (Binance USD-M + Hyperliquid), shared VWAP context, volume-profile source
layoutStorage.ts           → localStorage workspaces: per-workspace activePanels + lg layout, legacy payload migration, two-tab envelope merge
lib/workspaceModel.ts      → pure multi-workspace model (list ops, persisted envelope, legacy migration)
lib/workspaceStorage.ts    → pure persistence core (gridVersion migration, restore/patch, load/save, envelope merge policy)
lib/workspaceScope.ts      → fallback active-workspace accessor for workspace-scoped storage keys (unmounted/test callers only)
context/WorkspaceScopeContext.tsx → hands the active workspace id of *this tab* to the panel tree
WorkspaceSwitcher.tsx      → header workspace icon switcher (+ new empty workspace)
datasetStorage.ts          → per-widget dataset + workspace Data Table defaults (per workspace)
timeRangeStorage.ts        → per-widget time range
WidgetSettingsContext.tsx  → per-widget settings registry
PanelHeaderControls.tsx    → header dropdowns (dataset, columns, range, metric, aggregation, market exchange/interval/indicators/tools)
```

Grid: 36/24/12 columns (lg/md/sm), `rowHeight` 11px, overlap allowed, z-index on last interaction. Only **lg** layout is persisted.

**Workspaces:** several independent workspaces share the app shell, one rendered at a time and switched with the icon buttons in the header (`WorkspaceSwitcher.tsx`, immediately right of the logo; `+` appends and activates an empty one; the icon strip scrolls horizontally once the header runs out of room). The active workspace is **per tab**: two tabs can render different workspaces at the same time, so a switch in one tab never switches the other. Each workspace owns its panel instances, layout, chart configuration/indicators/drawing tools, widget settings, Notes content and Data Table columns; stacking order is per workspace. There is no workspace limit. The existing single-workspace payload migrates to **Workspace 1** on first load. Widget state is workspace-private because every `0xdeck-widget-*` key is keyed by the unique panel instance id; the two former singletons `0xdeck-notes` and `0xdeck-data-config` are stored per workspace under `<key>:<workspaceId>`.

**Scoped-key call convention (required):** a mounted widget gets its workspace id from `useWorkspaceScope()` (`context/workspaceScopeContextValue.ts`, provider `WorkspaceScopeProvider` mounted in `App.tsx` from `workspaces.activeWorkspaceId`) and passes it **explicitly** to `loadNotesWorkspace(workspaceId)` / `saveNotesWorkspace(workspace, workspaceId)` / `loadWorkspaceDataConfig(workspaceId)` / `saveWorkspaceDataConfig(config, workspaceId)` / `workspaceScopedKey(baseKey, workspaceId)`. Never resolve the write target by re-reading `0xdeck-workspace` at save time: another tab can activate a different workspace at any moment, and a tab that still renders Workspace 1 must keep writing Workspace 1. The optional `workspaceId = resolveActiveWorkspaceId()` parameter on the storage APIs exists only for backwards compatibility and pure unit tests; `lib/workspaceScope.ts` is not a mount-time source of truth for widgets.

**Multi-tab conflict policy (local only, no server, no locks):** every tab writes the whole `0xdeck-workspace` envelope, so both sides are merged instead of blindly overwritten.

- *Widget writes:* scoped by the explicit id above, so a stale tab writes the workspace it renders.
- *Envelope save:* `saveWorkspaces` (app adapter) diffs the store against what this tab last read/wrote and names the changed workspace ids; `mergeWorkspaceCollections` then lets only those override the stored entry, adopts every other stored workspace (including ones created in another tab) and appends workspaces created here. The merged `activeWorkspaceId` is the writing tab's own active id: `resolveMergedActiveId` has three fallback tiers — (1) the writing tab's preferred active id, if it exists in the merged set; (2) otherwise the stored `activeWorkspaceId`, if it exists; (3) otherwise the first merged workspace (`workspaces[0]?.id ?? preferredId`). Tier 3 is unreachable under normal conditions — a merge keeps every workspace this tab holds, so the writer's id is always present — and exists only as a defensive fallback. A write from any tab therefore stamps that tab's active workspace — a tab that merely dragged a panel does too.
- *Envelope read:* the `storage` event on `0xdeck-workspace` re-reads the envelope and adopts external changes (`reloadWorkspaces` → `adoptExternalWorkspaces`), keeping the workspaces this tab edited but has not saved yet, and keeping this tab's active workspace — a switch in another tab is not a switch here, so two tabs can render different workspaces at the same time. `0xdeck-workspace.activeWorkspaceId` is therefore neither a per-tab view nor "the workspace activated most recently": it is the last writer's active workspace, and only a freshly loaded tab adopts it as its own active workspace.
- There is no delete/rename, so a merge never drops a stored workspace; concurrent edits of the *same* workspace are last-write-wins per workspace.

**Header at narrow widths:** the header is a wrapping flex row (`flex-wrap`, `md:flex-nowrap`): below `768px` the right control group (Theme, Widgets, Data Source, Screen Lock) moves to a second row and wraps internally if it still cannot fit, so every control stays reachable instead of overflowing. From `768px` up it is one row, the workspace icon strip is the only horizontally scrollable part (`max-w-[50vw]`, hidden scrollbar) and `+` sits outside the strip. `e2e/workspace-switcher.spec.ts` asserts every control is fully inside the viewport and clickable at 375px and 600px, and that the header stays a single row at 900px with 16 workspaces.

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
8. **Commits** — permitted for the assigned implementation role on its own task branch; see [the development workflow](.agents/WORKFLOW.md)
9. **Read `.agents/skills/shadcn/SKILL.md`** when working with shadcn components
10. **shadcn first** — before building UI, check if shadcn has the component; compose thin wrappers only
11. **Chart tools & indicators** — follow [docs/CHART-OBJECT-STANDARD.md](docs/CHART-OBJECT-STANDARD.md) for chart tools, indicators and their settings (shared color/opacity, width and interaction modules; no parallel pickers or pointer paths)

## Chart objects (indicators & tools)

The normative rules are [docs/CHART-OBJECT-STANDARD.md](docs/CHART-OBJECT-STANDARD.md) — capability matrix by object type, shared color picker, mouse contract, settings dialog, persistence, feature parity. This list is the checklist, not a second standard.

1. **Read the standard first** — before adding or changing a chart indicator, tool, chart-object setting or chart-object interaction.
2. **Check feature parity** — compare with existing objects of the same category before adding a control; a missing capability the matrix requires is a conformance gap, not an exception.
3. **Reuse shared UI** — `ColorOpacityField` + `colorPickerPalette`, `LineChartStrokeSelectFields`, the shadcn `Dialog` with `chartSettingsDialogLayout` constants. No parallel picker, width control or modal shell.
4. **No inconsistent styling controls or mouse interactions** — one behavior per action (single click, double click, outside click, `Esc`) across tools, panes and indicators.
5. **Verify render + reload** — every exposed setting MUST change the chart and survive a reload; no persisted-but-unrendered or rendered-but-unpersisted setting.
6. **Update the documentation in the same PR** — capability matrix, reference table, persistence keys and known gaps when chart capabilities change.
7. **Reviewer gate** — the Reviewer MUST verify standard compliance (matrix, shared components, interaction and persistence contracts) before approving a chart tool/indicator PR, and MUST NOT accept an undocumented capability gap.

Deviations are recorded in [Known conformance gaps](docs/CHART-OBJECT-STANDARD.md#known-conformance-gaps), a table expected to be empty once the standard is met; a resolved or removed gap must never be cited as precedent.

## shadcn-first workflow

Before any new UI work:

1. Read `.agents/skills/shadcn/SKILL.md`
2. Search: `npx shadcn@latest search @shadcn -q "<name>"`
3. Docs: `npx shadcn@latest docs <component>`
4. Add: `npx shadcn@latest add <component>`
5. Compose in app code — only build custom **wrappers** (e.g. `ThemeSelect`, `WidgetSelect`), not custom primitives

## Agent skills (`.agents/skills/`)

Project-local skills for AI agents. Read the relevant `SKILL.md` before working in that area:

| Skill | Path |
|-------|------|
| shadcn/ui | `.agents/skills/shadcn/SKILL.md` |
| Lightweight Charts | `.agents/skills/lightweight-charts/SKILL.md` |
| Lightweight Charts plugins | `.agents/skills/lightweight-charts-plugin-authoring/SKILL.md` |
| Radix → Base UI migration | `.agents/skills/migrate-radix-to-base/SKILL.md` |

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
| `layoutStorage.ts`, `lib/workspaceStorage.ts`, `lib/workspaceScope.ts`, `themeStorage.ts`, `datasetStorage.ts` | Persistence logic |
| `ThemeSelect`, `WidgetSelect`, `WorkspaceSwitcher` | Thin app wrappers composing shadcn |
| `PanelHeaderControls`, `useParquetWidgetSettings`, `useMarketWidgetSettings` | Header dropdowns (Parquet + exchange/interval/indicators/tools) |
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
| `black` | Black (Neutral-derived palette, `#0F0F0F` background) |

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
| `btc-perpetual-chart` | BTC perpetual candles from **Binance USD-M** (default) or **Hyperliquid**, selected in the header; header exchange + interval (`1m`–`1w`), indicators (3 EMA, 2 EMA, RSI, daily/weekly/monthly/quarterly/yearly VWAP, rolling VWAP overlay instances, Aggregated Liquidations), tools (fixed-range volume profile, rectangle/box, line); REST history + live kline WebSocket relay |

**`src/market/` (BTC Perp):** candle parsing/merge, chart history and live updates, VWAP context requests, rolling VWAP instances/settings UI, fixed-range volume profile selection/render pipeline, and pure Hyperliquid account fill dedupe/bucketing/side-only marker grouping. Indicator availability is interval-specific (see `market/indicators.ts` and [README.md](README.md) BTC Perpetual section).

## Persistence keys (localStorage)

| Key | Content |
|-----|---------|
| `0xdeck-workspace` | **Shared by every workspace and tab.** `{ version, activeWorkspaceId, workspaces: [{ id, activePanels, layout, gridVersion }] }` — one lg layout per workspace, instance ids. A legacy `{ activePanels, layout, gridVersion }` payload (or its `layouts.lg` variant) is migrated in place to Workspace 1; a pre-version payload (no `gridVersion`, 12 columns) is scaled 12→36 exactly once. Panel ids the catalog cannot resolve and orphan layout items are kept in the payload (filtered only when rendering). Written with the two-tab merge policy above (see *Multi-tab conflict policy*); `activeWorkspaceId` is the active workspace of the tab that wrote the envelope last, which is what a newly loaded tab opens — a write from any other tab replaces it |
| `0xdeck-theme` | Theme id string — **global**, shared by all workspaces |
| `0xdeck-notes:<workspaceId>` | Notes workspace of one workspace (files, contents, active tab). Written with the **explicit** workspace id of the widget's context (never resolved at save time). The legacy `0xdeck-notes` singleton is read for **Workspace 1 only**, so existing notes survive the upgrade; other workspaces seed from the bundled notes |
| `0xdeck-widget-datasets` | Per-widget dataset name |
| `0xdeck-widget-time-ranges` | Per-widget time range (`15m` … `all`) |
| `0xdeck-widget-kpi-config` | Per-widget `{ metricColumn, aggregation }` |
| `0xdeck-data-config:<workspaceId>` | Data Table default dataset + columns of one workspace, written with the **explicit** workspace id of the widget's context. The legacy `0xdeck-data-config` singleton is read for **Workspace 1 only**; other workspaces start from no dataset and all columns |
| `0xdeck-widget-market-exchanges` | Per-instance BTC Perp exchange (`binance` default / `hyperliquid`) |
| `0xdeck-widget-market-intervals` | Per-instance BTC Perp candle interval |
| `0xdeck-widget-market-indicators` | Per-instance enabled market indicators |
| `0xdeck-widget-market-rsi-settings` | Per-instance RSI period and overbought/oversold levels (BTC Perp) |
| `0xdeck-widget-market-position-markers` | Per-instance Hyperliquid Position Markers toggle (default OFF) |
| `0xdeck-widget-liquidations-settings` | Per-instance Aggregated Liquidations source (`binance` only in V1) and pane position (`bottom` default / `top`) |
| `0xdeck-widget-rolling-vwap-instances` | Rolling VWAP overlay instances with embedded settings per instance (BTC Perp) |
| `0xdeck-widget-rolling-vwap-settings` | Legacy per-panel rolling VWAP settings (read for migration into instances only; not written on save) |
| `0xdeck-widget-fixed-range-vp-instances` | Fixed-range volume profile instances (BTC Perp) |
| `0xdeck-widget-rectangle-instances` | Rectangle/box drawing instances (BTC Perp) |
| `0xdeck-widget-line-instances` | Line drawing instances (BTC Perp) |
| `0xdeck-widget-anchored-vwap-instances` | Anchored VWAP drawing instances (BTC Perp) |
| `0xdeck-widget-market-chart-viewports` | Per-instance BTC Perp chart viewport by candle interval |

All `0xdeck-widget-*` keys are **workspace-private in practice**: they are keyed by the panel instance id, and every workspace creates its own instance ids (chart configs, indicators, drawing instances, RSI, liquidations and viewports therefore never leak across workspaces).

Invalid saved theme ids fall back to `neutral`. Older browser data from pre-0xDeck builds is not migrated automatically.

**Workspace screens:** `m` then `1`–`9` scrolls the outer workspace scroller to screen positions 1–9 (`screenNavigationShortcuts.ts`). The screen position is the scroller's offset, so it is per tab and shared by every workspace in that tab (switching workspaces keeps the current screen; there is no per-workspace scroll memory). A wrapper inside `.workspace-scroller` reserves a virtual 9-viewport extent so empty screens stay reachable without moving any widget. The header **Screen Lock** button (`App.tsx`, in-memory) pins the workspace to the active screen: manual scrolling snaps back to the active screen's exact top, `m` + digit still jumps, and viewport resize re-aligns. Lock math is pure in `screenNavigationShortcuts.ts`. Outer `.workspace-scroller` and panel `.panel-body` use hidden scrollbars (`App.css`); both regions remain scrollable.

Backend state: `backend/.canvas-state.json` (parquet folder path, gitignored).

Backend persistence: normalized Binance USD-M liquidation history is stored in `backend/.liquidations.sqlite3` (gitignored, WAL mode; override with `OXDECK_LIQUIDATIONS_DB`). Collection runs continuously while the backend is started (not only while a chart is open) and serves `GET /api/market/binance/usdm/btcusdt/liquidations/history`; there is no backfill before collection starts. Tests disable the collector with `OXDECK_DISABLE_LIQUIDATION_COLLECTOR=1`.

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
- [docs/CHART-OBJECT-STANDARD.md](docs/CHART-OBJECT-STANDARD.md) — normative chart tool / indicator rules
- [docs/THEME-GUIDE.md](docs/THEME-GUIDE.md) — add/customize themes
- [docs/NEXT-STEPS.md](docs/NEXT-STEPS.md) — roadmap
- [backend/README.md](backend/README.md) — API reference
