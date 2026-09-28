# Widget Guide

How to add or customize widgets in 0xDeck. Shell, grid, and themes: [THEME-GUIDE.md](./THEME-GUIDE.md). Backend API: [../backend/README.md](../backend/README.md).

0xDeck is widget-native: start with built-in panels, then add your own **reusable** market research widgets.

**Scope:** Widget **body** only — table, chart, KPI content. The shell (title bar, header dropdowns, close, resize) lives in `App.tsx` as a shadcn `Card` and is shared by all widgets.

---

## Reusable widget model

A widget is reusable in three ways:

| Concept | What it means |
|---------|----------------|
| **Template** | One entry in `WIDGET_REGISTRY` (`src/widgets/registry/definitions.tsx`) |
| **Instance** | Each add from the Widgets menu → unique id (`chart-a1b2c3`), own settings and grid slot |
| **Portable** | Body + libs from another project; wire via one registry entry + `*Panel.tsx` |

Example: **Market Times** — session logic in `src/lib/marketSessions.ts`, body in `MarketTimesPanel.tsx`, no backend required.

Rules:

- Register the template once in the registry; users can add as many instances as they need
- Key per-instance state by `panelId` (dataset, range, KPI config) unless `stateScope` is `workspace`
- Do not duplicate shell chrome in widget bodies
- Prefer shadcn semantic tokens over hardcoded colors when porting CSS

---

## Anatomy

| Layer | File | Responsibility |
|-------|------|----------------|
| Shell | `src/App.tsx` | shadcn `Card` — title, header dropdowns, close, drag/resize |
| Registry | `src/widgets/registry/` | `WidgetDefinition` — component, layout, header fields, data metadata |
| Body | `src/*Panel.tsx` | Widget-specific UI + data hooks |

```
┌─ CardHeader ──────────────────────────────────────┐
│  Chart 2   [Dataset ▾] [Range ▾]               ×  │
├─ CardContent ─────────────────────────────────────┤
│  … widget content …                               │
└───────────────────────────────────────────────────┘
```

Data widgets show compact dropdowns in the panel header (`PanelHeaderControls`). `HeaderSelect` covers dataset, time range, metric, and aggregation. `HeaderColumnsSelect` covers table columns.

---

## Widget instances

- `WIDGET_REGISTRY` in `src/widgets/registry/definitions.tsx`
- `panels.ts` derives `PANEL_CATALOG` and instance helpers from the registry
- Each added widget gets a **unique instance id** (`chart-a1b2c3`) via `createPanelInstance()`
- **Widgets** menu → pick type → **adds** a new instance (`WidgetSelect` reads the registry)
- Panel **X** → removes that instance
- Layout `i` field = instance id

---

## Add a new widget

The happy path is two files:

1. `src/widgets/registry/definitions.tsx` — one `WidgetDefinition` entry
2. `src/MyWidgetPanel.tsx` — body component implementing `WidgetInstanceProps`

### 1. Register in `definitions.tsx`

```tsx
{
  id: 'mywidget',
  title: 'My Widget',
  description: 'Optional subtitle',
  component: MyWidgetPanel,
  grid: { x: 0, y: 0, w: 6, h: 6, minW: 6, minH: 6 },
  headerSettings: {
    dataset: true,
    timeRange: true,
    columns: false,
    metric: false,
    aggregation: false,
  },
  stateScope: 'instance',
  data: { kind: 'rest', queries: ['preview'] },
},
```

- `minW` × `minH` — minimum size **and** default open size
- lg grid: 36 columns, `rowHeight` 11px → height ≈ `h × 11px`
- `data.kind: 'none'` when the widget has no backend queries; use `rest` with `preview` | `series` | `schema` | `kpi` for metadata only (hooks unchanged in v1)
- Future live data: `stream` (`channel`) and `query-and-stream` (`queries` + `channel`) — types only until a later stage; no widget uses them yet
- `widgetHasHeaderControls(definition)` in the registry drives header chrome — no separate configurable set

### 2. Create panel component

```tsx
import type { WidgetInstanceProps } from '@/widgets/registry/types'

export function MyWidgetPanel({ panelId, headerSettings }: WidgetInstanceProps) {
  useParquetWidgetSettings({ headerSettings, panelId, title: 'My Widget', /* … */ })
  // …
}
```

`App.tsx` renders `definition.component` with `panelId` and `headerSettings` from the registry.

### 3. Widget picker

