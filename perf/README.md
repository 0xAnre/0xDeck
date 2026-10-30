# Chart performance harness (Issue #200)

Reproducible before/after benchmark for the chart-interaction regression reported after PR #199
(`bb42a75`), plus the performance regression test that guards it.

The harness is **not** application code: it starts its own dev/preview servers, seeds a workspace and
mocks the backend. Nothing in `perf/` is imported by `src/`, and nothing it injects ships in a build.

## Run the regression test

```bash
npm run test:perf      # e2e/chart-perf.spec.ts only
npm run test:e2e       # the whole Playwright suite (includes the perf spec)
```

The spec pins two counters — no wall-clock budgets, so it cannot flake on a slow machine:

| counter | on `bb42a75` | on the fix |
| --- | --- | --- |
| `BtcPerpetualChartPanel` renders during one 24-step drag | ~250 | 0 (budget: ≤ 1) |
| `ChartPanel` / `DataTablePanel` renders during the same drag | 4 / 125 | 0 (budget: ≤ 1) |
| full-envelope `JSON.parse` calls during that drag | 1 | 0 (budget: 0) |

`src/lib/workspaceStorage.test.ts` → `save hot path` pins the same envelope-parse budget at the unit
level (`npm run test:ui`): 3 saves after this tab's own load parse the envelope 3 times on `bb42a75`,
0 times on the fix. The merge itself still runs on every save (it is what keeps a workspace another
tab created), it is only the `JSON.parse` of the stored payload that is skipped — the core caches the
parsed collection of the raw string it last read or wrote.

## Run the before/after benchmark

Two or three checkouts of the same repository, measured with the identical workload:

```bash
# throwaway checkouts of the revisions you want to compare against
# (`9976989` = last main before #199, `bb42a75` = the #199 merge)
git -C /path/to/0xdeck worktree add --detach /tmp/0xdeck-perf-9976989 9976989
git -C /path/to/0xdeck worktree add --detach /tmp/0xdeck-perf-bb42a75 bb42a75
cd /tmp/0xdeck-perf-9976989 && npm ci
cd /tmp/0xdeck-perf-bb42a75 && npm ci

# from the task worktree — three revisions, single-workspace payload
npm run perf:compare -- --before /tmp/0xdeck-perf-9976989 \
  --middle /tmp/0xdeck-perf-bb42a75 --after . \
  --labels 9976989,bb42a75,fix --repeats 3

# … and the multi-workspace payload (only revisions that can read the envelope)
npm run perf:compare -- --before /tmp/0xdeck-perf-bb42a75 --after . \
  --labels bb42a75,fix --workload multi --repeats 3

# per-component React commit attribution (dev server, production names are minified):
npm run perf:compare -- --before /tmp/0xdeck-perf-9976989 --after . --mode dev --repeats 3
```

`perf/compare.mjs` builds each checkout (`vite build`), starts `vite preview` on its own port, runs
the scenario suite `--repeats` times in headless Chromium and prints the median of every metric as a
markdown table (plus the CPU-profile hot functions of the median run). Options: `--mode prod|dev`,
`--workload single|multi`, `--middle`, `--labels`, `--repeats N`, `--skip-build`, `--out <dir>` (writes
`compare-<mode>-<workload>.{md,json}`). The delta column always compares the **last two** revisions.

Remove the `/tmp` worktrees when done (`git worktree remove --force /tmp/0xdeck-perf-9976989`).

Note: `perf/*.mjs` is a local, non-shipped harness — it is deliberately outside `tsconfig` and out of
the `**/*.{ts,tsx}` pattern in `eslint.config.js`, so `npm run build`/`npm run lint` do not check it.

Measuring a single server (e.g. an already running dev server):

```bash
npm run perf:measure -- --url http://localhost:5173/ --label after --out /tmp/perf/after.json
```

## Microbenchmark: what one layout save costs

The browser suite resolves the #199 persistence cost only down to "N `JSON.parse` calls per drag
stop" and whole-scenario script time, where panel re-rendering dominates. `perf/save-cost.mjs`
measures the save path itself (`read + parse + merge + re-serialize + write`) on a real-sized
envelope, without a browser (the persistence core is a pure module with an injected storage):

```bash
node --experimental-strip-types perf/save-cost.mjs --dir /tmp/0xdeck-perf-bb42a75
node --experimental-strip-types perf/save-cost.mjs --dir .                  # 46 840 B, the multi seed
node --experimental-strip-types perf/save-cost.mjs --dir . --target-bytes 16900  # the single seed
```

It grows the seeded envelope by cloning Workspace 1 until it reaches `--target-bytes` (default:
the 46 840 bytes the browser writes for `--workload multi`), then reports the median/p95 of 200
saves plus the median `JSON.parse` of the same envelope. Pre-#199 revisions have no
`src/lib/workspaceStorage.ts` (no envelope, no merge) and are not measurable this way.

