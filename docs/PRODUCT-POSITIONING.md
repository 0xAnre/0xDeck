# Product Positioning

## Core Position

**Market research workspace canvas**

0xDeck is not primarily a trading terminal. It is a research-first canvas for building custom market workspaces.

The product gives users a blank surface where they can place, arrange, and combine widgets related to market research, trading workflows, datasets, notes, charts, KPIs, bots, and analytics.

## Product Identity

- Research-first
- Widget-native
- **Reusable widgets** — template once, many instances, portable across projects
- Trading-aware
- Canvas-based
- Customizable by default

## Main Promise

Start from a blank canvas, add built-in widgets, or create your own reusable panels.

## Reusable widget model

**Reusable widget** means three things in this project:

1. **Template** — one catalog entry in `panels.ts` (`chart`, `market-times`, …)
2. **Instances** — each add from the Widgets menu creates a unique id (`chart-a1b2c3`) with its own config and layout slot
3. **Portable** — widget body + libs can be brought from another project; shell and grid stay in `App.tsx`

Messaging hierarchy:

| Layer | Phrase |
|-------|--------|
| Hero | market research workspace canvas |
| Product | custom widgets · built-in widgets |
| Technical | reusable widget model |

Do **not** replace the hero with “reusable widget” alone — use it as a supporting keyword in README, docs, and GitHub topics.

## Short Messaging

- Build your own market workspace.
- A market research workspace canvas.
- Bring your own trading and research widgets.
- Reusable widgets — register once, add many instances.
- One canvas for charts, KPIs, notes, datasets, and workflows.

## GitHub / README Direction

Use this framing instead of "trading terminal shell":

> A market research workspace canvas for building reusable custom trading and research widgets.

Support it with:

- Built-in widgets for common workflows
- **Reusable widget model** — template + instances + portable bodies
- Easy custom widget creation (3-file flow)
- Local Parquet data layer
- Persistent draggable canvas layout
- shadcn themes and UI components

## README Structure

### Hero

```md
# 0xDeck

A market research workspace canvas for building reusable custom trading and research widgets.

Start from a blank canvas. Add built-in panels. Create your own widgets — register once, add many instances, port from other projects.
```

### Why this exists

Most market tools force a fixed workflow.

0xDeck gives users a surface they can reshape around their own research process.

### What you can build

- Research dashboards
- Strategy monitoring panels
- Bot control surfaces
- Dataset explorers
- Trade review workspaces
- Custom market workflows

### Built-in widgets

- Chart
- KPI Card
- Data Table
- Notes
- Market Times
- Reports
- Dashboard

### Reusable widget model

- **Template** in `src/panels.ts` — defines kind, title, default size
- **Instance** per add — unique id, own settings, own grid slot
- **Body only** — shared Card shell in `App.tsx`; widget code lives in `*Panel.tsx`
- **Portable** — bring libs + panel from another repo (e.g. Market Times from a prior terminal project)

### Create your own widget

The docs should make widget creation feel simple:

- Add a widget definition in `src/panels.ts`
- Add a panel component
- Route it in `src/PanelContent.tsx`
- Use built-in data hooks if needed

Link to `docs/WIDGET-GUIDE.md` from this section.

## Technical Reinforcement

This positioning should be visible in the code and docs, not only in marketing text.

Planned reinforcement:

- Make `docs/WIDGET-GUIDE.md` the central guide
- Add a clear "Create your own widget" path
- Emphasize the 3-file widget flow:
  - `src/panels.ts`
  - `src/PanelContent.tsx`
  - `src/*Panel.tsx`
- Consider a future `src/widgets/` structure
- Add starter widget templates
- Add widget gallery / examples
- Add research workflow examples

## Widget Configuration UX

Data widget settings are the dropdowns in the widget header (`PanelHeaderControls`).

`CONFIGURABLE_PANEL_KINDS` (`chart`, `dashboard`, `data-table`, `kpi-card`, `reports`) show the fields registered by `useParquetWidgetSettings`. Notes and Market Times do not.

### Settings in the header

- Dataset — `HeaderSelect`
- Columns — `HeaderColumnsSelect` (Data Table)
- Time range — `HeaderSelect` (`15m` through `All`)
- Metric — `HeaderSelect` (KPI)
- Aggregation — `HeaderSelect` (KPI)

Not every widget shows every control. The set comes from `WIDGET_SETTINGS_FIELDS_BY_KIND`.

### UX rules

- Settings for a data widget stay in that widget's header
- **Data source** remains a separate global dialog
- Saving the folder refreshes the registry automatically

## Roadmap Ideas

- Blank widget template
- Widget scaffold guide
- Widget gallery
- Research workflow examples
- Bot monitor widget example
- Strategy notebook widget
- Saved query / report widget
- Plugin-like widget folder structure
- README positioning refresh
- GitHub description/topics refresh (`reusable-widgets`, `widget-canvas`, `market-research`)
- Widget-first docs index
- Example custom widget walkthrough

## Working Rule

The product should feel like a useful market research canvas first, with trading workflows as the strongest default use case.