`WidgetSelect.tsx` lists `WIDGET_REGISTRY` — new entries appear automatically.

---

## Data contract

Shared types live in `src/widgets/data/types.ts`:

- **Query names** — `WidgetDataQuerySource` (`preview`, `series`, `schema`, `kpi`) appear in each widget’s registry `data` metadata (`definitions.tsx`).
- **Result types** — `WidgetQueryResultMap` links each query name to the matching type in `src/api/types.ts`; use `WidgetQueryResult<'preview'>` (and so on) in ready payloads.
- **Hook state** — `ParquetDataState`, `ParquetCatalogState`, and `KpiCardState` are `WidgetDataState<TReady>` with the same ready fields as before (`dataset`, `preview`, `series`, `kpi`, …). Use `isWidgetDataReady()` or the existing `isParquetReady()` / `isKpiCardReady()` guards.

Registry metadata does **not** run queries in this stage — existing hooks still fetch via `api/client.ts`.

### Data widget UI states

Parquet-backed panels use `WidgetDataStateView` (`src/widgets/components/WidgetDataStateView.tsx`) for every non-`ready` status (`loading`, `offline`, `no-folder`, `empty`, `error`). Pass an optional `loadingFallback` to keep a widget-specific skeleton; otherwise a simple shared loading placeholder is shown. **Ready** chart/table/KPI/dashboard/reports content stays in each panel component. Notes and Market Times do not use this boundary — they have no backend dataset.

---

## Wire Parquet / live data

### Settings pattern

1. `ParquetDataProvider` in `App.tsx` — global dataset catalog
2. `useWidgetParquetData(panelId)` or `useKpiCardData(panelId)` — per-instance data
3. `useParquetWidgetSettings({ headerSettings, ... })` — register header fields for this instance
4. `PanelHeaderControls` — renders fields when `headerSettings` has any flag set

| Setting | Used by |
|---------|---------|
| Dataset | Table, Chart, KPI, Dashboard, Reports |
| Time range | Table, Chart, KPI, Dashboard, Reports |
| Columns | Table |
| Metric | KPI |
| Aggregation | KPI |

Header controls:

- `HeaderSelect` — dataset, time range (`15m | 1h | 6h | 24h | 7d | All`), metric, aggregation
- `HeaderColumnsSelect` — table columns

### Data journey (recommended)

1. **Data source** → set Parquet folder
2. Registry refreshes automatically
3. Add a widget
4. Use the dropdowns in that widget's header
5. Choose dataset, range, and widget-specific fields

### Formatting

| Helper | Use |
|--------|-----|
| `formatTime.ts` | Epoch ms/s → `HH:mm`, `MM/DD HH:mm:ss` |
| `formatCellValue.ts` | Table cells, long id truncation |
| `formatKpi.ts` | KPI value, caption, change % |

---

## Built-in widgets

| Widget | id | Data hook | Header fields |
|--------|------|-----------|------------------|
| Notes | `notes` | `notesStorage` | — |
| Market Times | `market-times` | `marketSessions` lib | — |
| Data Table | `data-table` | `useWidgetParquetData` | dataset, range, columns |
| Chart | `chart` | `useWidgetParquetData` | dataset, range |
| KPI Card | `kpi-card` | `useKpiCardData` | dataset, range, metric, aggregation |
| Dashboard | `dashboard` | `useWidgetParquetData` | dataset, range |
| Reports | `reports` | `useWidgetParquetData` | dataset, range |

### KPI aggregations

`Last | Avg | Sum | Min | Max | Count | Change %` — computed server-side via `GET /api/datasets/{name}/kpi`.

---

## Semantic colors

| Token / class | Meaning |
|---------------|---------|
| `text-foreground` | Primary data |
| `text-muted-foreground` | Labels, secondary text |
| `text-bid` / `text-ask` | Buy / sell side |
| `text-up` / `text-down` | Positive / negative change |
| `text-long` / `text-short` | Position side |

Typography: Inter (theme default), `text-xs`, `tabular-nums` for numbers.

---

## Checklist

- [ ] Entry in `WIDGET_REGISTRY` with `grid.minW` / `grid.minH` and `headerSettings`
- [ ] Panel component accepts `WidgetInstanceProps`
- [ ] shadcn components; no hardcoded colors
- [ ] Per-widget state keyed by `panelId` (instance id) when `stateScope: 'instance'`
- [ ] No widget-specific shell chrome in `App.tsx`
