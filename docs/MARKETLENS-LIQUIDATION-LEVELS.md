# Live liquidation levels (MarketLens Hyperliquid L4)

Opt-in **Liquidation Levels** indicator on the BTC Perpetual chart: a current profile of
**open-position liquidation prices** drawn on the candle pane, sourced from MarketLens' public
Hyperliquid L4 `liquidations` WebSocket.

It is **not** executed liquidation history. An event pane such as **Aggregated Liquidations** shows
liquidations that happened; this profile shows where open positions *would* be liquidated right now.
The two are independent and can be enabled together.

## Source and semantics

| Item | Value |
|------|-------|
| Endpoint | `wss://api.marketlens.app/data/hyperliquid/l4/liquidations/BTC` |
| Payload | one Snappy-compressed Parquet file per binary WebSocket message |
| Public docs | <https://marketlens.app/api/l4/> |
| Exchange scope | **Hyperliquid BTC only**. The indicator is disabled with explicit wording on Binance; it never renders Hyperliquid numbers on a Binance chart. |
| Row meaning | one open position with a liquidation price, keyed by the account address: `price` (liquidation price), `size` (signed; positive long, negative short), `ts` |
| File head | Parquet key-value metadata: `snapshot` (`true`/`false`), `channel`, `coin`, `epoch`, `seq`, `ts` |
| Snapshot | replaces the whole book. Its `seq` is the producer's current counter and is **not** necessarily 0 (the live stream has been observed around 28 356 and 44 800), so the next delta continues from it. |
| Delta | a row with only its key removes that position; removals come first, then upserts. `seq` must be exactly the last applied one + 1. |
| Epoch / gap | a delta from another epoch, or with a `seq` gap, means the book can no longer be trusted: the book is cleared immediately and the socket reconnects for a fresh snapshot. |
| Ping/pong | a text frame `{"ping": n}` is answered with `{"pong": n}`. Pings count as activity but never as data. |
| Freshness | no data for 6 s → `stale`; no frame (not even a ping) for 30 s → reconnect with exponential backoff (500 ms → 15 s, ±20 % jitter). |

The panel shows the state instead of lying about it: `LEV LIQ · LIVE <n>s ago`, `LEV LIQ · SYNCING`,
`LEV LIQ · STALE <n>s` are painted at the top of the bar column, and the notice row adds
"connecting / reconnecting / stale — last update HH:MM:SS / resyncing for a fresh snapshot" as
needed. A profile is never left on screen after a reset: the reset clears the book before the
reconnect.

## Rendering contract

- Bars are anchored to the **right edge of the candle pane's plot area** and always extend **left**;
  they are never drawn in the browser window, the RSI pane or the Aggregated Liquidations pane.
- Long positions (positive size) are **green** `#22C55E`, short positions (negative size) are **red**
  `#EF4444` — the shared semantic pair (`marketSemanticColors.ts`) — at 60 % opacity by default.
- Both sides share **one magnitude scale**: the largest single-side row in view is full bar extent
  (default 25 % of the plot width), every other row is proportional. Equal bar length means equal
  open size on either side.
- Bars sit at their **liquidation price** on the candle price scale. Pan, zoom, fractional logical
  offsets, resize, pane reordering and manual price-range drags all move them because every paint
  rebuilds the price→row conversion from the chart's current state — no coordinate is cached across
  frames.
- The profile is a **current** profile: panning to old candles keeps showing today's book. The
  on-chart label says so (`LEV LIQ · LIVE`), there is no fake time axis for it and no candle data is
  written.
- The primitive reports **no `autoscaleInfo`**: it never expands or distorts the candle price scale.
- Prices are never clamped or invented; a position that is off-screen is simply not drawn.

## Cost model

- The book (≈ 32 k positions on the live BTC stream) is kept in a **price index**
  (`liquidationLevelsIndex.ts`): a price-sorted array rebuilt lazily, at most once per read after the
  book changed. That is price-domain derived state on stream updates, which the project performance
  contract allows; it is never rebuilt per paint when the book did not change.
- A paint binarizes only the **visible price band** (binary search into the index) into **one row per
  CSS pixel** of the candle pane (capped at 2 000 rows), so per-paint work is bounded by the pane
  height and the positions inside the visible band — not by the book size and not by loaded candle
  history.
- There is **no native series per row** and no series at all: the profile is one series primitive
  attached to the existing candle series.
- `updateAllViews()` is view-only (no `requestUpdate`, no timer, no `setData`). One request per
  explicit external change: a new file, a settings or visibility change, a status change, a
  selection change. Pan/zoom/resize/manual scale repaint through the library's own passes.
- `detached()` clears chart/series/request references, so disposal stops scheduling. A stopped feed
  invalidates in-flight decodes by generation, so old async work cannot resurrect a disposed panel.
- The first snapshot is a ~1 MB Parquet file; decoding it is a one-time connect cost (bounded,
  ordered, off the render path), not a per-frame cost.

## Sharing and lifecycle

- One **ref-counted** feed for the whole page: the first enabled supported panel opens the socket,
  the last one closes it. Two panels on different intervals or exchanges (as long as both are
  Hyperliquid) share one connection.
- Binary files are decoded **strictly in arrival order** through one promise chain, so a delta can
  never be applied before the snapshot it follows.
- A backlog beyond 24 queued files is dropped and turned into an explicit resync instead of an
  unbounded queue (which could also hide a gap).
