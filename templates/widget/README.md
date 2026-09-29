# Widget starter template

Copy-paste starting point for a new 0xDeck widget. Normative rules: [docs/WIDGET-STANDARD.md](../../docs/WIDGET-STANDARD.md). Wiring details: [docs/WIDGET-GUIDE.md](../../docs/WIDGET-GUIDE.md).

## Steps

1. Copy `WidgetPanel.tsx` into `src/` with a meaningful name (e.g. `src/MyWidgetPanel.tsx`).
2. Rename the component and update the body.
3. Import the component in `src/widgets/registry/definitions.tsx` and append a definition to `WIDGET_REGISTRY`.
4. Adjust `grid`, `headerSettings`, `stateScope`, and `data` as needed.
5. Run `npm run build` and `npm run lint`.

## Registry snippet

Defaults: instance scope, no data hooks, no header controls.

```tsx
import { MyWidgetPanel } from '@/MyWidgetPanel'

// Inside WIDGET_REGISTRY:
{
  id: 'my-widget',
  title: 'My Widget',
  description: 'Short hint',
  component: MyWidgetPanel,
  grid: { x: 0, y: 0, w: 8, h: 8, minW: 6, minH: 6 },
  headerSettings: {
    dataset: false,
    timeRange: false,
    columns: false,
    metric: false,
    aggregation: false,
    interval: false,
  },
  stateScope: 'instance',
  data: { kind: 'none' },
},
```

## When you need data

- **REST** — set `data: { kind: 'rest', queries: ['preview'] }` (or `series`, `schema`, `kpi`); wire hooks per [WIDGET-GUIDE.md](../../docs/WIDGET-GUIDE.md); use `WidgetDataStateView` for non-ready states.
- **Stream (future)** — `data: { kind: 'stream', channel: 'your.channel' }` and `WidgetStreamClient` in [src/widgets/stream/](../../src/widgets/stream/); no live widget uses this yet.

This template does not include REST or WebSocket code.
