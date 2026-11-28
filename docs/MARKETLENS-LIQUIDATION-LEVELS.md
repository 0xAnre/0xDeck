# Live price levels: liquidation, stop loss and take profit (MarketLens Hyperliquid L4)

Three independent opt-in indicators on the BTC Perpetual chart, drawn with one shared right-anchored,
leftward bar profile on the candle pane:

| Indicator | Source | What a row is |
|-----------|--------|---------------|
| **Liquidation Levels** | `…/l4/liquidations/BTC` (own socket) | an open position at its liquidation price, sized by the position |
| **Stop Loss Levels** | `…/l4/tpsl/BTC`, channel `stop_losses` | a resting stop-loss order at its trigger price, sized by the position it would close |
| **Take Profit Levels** | `…/l4/tpsl/BTC`, channel `take_profits` | a resting take-profit order at its trigger price, sized by the position it would close |

They are **not** executed liquidation history and not filled orders. An event pane such as
**Aggregated Liquidations** shows liquidations that happened; these profiles show what is waiting
*right now*: open positions at their liquidation price, and resting trigger orders at their trigger
price. The three are independent (own toggle, own settings, own storage) and can be enabled together.

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
needed. The label is painted even when the visible price window holds no positions, so an empty
window reads as "live profile, nothing at this price" instead of an indicator that looks off.

A **protocol reset** (gap, epoch change, protocol error, delta before a snapshot) clears the book
*before* the reconnect, so untrustworthy liquidity is never drawn. A **socket-level reconnect**
(close, error, dead watchdog) keeps the last applied book on screen — labelled `SYNCING`, with the
notice naming the reconnect — until the fresh snapshot replaces it.

## Trigger orders (TPSL): `stop_losses` / `take_profits`

One public socket — `wss://api.marketlens.app/data/hyperliquid/l4/tpsl/BTC` — multiplexes **two
independent channels**, each with its own `snapshot`, `epoch` and delta `seq`:

| Item | Value |
|------|-------|
| Row | `id` (unsigned 64-bit order id, kept as a **decimal string**), `ts`, `price` (trigger price), `size`, `user`, `position_size` |
| Key | the order `id`. A row carrying only its key removes that order; the same id in the two channels is two different orders. |
| `size` | **signed** like the closing order: negative = sell (closes a long), positive = buy (closes a short). `size === 0` means **whole position** — it is a real order, never a deletion. A non-zero size is a fixed order that closes at most its size. |
| `position_size` | the trader's position that order would close, signed the same way; `0` when there is none on the side it closes, null on removal rows. |
| Effective size (bar magnitude) | `size === 0 ? |position_size| : min(|size|, |position_size|)`, **0** when `position_size` is 0 or missing — no covered position, no bar. |
| Side (bar color) | from `position_size`: negative → **closes a long** (a sell, green like the long side), positive → **closes a short** (a buy, red). `0`/missing → no covered side, no bar. |
| Snapshot `seq` | adopted as published — the live stream sends non-zero counters (observed `stop_losses` 15 272 / `take_profits` 11 758); the next delta continues from it. |
| Ordering | both channels' files arrive on one connection and are decoded strictly in arrival order; a reset clears only the failing channel. |
| Sharing | one socket for both indicators and every panel that enables either; enabling stop loss and take profit together opens **one** TPSL socket. The liquidation profile keeps its own separate socket. |

Verified against live Parquet bytes (2026-11-28, BTC): schema `id INT64` (hyparquet yields **bigint**),
`ts INT64`, `price`/`size`/`position_size` `DECIMAL(18, s)` (BTC: 1 price decimal, 5 size decimals),
`user` `FIXED_LEN_BYTE_ARRAY(20)`; 18 172 priced orders across the two snapshots, of which 5 811 had
`size === 0` (whole position), 1 399 had `position_size === 0` (no covered position), 292 were fixed
orders whose covered position was smaller than the order size, and `sign(size)` never disagreed with
`sign(position_size)`. Removal rows carry only `id` (all other columns null).

**Terminology.** The two trigger-order profiles label their sides by the **position the order would
close** — `Closes long (sell)` / `Closes short (buy)` — because the source signs `position_size` like
the closing order. The liquidation profile keeps its own wording (`Long` / `Short`) because its rows
are positions. This is documented, not a blind copy: the same `position_size < 0` means "closes a
long" here, while a negative liquidation `size` means "short position".

**Bar magnitude is the position-covered size**, not the raw order size: a fixed order asking for
5 BTC against a 0.4 BTC position contributes 0.4, and an order with no covered position contributes
nothing. The hover readout shows the requested size next to the covered size whenever they differ.
Trigger orders are not guaranteed executable liquidity and the tooltip never claims that.