## Workload (identical for both revisions)

Defined once in `perf/workload.mjs`:

- **Workspace seed, `--workload single` (default):** 6 panels — 2 × `btc-perpetual-chart`, 2 ×
  `chart` (Recharts), 1 × `data-table`, 1 × `kpi-card` — with a fixed 36-column lg layout. The seed is
  the **legacy** single-workspace `0xdeck-workspace` payload, which both revisions can read: `9976989`
  reads it directly, `bb42a75` migrates it to Workspace 1. Same bytes in, same 6 panels out.
- **Workspace seed, `--workload multi`:** a `version: 2` envelope with 5 workspaces / 23 panels —
  Workspace 1 is the 6-panel seed above, Workspaces 2–5 add chart, table and KPI panels (~47 KB of
  stored envelope instead of ~17 KB). Only Workspace 1 is rendered, so mount/drag/resize do the same
  work in both variants: the variant isolates the cost that scales with **envelope size × workspace
  count**, which is the dimension #199's parse + merge + re-serialize added. Pre-#199 revisions cannot
  read this payload (they only know the legacy single-workspace format), so the multi-workspace table
  compares `bb42a75` with the fix.
- **Widget settings:** dataset, time range, market interval/exchange and indicators are seeded per
  panel id (`0xdeck-widget-*`), including daily VWAP so the BTC panels take the `*-context` candle
  path.
- **API mock** (`page.route`, path-matched on `/api/`, and **not** on the dev server's `/src/api/…`):
  `/api/health`, `/api/datasets`, `/api/datasets/{name}/preview|series|schema|kpi`,
  `/api/market/binance/usdm/btcusdt/klines`, `/klines/{level}-context`, `/klines/history`,
  `/api/settings` and empty liquidation/account payloads. Candle and series data are deterministic
  (720 1-minute candles), so both runs render identical data. Requests the app makes are recorded and
  reported (`/api/market/.../klines/daily-context`: 1 per BTC panel — unchanged by the fix).
- **WebSocket stub:** the market stream is stubbed from an init script (opens, never sends), so a
  failing relay plus exponential reconnect backoff cannot add run-to-run timer noise.

## Scenarios and metrics

| scenario | how it is driven | metrics |
| --- | --- | --- |
| `mount` | `goto` → 6 `.react-grid-item` and ≥ 8 chart canvases present | in-page ms, long tasks, CDP task/script/layout/style, React commits |
| `drag` | 40 mouse moves (~2 s) on a panel header handle | frame pacing (fps, p95, worst frame, dropped > 25 ms / > 50 ms), long tasks, CDP deltas, React commits per component, `localStorage` + `JSON` traffic, sampling-profiler top functions |
| `dragStops` | 10 down/move/up cycles | wall time, long tasks, CDP deltas, commits, `localStorage`/`JSON` traffic |
| `resize` | 30 mouse moves on the `se` handle of a BTC chart panel | same as `drag` |

Instrumentation (`perf/workload.mjs`, injected with `addInitScript`, no app changes):

- `PerformanceObserver('longtask')` for main-thread blocking;
- a `requestAnimationFrame` sampler for frame pacing;
- `Storage.prototype.getItem/setItem` and `JSON.parse/JSON.stringify` wrappers that count calls and
  bytes, split by key/size so `0xdeck-workspace` envelope traffic is separable from per-widget keys;
- the React DevTools global hook: every commit walks the fiber tree and counts a fiber as rendered
  when its `memoizedProps` object differs from its alternate's (or it mounted), per component name.
  Component names survive in dev builds only, hence `--mode dev` for the attribution table.
- `console.timeStamp` is removed so React's dev-only DevTools user-timing track (which diffs the
  props of every rendered fiber per commit) does not dominate the dev numbers.

## Interpreting the tables

`localStorage` "envelope reads" being 0 on a pre-#199 revision is not a win: that revision wrote the
single-workspace payload blindly, so a stale tab could clobber another tab's data. From #199 on a
save reads the stored envelope to merge it; the fix keeps that read (a cheap synchronous `getItem`)
and the merge, and only caches the parsed collection so the envelope is not `JSON.parse`d again while
this tab is the last writer. The remaining per-stop envelope work is therefore one `getItem`, one
`JSON.stringify` of the merged envelope (unchanged by the fix) and — only when another tab wrote —
one `JSON.parse`.

`9976989` cannot read the multi-workspace envelope (it knows only the legacy single-workspace
payload and would fall back to its default workspace), so the `multi` table has no pre-#199 column:
#199 introduced the multi-workspace format that payload represents.
