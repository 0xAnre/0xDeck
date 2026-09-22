# 0xDeck — Agent Guide

Context for AI agents helping users customize this repository.

## What this project is

A **market research workspace canvas** with a **reusable widget model** — not a finished product. Users clone it to build personal interfaces for:

- Market data research and analytics
- Charting and dashboards
- Trade execution UI
- Bot monitoring and control panels

**Included:** draggable/resizable widget grid, layout persistence, 5 shadcn color themes, shadcn/ui components, local Parquet backend (FastAPI + DuckDB), reusable widget model, live data widgets (table, chart, KPI, dashboard, reports preview, notes, market times).

**Not included:** live WebSocket feeds, exchange APIs, auth.

Stack: Vite, React 19, TypeScript, Tailwind v4, shadcn/ui (Radix Mira), `react-grid-layout` v2, FastAPI, DuckDB.

## Architecture (read this first)

```
App.tsx                    → header, theme/widget menus, grid shell (shadcn Card panels)
panels.ts                  → widget catalog (templates) + instance ids (chart-abc123)
PanelContent.tsx           → widget bodies
ParquetDataContext.tsx     → dataset catalog + useWidgetParquetData hook
api/client.ts              → /api/datasets, preview, series, kpi
backend/app/               → FastAPI + DuckDB Parquet queries
layoutStorage.ts           → localStorage workspace (activePanels + lg layout)
datasetStorage.ts          → per-widget dataset + workspace column defaults
timeRangeStorage.ts        → per-widget time range
WidgetSettingsContext.tsx  → per-widget settings registry
PanelHeaderControls.tsx    → header dropdowns (dataset, columns, range, metric, aggregation)
```

Grid: 36/24/12 columns (lg/md/sm), `rowHeight` 11px, overlap allowed, z-index on last interaction. Only **lg** layout is persisted.

**Widget instances:** `PANEL_CATALOG` defines templates; each open panel gets a unique id (`chart-a1b2c3`). Widgets menu **adds** instances; panel **X** closes. Each instance has its own dataset, time range, and KPI config in localStorage. **Reusable widget** = register template once, add many instances, port bodies from other projects ([WIDGET-GUIDE.md](docs/WIDGET-GUIDE.md)).

## Common user tasks

| User goal | Where to work | Doc |
|-----------|---------------|-----|
| Add a widget | `panels.ts`, `PanelContent.tsx` | [docs/WIDGET-GUIDE.md](docs/WIDGET-GUIDE.md) |
| Wire Parquet / API data | `api/client.ts`, hooks, panel components | [docs/WIDGET-GUIDE.md](docs/WIDGET-GUIDE.md) |
| Add KPI aggregation | `backend/app/datasets.py`, `KpiCardPanel.tsx` | [backend/README.md](backend/README.md) |
| Add a color theme | `index.css`, `themeStorage.ts` | [docs/THEME-GUIDE.md](docs/THEME-GUIDE.md) |
| Add shadcn component | `npx shadcn@latest add <component>` | [shadcn docs](https://ui.shadcn.com) |
| Change default layout | `DEFAULT_ACTIVE_PANELS` in `panels.ts` | — |
| Backend folder / streams | `DataSourceDialog`, `backend/app/datasets.py` | [backend/README.md](backend/README.md) |

## Agent conventions

1. **Minimize scope** — match existing patterns; no unrelated refactors
2. **No hardcoded colors in widgets** — shadcn semantic tokens (`text-up`, `text-bid`, `bg-card`, …)
3. **Shell vs body** — panel chrome in `App.tsx` (Card); content in panel components via `PanelContent.tsx`
4. **Exhaustive switches** — `PanelKind` cases use `never` in the default branch
5. **Imports at top of file** — no inline imports
6. **`minW`/`minH` in `panels.ts`** = minimum and default open size
7. **Do not start dev servers** unless the user asks — frontend `npm run dev` (57341), backend `uvicorn` (57342)
8. **Do not commit** unless the user explicitly asks
9. **Read `.agents/skills/shadcn/SKILL.md`** when working with shadcn components
10. **shadcn first** — before building UI, check if shadcn has the component; compose thin wrappers only

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
| `PanelHeaderControls`, `useParquetWidgetSettings` | Header dropdowns for data widgets |
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

## Extended docs

- [README.md](README.md) — project overview, quick start
- [docs/WIDGET-GUIDE.md](docs/WIDGET-GUIDE.md) — add/customize widgets
- [docs/THEME-GUIDE.md](docs/THEME-GUIDE.md) — add/customize themes
- [docs/NEXT-STEPS.md](docs/NEXT-STEPS.md) — roadmap
- [backend/README.md](backend/README.md) — API reference