- Data listeners fire **once per applied file**, never once per position; React state changes only on
  phase/attempt/resync/error and on the book size/sequence, so no component re-renders per row.

## Settings and persistence

| Field | Default | Control |
|-------|---------|---------|
| Long color / opacity | `#22C55E` / 60 % | shared `ColorOpacityField` |
| Short color / opacity | `#EF4444` / 60 % | shared `ColorOpacityField` |
| Max bar width | 25 % of the pane plot width (5–100) | numeric field, bar extent — not a stroke width |

- Stored per panel instance under `0xdeck-widget-liquidation-levels-settings`
  (`src/liquidationLevelsSettingsStorage.ts`), sanitized by `sanitizeLiquidationLevelsSettings`
  (`src/market/liquidationLevelsSettings.ts`); an invalid field falls back per field.
- The opt-in itself is the existing per-panel indicator list (`0xdeck-widget-market-indicators`), so
  it follows workspace/panel persistence and defaults **OFF**.
- The dialog is the shared shadcn `Dialog` with draft → `Save`; `Cancel`, `X`, `Esc` and outside
  click discard the draft. It opens from the Indicators menu gear and from a double click on the
  bars, through the shared `ChartObjectSettingsTarget`.

## Interactions

- **Hover** a row for the price band, both sides' open size, the number of positions and the source
  plus last-update time. Hovering the bars never blocks pan, zoom, crosshair or a drawing tool.
- **Single click** selects the profile (transient halo drawn by the primitive itself, in its own
  colors); outside click or `Esc` releases it.
- **Double click** opens the settings dialog.
- No drag/resize handles, lock or delete: the profile owns no movable geometry — it is an overlay
  indicator with hit-testable bars, not a drawing.

## Reuse from PR #279 and shared-module convergence

The transport/protocol/Parquet-decode semantics were authored in PR #279
(`experiments/liquidations-l4/src/{protocol,client,decode}.ts` at
`25b6b4dbe6f913a3f8b794e77770ea4035a5b8b6`) as a standalone demo. This feature re-derives them as
normal application modules so the chart integration is an independent, main-targeted PR:

| PR #279 file | This PR module |
|--------------|----------------|
| `experiments/liquidations-l4/src/protocol.ts` | `src/market/liquidationLevelsProtocol.ts` (+ adapted `liquidationLevelsProtocol.test.ts`) |
| `experiments/liquidations-l4/src/client.ts` | `src/market/liquidationLevelsStreamClient.ts` (+ adapted `liquidationLevelsStreamClient.test.ts`) |
| `experiments/liquidations-l4/src/decode.ts` | `src/market/liquidationLevelsDecode.ts` |

Both PRs add the MIT-licensed `hyparquet` dependency (`^1.33.2`); whichever merges first, the other
rebases without a conflict in behaviour. The demo's canvas ladder, `style.css`, standalone Vite
config and experiment page are **not** reused: the chart integration paints through the official
Lightweight Charts primitive API on the candle pane. Follow-up (not part of either PR): once #279 is
merged or closed, decide whether the standalone experiment should import these modules instead of
keeping its own copies.

## Verification

- `src/market/liquidationLevelsProtocol.test.ts` — snapshot/sequence/epoch/gap/removal semantics
  (adapted from #279).
- `src/market/liquidationLevelsStreamClient.test.ts` — ping/pong, stale/dead watchdogs, backoff,
  immediate reconnect, teardown (adapted from #279).
- `src/market/liquidationLevelsIndex.test.ts` — range queries, totals, delta/removal/reset, revision.
- `src/market/liquidationLevelsProfileGeometry.test.ts` — shared scale, row/price mapping, visible
  band bound, row cap, right-anchored hit test.
- `src/market/liquidationLevelsFeed.test.ts` — one socket for many consumers, ordered decoding,
  non-zero snapshot seq, gap/epoch reset, duplicate deltas, decode errors, no revival after stop.
- `src/market/liquidationLevelsSeriesPrimitive.test.ts` — request counting (idle zero, one per
  external change, none from a view pass), draw counting, DPR bitmap geometry, disposal.
- `src/market/liquidationLevelsSettings.test.ts` — sanitizer and per-panel storage.
- `src/market/liquidationLevelsNotice.test.ts` — honest stale/unsupported/error wording.
- `e2e/liquidation-levels-primitive.spec.ts` (+ `-dpr2.spec.ts`) — real installed 5.2.0 library:
  idle quiescence, one request per change, pan/manual scale/resize/reorder alignment, selected halo,
  DPR 2 real bitmap ratio.
- `e2e/liquidation-levels-app.spec.ts` — real public feed in the app: opt-in default OFF, one shared
  socket for two panels, live snapshot + moving server sequence, painted profile pixels, hover
  details, per-panel persistence and reload, disconnect on the last consumer, explicit Binance
  unavailability (candles are mocked for deterministic geometry; the liquidation feed is real).

## Limitations

- Hyperliquid BTC only, by design. There is no browser-side history or replay: the profile is the
  live book, and it says so.
- The feed is an external public endpoint. If it is unreachable the panel says so and draws nothing;
  it never invents or reuses a stale book.
- Prices are shown as published, including extreme liquidation prices far from the mark; a position
  is drawn only when its price is inside the visible price band.
- The RSI/Aggregated-Liquidations pane layouts, FRVP, Rolling/Anchored VWAP, drawings, candle colors
  and viewport persistence are unchanged by this feature.