## Rendering contract

- Bars are anchored to the **right edge of the candle pane's plot area** and always extend **left**;
  they are never drawn in the browser window, the RSI pane or the Aggregated Liquidations pane.
- Long positions (positive size) are **green** `#22C55E`, short positions (negative size) are **red**
  `#EF4444` — the shared semantic pair (`marketSemanticColors.ts`) — at 60 % opacity by default. The
  two trigger-order profiles use the same pair for "closes a long" (green) and "closes a short" (red)
  and can be restyled independently.
- Both sides share **one magnitude scale**: the largest single-side row in view is full bar extent
  (default 25 % of the plot width), every other row is proportional. Equal bar length means equal
  open size on either side.
- A row can hold both sides when one pixel row spans both clusters. The longer side paints first and
  the second side is drawn at half alpha on top, so the overlap reads as **both** sides instead of
  hiding one; on an equal-width row the result is a 50/50 blend of green and red.
- Bars sit at their **price on the candle price scale** (liquidation price, or trigger price for the
  two order profiles). Pan, zoom, fractional logical
  offsets, resize, pane reordering and manual price-range drags all move them because every paint
  rebuilds the price→row conversion from the chart's current state — no coordinate is cached across
  frames.
- The profile is a **current** profile: panning to old candles keeps showing today's book. The
  on-chart label says so (`LEV LIQ · LIVE`), there is no fake time axis for it and no candle data is
  written.
- The primitive reports **no `autoscaleInfo`**: it never expands or distorts the candle price scale.
- Prices are never clamped or invented; a position that is off-screen is simply not drawn.

## Several profiles at once

All three profiles share the same right anchor and the same candle price scale, so they overlap by
design. The render/hit contract is deterministic:

- **Paint order** is fixed: liquidation (bottom), stop loss, take profit (top). Each profile has its
  own status label line at the top of the column (LIQ, SL, TP), stacked by kind, so three enabled
  profiles never fight over one status line.
- **Hit order** is the reverse (take profit, stop loss, liquidation): a pointer resolves the profile
  that is painted on top at that price row. Every profile also keeps its own header gear row, so a
  profile hidden behind a longer bar is still reachable for settings.
- **No cross-type scale claim.** Each profile normalises its **own** largest visible row to the full
  bar extent: bar lengths compare rows *within one profile*, never liquidation size against order
  size. The dialog and the README say so; there is no shared "BTC liquidity" unit across types.

## Cost model

- The book (≈ 32 k positions on the live BTC stream) is kept in a **price index**
  (`liquidationLevelsIndex.ts`): a price-sorted array rebuilt lazily, at most once per read after the
  book changed. That is price-domain derived state on stream updates, which the project performance
  contract allows; it is never rebuilt per paint when the book did not change.
- A paint binarizes only the **visible price band** (binary search into the index) into **one row per
  CSS pixel** of the candle pane (capped at 2 000 rows), so per-paint work is bounded by the pane
  height and the positions inside the visible band — not by the book size and not by loaded candle
  history. When the cap applies (a pane taller than 2 000 CSS px), the row height grows to
  `paneHeight / rowCount` instead of shrinking the covered price range, so the bottom of the pane
  stays aligned with the bottom price row for painting *and* hit testing.
- There is **no native series per row** and no series at all: the profile is one series primitive
  attached to the existing candle series.
- `updateAllViews()` is view-only (no `requestUpdate`, no timer, no `setData`). One request per
  explicit external change: a new file, a settings or visibility change, a status change, a
  selection change. Pan/zoom/resize/manual scale repaint through the library's own passes.
- `detached()` clears chart/series/request references, so disposal stops scheduling. A stopped feed
  invalidates in-flight decodes by generation, so old async work cannot resurrect a disposed panel.
- The first snapshot is a ~1 MB Parquet file; decoding it is a one-time connect cost (bounded,
  ordered, off the render path), not a per-frame cost. The TPSL snapshots are ~8 200 stop orders and
  ~11 000 take-profit orders; each applied file rebuilds that channel's price index (sort of the
  channel's orders) and never touches the sibling channel or the liquidation feed.

## Sharing and lifecycle

- One **ref-counted** feed per endpoint for the whole page: the first enabled supported panel opens
  the liquidation socket, the first stop-loss *or* take-profit consumer opens the TPSL socket, and
  the last consumer of each closes it. Two panels on different intervals share one connection; the
  TPSL subscription set is independent of which sibling is enabled, so toggling stop loss off never
  reconnects (or closes) the socket take profit is using.
- Binary files are decoded **strictly in arrival order** through one promise chain, so a delta can
  never be applied before the snapshot it follows.
- A backlog beyond 24 queued files is dropped and turned into an explicit resync instead of an
  unbounded queue (which could also hide a gap).
