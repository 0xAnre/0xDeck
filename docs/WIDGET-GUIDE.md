# Widget Guide

How to add or customize widgets in 0xDeck. Shell, grid, and themes: [THEME-GUIDE.md](./THEME-GUIDE.md). Backend API: [../backend/README.md](../backend/README.md).

0xDeck is widget-native: start with built-in panels, then add your own **reusable** market research widgets.

**Scope:** Widget **body** only — table, chart, KPI content. The shell (title bar, header dropdowns, close, resize) lives in `App.tsx` as a shadcn `Card` and is shared by all widgets.

---

## Reusable widget model

A widget is reusable in three ways:

| Concept | What it means |
|---------|----------------|
| **Template** | One entry in `PANEL_CATALOG` (`panels.ts`) — title, kind, default size |
| **Instance** | Each add from the Widgets menu → unique id (`chart-a1b2c3`), own settings and grid slot |
| **Portable** | Body + libs from another project; wire via `panels.ts` + `PanelContent.tsx` + `*Panel.tsx` |

Example: **Market Times** — session logic in `src/lib/marketSessions.ts`, body in `MarketTimesPanel.tsx`, no backend required.

Rules:

- Register the template once; users can add as many instances as they need
- Key per-instance state by `panelId` (dataset, range, KPI config)
- Do not duplicate shell chrome in widget bodies
- Prefer shadcn semantic tokens over hardcoded colors when porting CSS

---

## Anatomy

| Layer | File | Responsibility |
|-------|------|----------------|
| Shell | `src/App.tsx` | shadcn `Card` — title, header dropdowns, close, drag/resize |
| Router | `src/PanelContent.tsx` | `switch (kind)` → panel component |
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

- `PANEL_CATALOG` in `panels.ts` — templates (`chart`, `data-table`, …)
- Each added widget gets a **unique instance id** (`chart-a1b2c3`) via `createPanelInstance()`
- **Widgets** menu → pick type → **adds** a new instance
- Panel **X** → removes that instance
- Layout `i` field = instance id

---

## Add a new widget

The happy path is three files:

1. `src/panels.ts`
2. `src/MyWidgetPanel.tsx`
3. `src/PanelContent.tsx`

### 1. Register template in `src/panels.ts`

```ts
export type PanelKind = 'data-table' | 'mywidget' // …

export const PANEL_CATALOG: PanelDef[] = [
  {
    id: 'mywidget',        // template id (also kind prefix)
    title: 'My Widget',
    hint: 'Optional subtitle',
    kind: 'mywidget',
    grid: { x: 0, y: 0, w: 6, h: 6, minW: 6, minH: 6 },
  },
]
```

- `minW` × `minH` — minimum size **and** default open size
- lg grid: 36 columns, `rowHeight` 11px → height ≈ `h × 11px`

### 2. Create panel component

Add `src/MyWidgetPanel.tsx` and route in `PanelContent.tsx`:

```tsx
case 'mywidget':
  return <MyWidgetPanel panelId={panelId} />
```

Use an exhaustive `default` with `never`.

### 3. Widget picker

`WidgetSelect.tsx` reads `PANEL_CATALOG` — new templates appear automatically in the add menu.

---

## Wire Parquet / live data

### Settings pattern

1. `ParquetDataProvider` in `App.tsx` — global dataset catalog
2. `useWidgetParquetData(panelId)` or `useKpiCardData(panelId)` — per-instance data
3. `useParquetWidgetSettings({...})` — register which header fields this instance shows
4. `PanelHeaderControls` — renders those fields when the kind is configurable

Data widgets call `useParquetWidgetSettings`. Defaults come from `WIDGET_SETTINGS_FIELDS_BY_KIND`:

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

Add `panel.kind` to `CONFIGURABLE_PANEL_KINDS` in `panels.ts` to show `PanelHeaderControls` in the header. Notes and Market Times are not in that set.

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

| Widget | kind | Data hook | Header fields |
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

- [ ] `PanelKind` union updated in `panels.ts`
- [ ] Entry in `PANEL_CATALOG` with `minW`/`minH`
- [ ] Panel component + `case` in `PanelContent.tsx`
- [ ] shadcn components; no hardcoded colors
- [ ] Per-widget state keyed by `panelId` (instance id)
- [ ] No widget-specific shell chrome in `App.tsx`
