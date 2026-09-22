# 0xDeck

A market research workspace canvas for building **reusable** custom trading and research widgets.

Start from a blank canvas. Add built-in panels. Create your own widgets — register once, add many instances, port from other projects.

![0xDeck workspace preview](docs/0xdeck-preview.png)

## Why this exists

Most market tools force a fixed workflow. 0xDeck gives you a surface you can reshape around your own research process.

## What you can build

- Research dashboards
- Strategy monitoring panels
- Bot control surfaces
- Dataset explorers
- Trade review workspaces
- Custom market workflows

## What you get

| Area | Details |
|------|---------|
| **Canvas** | Blank draggable workspace; resize, overlap, stack, and persist panels |
| **Backend** | FastAPI + DuckDB — flat `.parquet` files and nested **streams** (`trades`, `prediction_price`, …) |
| **Widgets** | Data Table, Chart, KPI Card, Dashboard, Reports (preview), Notes, Market Times |
| **Reusable widgets** | Register a template once in `panels.ts`; add many instances; each keeps its own config |
| **Custom widgets** | Add your own panels through the widget catalog and `PanelContent` router |
| **Data binding** | Per-widget dataset, columns, time range (`15m`–`7d`), KPI metric + aggregation |
| **Themes** | 5 shadcn presets — Neutral, Stone, Mauve, Taupe, Olive |
| **Persistence** | Workspace layout + widget config in `localStorage` (`0xdeck-*` keys) |

**Stack:** Vite · React 19 · TypeScript · Tailwind v4 · shadcn/ui · [react-grid-layout](https://github.com/react-grid-layout/react-grid-layout) v2 · FastAPI · DuckDB

The draggable canvas grid is built on **react-grid-layout** — drag, resize, overlap, and layout persistence all flow through it.

## Reusable widget model

Widgets are **templates + instances**:

- Register once in `src/panels.ts` → appears in the **Widgets** menu
- Each add creates a unique instance (`chart-a1b2c3`) with its own layout slot and settings
- Shell (title, header dropdowns, close, drag) is shared — you only build the **body**
- Port widget logic from another project: drop libs under `src/lib/`, add a `*Panel.tsx`, wire three files

See [docs/WIDGET-GUIDE.md](docs/WIDGET-GUIDE.md) for the full path.

## Create your own widget

Widget creation is intentionally small:

1. Add a template in `src/panels.ts`
2. Create a panel component, e.g. `src/MyWidgetPanel.tsx`
3. Route it in `src/PanelContent.tsx`

Use [docs/WIDGET-GUIDE.md](docs/WIDGET-GUIDE.md) as the main path for custom panels.

## Quick start

### 1. Frontend

```bash
git clone https://github.com/0xAnre/0xDeck.git
cd 0xDeck
npm install
npm run dev
```

Open [http://localhost:57341](http://localhost:57341).

### 2. Backend (Parquet data)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python scripts/generate_sample.py   # optional — writes data/sample/market_ticks.parquet
uvicorn app.main:app --reload --port 57342
```

### 3. Connect data in the UI

**Data source** → set your Parquet folder (absolute path) → **Save**. Registry refreshes automatically.

Add widgets, then use the header dropdowns on each panel to set dataset, columns, time range, and aggregation.

## Documentation

| Guide | Description |
|-------|-------------|
| [docs/README.md](docs/README.md) | Documentation index + typical workflows |
| [docs/WIDGET-GUIDE.md](docs/WIDGET-GUIDE.md) | Add widgets, wire live data, formatters |
| [docs/THEME-GUIDE.md](docs/THEME-GUIDE.md) | Themes, tokens, shell rules |
| [backend/README.md](backend/README.md) | API reference — preview, series, KPI, time range |
| [docs/NEXT-STEPS.md](docs/NEXT-STEPS.md) | Roadmap |
| [AGENTS.md](AGENTS.md) | Architecture + AI agent conventions |
| [docs/PRODUCT-POSITIONING.md](docs/PRODUCT-POSITIONING.md) | Product positioning + UX direction |

## Project layout

```
src/
  App.tsx                  Shell, grid, header
  panels.ts                Widget catalog + instance ids
  context/ParquetDataContext.tsx
  api/client.ts            Backend client
  *Panel.tsx               Widget bodies
backend/
  app/                     FastAPI + DuckDB
  scripts/generate_sample.py
docs/                      Guides (see docs/README.md)
```

## Key files

| File | Role |
|------|------|
| `src/layoutStorage.ts` | Workspace layout persistence |
| `src/datasetStorage.ts` | Per-widget dataset + column defaults |
| `src/timeRangeStorage.ts` | Per-widget time range |
| `src/kpiStorage.ts` | KPI metric + aggregation per widget |
| `backend/.canvas-state.json` | Parquet folder path (gitignored) |

## Credits

| Project | Role | License |
|---------|------|---------|
| [react-grid-layout](https://github.com/react-grid-layout/react-grid-layout) | Draggable, resizable widget grid | MIT |
| [shadcn/ui](https://ui.shadcn.com) | UI components | MIT |
| [Recharts](https://recharts.org) | Charts | MIT |

See `package.json` for the full dependency list. Third-party packages keep their original licenses.

## GitHub

Repository: [github.com/0xAnre/0xDeck](https://github.com/0xAnre/0xDeck)

Suggested **description**:

> A market research workspace canvas for building reusable market research widgets on a draggable canvas.

Suggested **topics**: `reusable-widgets`, `widget-canvas`, `market-research`, `react-grid-layout`, `parquet`, `shadcn-ui`, `fastapi`, `duckdb`

## License

**Non-commercial** — see [LICENSE](LICENSE).

- Personal, educational, and private research use: allowed
- Commercial use: requires written permission from the copyright holder
- No warranty