- Data listeners fire **once per applied file**, never once per position; React state changes only on
  phase/attempt/resync/error and on the book size/sequence, so no component re-renders per row.

## Settings and persistence

| Field | Default | Control |
|-------|---------|---------|
| Long color / opacity (LIQ) / "closes long" color / opacity (SL, TP) | `#22C55E` / 60 % | shared `ColorOpacityField` |
| Short color / opacity (LIQ) / "closes short" color / opacity (SL, TP) | `#EF4444` / 60 % | shared `ColorOpacityField` |
| Max bar width | 25 % of the pane plot width (5–100) | numeric field, bar extent — not a stroke width |

- Stored per panel instance and per profile, sanitized by `sanitizeLiquidationLevelsSettings`
  (`src/market/liquidationLevelsSettings.ts`); an invalid field falls back per field. The
  liquidation record keeps its historical key and defaults; the two new profiles use their own keys:

| Profile | Storage key |
|---------|-------------|
| Liquidation Levels | `0xdeck-widget-liquidation-levels-settings` (unchanged) |
| Stop Loss Levels | `0xdeck-widget-stop-loss-levels-settings` |
| Take Profit Levels | `0xdeck-widget-take-profit-levels-settings` |
- Each opt-in is the existing per-panel indicator list (`0xdeck-widget-market-indicators`), so all
  three follow workspace/panel persistence and default **OFF**; one can be enabled without the
  others.
- The dialog is the shared shadcn `Dialog` with draft → `Save`; `Cancel`, `X`, `Esc` and outside
  click discard the draft. It opens from the Indicators menu gear and from a double click on the
  bars, through the shared `ChartObjectSettingsTarget`.

## Interactions

- **Hover** a row for the price band, both sides' open size, the number of positions and the source
  plus last-update time. Hovering the bars never blocks pan, zoom, crosshair or a drawing tool.
  Cost: a crosshair move **inside the bar column** re-derives the visible-band profile once (the same
  bounded derivation as one paint, bounded by pane rows and visible positions); moves outside the
  column are rejected by the cheap x/extent check without deriving anything. This is accepted,
  bounded hover cost, not a measured or gated frame budget.
- **Single click** selects the profile under the pointer (transient halo drawn by the primitive
  itself, in its own colors); outside click or `Esc` releases it.
- **Double click** opens that profile's settings dialog; each profile also has its own gear row.
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
- `src/market/liquidationLevelsNotice.test.ts` — honest stale/unsupported/error wording per profile.
- `src/market/tpslProtocol.test.ts` — TPSL rows: bigint/string order ids, key-only removal vs
  `size === 0` whole-position, fixed/covered bounds, missing/zero position, side signs, per-channel
  snapshots with non-zero seq, same id in both channels, gap/epoch/foreign-channel resets.
- `src/market/tpslLevelsFeed.test.ts` — one socket for both channels, interleaved files, per-channel
  reset without touching the sibling, uncovered orders kept out of the painted index, duplicate /
  foreign / out-of-order files, no resurrection after stop.
- `src/market/priceLevelsHitPriority.test.ts` — kind mapping, paint/hit order, per-kind storage keys,
  top-most profile resolution and fall-through.
- `e2e/liquidation-levels-primitive.spec.ts` (+ `-dpr2.spec.ts`) — real installed 5.2.0 library:
  idle quiescence, one request per change, pan/manual scale/resize/reorder alignment, selected halo,
  DPR 2 real bitmap ratio.
- `e2e/price-levels-app.spec.ts` — real public feeds in the app: all three profiles opt-in and
  default OFF, **one socket per endpoint** (liquidation + TPSL) for one or two panels, both TPSL
  channels with their own advancing sequences, painted profile pixels, hover readout naming the
  resolved profile type, per-profile settings dialogs/storage, reload, sibling kept alive when one
  trigger-order profile is turned off, sockets closed after the last consumer, explicit Binance
  unavailability (candles are mocked for deterministic geometry; both streams are real).

## Limitations

- Hyperliquid BTC only, by design. There is no browser-side history or replay: the profiles are the
  live books, and they say so.
- Trigger orders are waiting orders, not fills: the bar is the position-covered size, not guaranteed
  executable liquidity, and the source does not promise every order can execute at its trigger price.
- The feed is an external public endpoint. If it is unreachable the panel says so and draws nothing;
  it never invents or reuses a stale book.
- Prices are shown as published, including extreme liquidation prices far from the mark; a position
  is drawn only when its price is inside the visible price band.
- The RSI/Aggregated-Liquidations pane layouts, FRVP, Rolling/Anchored VWAP, drawings, candle colors
  and viewport persistence are unchanged by this feature.
