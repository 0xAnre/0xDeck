# Chart object performance audit and inventory

Status: **audit + documentation**. This page records what every current BTC Perpetual chart
object costs, where the cost comes from in the source, which numbers are measured and which are
still unmeasured. It does not change chart code, and it does not promote any measurement into a
universal budget. The normative rules this audit feeds are in
[CHART-OBJECT-STANDARD.md](./CHART-OBJECT-STANDARD.md#performance-and-cost-contracts-must).

## Scope and provenance

| Item | Value |
|------|-------|
| Audited base | `origin/main` = `6544e96bf6e44c093e0acf574d2bc9d8e7b87ee6` (merge of #263) |
| Installed chart library | `lightweight-charts` **5.2.0** (`node_modules/lightweight-charts/package.json`), typings read from `dist/typings.d.ts` |
| Production state | main/live is the base above; the production `index.html` checksum recorded for it is `230de606fa7adb708361efdd7735647ce46ae9ed50012b868a546716d8eaf572` |
| Not live | #264 (inactive-indicator/history-application work) and #265 (Box visible-part rendering) are **open and unmerged**. Nothing in this page describes them as shipped; where they change a contract it is marked *planned*. |
| Audit method | read-only reading of the current source, tests and existing evidence; static counting of calls and complexity. **No benchmark, build, browser run or `npm` command was executed for this page.** |
| Evidence used | committed `perf/evidence/rolling-vwap-band-2026-11-23T03-29-57-093Z-fbd3dce1d139.json`; the repository tests listed per object; the external research record `/srv/0xdeck-research/box-offscreen-20261123/REPORT.md` (98 raw cells under `raw/`, harness and run script hashes recorded there — not part of this repository) |
| Out of scope | Parquet/Recharts widgets, backend providers, preview/deploy infrastructure, any colour/layout/setting change, any library upgrade |

Everything below is written against the current code. A claim about *source complexity* is a
source-level fact; a claim about *time* is only made where an existing record measured it, with its
provenance and limitations.

## Counting definitions

Performance statements are meaningless unless the counted unit is named. This audit uses:

| Term | Meaning here |
|------|--------------|
| **N** | loaded candles on one panel (`candlesRef.current.length`): the initial history plus every older page plus VWAP-context merges |
| **V** | bars intersecting the visible logical range (what the user can see) |
| **R** | bars in one Fixed Range Volume Profile selection (`fromTime`…`effectiveToTime` at its `selectionInterval`); independent of N |
| **rows** | FRVP row count (`rowCount`, default 68, max 500) |
| **cadence** | which event re-runs the work: history apply, live kline tick, pan/zoom, hover/crosshair, resize, selection, settings, visibility, dispose |
| **DPR** | device pixel ratio; primitives paint through `useBitmapCoordinateSpace`, so a primitive's draw work and its bitmap footprint scale with DPR |
| **native update** | one `ISeriesApi.setData()`/`update()` call. Its cost is the library's, not this app's |
| **request** | one `requestUpdate()`/`invalidate()` call reaching the chart model |
| **frame** | one painted canvas frame (the library coalesces requests into frames; requests ≠ frames) |

Loaded N, visible V and profile R are separate axes and are reported separately. "Object count"
(boxes, lines, profiles, instances) is a fourth axis: several primitives are O(objects) per paint
with no history walk, which is not the same thing as O(N) or O(V).

## Cost layers

Four layers, plus a request layer that is not compute:

1. **Source derivation** — plain JS over candles: EMA recursion, RSI, VWAP accumulation, rolling
   window sums, anchor slicing, FRVP binning. Runs on history apply and/or live tick.
2. **Native series data update** — `setData`/`update` on a native series. The library rebuilds its
   internal plot data; in the installed 5.2.x line a data update rebuilds per-row plot/style objects
   for that series (the mechanism recorded in
   [Rolling VWAP band primitive](./CHART-OBJECT-STANDARD.md#rolling-vwap-band-primitive-262-must),
   measured by #262, not re-derived here). Cost scales with that series' loaded rows, not with V.
3. **Primitive view rebuild** — `updateAllViews()` → geometry models. Cost is whatever the geometry
   builder walks: visible window (good), object list, rows, or loaded history (a bug pattern).
4. **Paint** — canvas draw calls per frame, in bitmap space (×DPR). Fill paths cost by bitmap area
   and path complexity; clipping by the pane makes off-pane geometry cheap but not free.

Requests are their own axis: the `requestUpdate` an attached primitive receives calls
`series._internal_model()._internal_fullUpdate()` in the installed package
(`node_modules/lightweight-charts/dist/lightweight-charts.development.mjs:12797`; the pane-primitive
variant is at `:12528`), so each request schedules a full chart update pass regardless of how small
the change is. Counting requests is therefore useful, but only painted frames prove user-visible
work.

## Inventory: every current chart object

`src/market/` modules, with the settings surface from the capability matrix. "History apply" and
"live tick" name the source work one render of that object triggers, not measured time.

| Object | Source / settings | Native series | Primitive(s) | History apply (per page) | Live tick (per candle) | Per-paint bound | Tests (representative) |
|--------|-------------------|---------------|--------------|--------------------------|------------------------|-----------------|------------------------|
| **Candles** | `parseMarketCandle.ts`, `candleColors.ts`, panel | 1 candlestick + markers plugin | — | 1 `setData` over N (`applyChartHistorySeries.ts:39`) | 1 `update` (`applyChartLiveCandle.ts:91`) | library (V) | `parseMarketCandle.test.ts`, `mergeMarketCandles.test.ts`, `mergeCandleHistoryBuffer.test.ts`, `candleColors.test.ts`, `btcPerpetualCandleColors.test.ts` |
| **3 EMA** (13/21/35) | `ema.ts`, `chartEmaIndicatorVisibility.ts` | 3 line | — | 3 × O(N) compute + 3 `setData` (`applyChartHistorySeries.ts:40-48`) | 3 × full O(N) compute + last-point `update` (`applyChartLiveCandle.ts:93-101`) | library (V) | `applyChartEmaSeries.test.ts` |
| **2 EMA** (100/200) | `ema.ts`, `chartDualEmaSeries.ts` | 2 line | — | 2 × O(N) compute + 2 `setData` (`applyChartHistorySeries.ts:49`) | 2 × full O(N) compute + 2 `update` (`applyChartLiveCandle.ts:103`) | library (V) | `applyChartEmaSeries.test.ts` |
| **RSI** | `rsi.ts`, `rsiChartPane.ts`, `marketRsiSettingsStorage.ts` | 3 (line + 2 fill series) in its own pane | — | O(N) Wilder compute + 3 `setData` when the pane exists (`rsiChartPane.ts:344-353`) | O(N) compute + 3 `update` (`rsiChartPane.ts:356-367`) | library (V, own pane) | `rsi.test.ts`, `rsiChartPane.test.ts`, `marketRsiSettingsStorage.test.ts` |
| **Session VWAP ×5** (daily/weekly/monthly/quarterly/yearly) | `dailyVwap.ts` … `yearlyVwap.ts`, `sessionVwapChartSeries.ts`, `vwapChartLineStyles.ts` | **15** (5 levels × vwap/prevUpper1/prevLower1) | 5 band primitives (one per level, attached to its `vwap` series) | 5 × (O(N log N) normalize + O(N) session walk) + 15 `setData` + 5 band model updates (`applyChartHistorySeries.ts:50-54`, `sessionVwapChartSeries.ts:111-124`) | per **selected** level: O(N log N) compute + 3 `update` + 1 band model update (`applyChartLiveCandle.ts:120-134`, `updateSessionVwapLineSeriesLast`) | band primitive: visible window + one neighbour each side (#252) | `dailyVwap.test.ts`, `weeklyVwap.test.ts`, `monthlyVwap.test.ts`, `quarterlyVwap.test.ts`, `yearlyVwap.test.ts`, `dailyVwapChartSeries.test.ts`, `weeklyVwapChartSeries.test.ts`, `btcPerpetualChartVwapSync.test.ts`, `sessionVwapBandRenderGeometry.test.ts`, `sessionVwapBandSeriesPrimitive.test.ts` |
| **Rolling VWAP instance** | `rollingVwap.ts`, `rollingVwapSettings.ts`, `rollingVwapChartSeries.ts`, `rollingVwapBandSeriesPrimitive.ts` | 1 line (centre) | 1 band primitive (6 outlines + 3 fills + halo) | O(N log N) normalize + O(N) window walk + 1 `setData` + 1 band update, per instance (`applyChartHistorySeries.ts:55`) | same full compute + 1 `update` + 1 band update, per instance (`applyChartLiveCandle.ts:136`) | visible window + one neighbour each side (#252/#262) | `rollingVwap.test.ts`, `rollingVwapBandRenderGeometry.test.ts`, `rollingVwapBandSeriesPrimitive.test.ts`, `rollingVwapChartSeries.test.ts`, `rollingVwapSettings.test.ts`, `rollingVwapInstances*.test.ts`, `rollingVwapMinimumTimeframe.test.ts` |
| **Anchored VWAP instance** | `anchoredVwap.ts`, `anchoredVwapDrawing.ts`, `anchoredVwapDrawingChartSeries.ts`, `anchoredVwapDrawingSeriesPrimitive.ts`, `anchoredVwapBandFillSeriesPrimitive.ts` | 7 (centre + 6 band lines) | 1 band-fill primitive + 1 anchor/handle primitive | O(N log N) normalize + O(anchor→now) walk + 7 `setData` + 1 band update, per instance (`applyChartHistorySeries.ts:56`) | same full compute + 7 `update` + 1 band update, per instance (`applyChartLiveCandle.ts:137`, `anchoredVwapDrawingChartInstances`) | **band fill walks anchor→now points, not V** (`anchoredVwapBandFillSeriesPrimitive.ts:36-42,104-126`); anchor handle recomputes the full anchored series while selected (`anchoredVwapDrawingSeriesPrimitive.ts:100-126`) | `anchoredVwap.test.ts`, `anchoredVwapDrawing.test.ts`, `anchoredVwapDrawingChartSeries.test.ts`, `anchoredVwapDrawingSettings.test.ts`, `anchoredVwapDrawingHitTest.test.ts`, `anchoredVwapBandFillRenderGeometry.test.ts`, `anchoredVwapBandFillSeriesPrimitive.test.ts` |
| **FRVP profile** | `fixedRangeVolumeProfile.ts`, `fixedRangeVolumeProfileDataPipeline.ts`, `fixedRangeVolumeProfileRuntimeController.ts`, `fixedRangeVolumeProfileSeriesPrimitive.ts` | 0 (draws on the candle series) | Shares the FRVP primitive (per instance models) | not history-driven: one request per instance key, `R` fetched bars binned into `rows` | no recompute per tick; Extend Right asks for a new key when the right edge advances (`fixedRangeVolumeProfileRuntimeIdentity.ts:50-62`) | O(instances × rows) per paint; `rows` ≤ 500 | `fixedRangeVolumeProfile.test.ts`, `fixedRangeVolumeProfileDataPipeline.test.ts`, `fixedRangeVolumeProfileRenderGeometry.test.ts`, `fixedRangeVolumeProfileSeriesPrimitive.test.ts`, `fixedRangeVolumeProfileRuntimeController.test.ts`, `fixedRangeVolumeProfileChartTime.test.ts`, `frvpHistogramStyles.test.ts` |
| **Rectangle / Box** | `rectangleInstances.ts`, `rectangleChartTime.ts`, `rectangleRenderGeometry.ts`, `rectangleSeriesPrimitive.ts` | 0 | 1 primitive | none | none (repaints with the chart) | O(objects) per paint; a model whose start predates loaded history is dropped entirely (`rectangleRenderGeometry.ts:39-55`, `rectangleChartTime.ts:222-229`) | `rectangleRenderGeometry.test.ts`, `rectangleChartTime.test.ts`, `rectangleSeriesPrimitive.test.ts`, `rectangleHitTest.test.ts`, `rectangleInteraction.test.ts`, `rectangleChartTool.test.ts` |
| **Line tool** | `lineInstances.ts`, `lineRenderGeometry.ts`, `lineSeriesPrimitive.ts` | 0 | 1 primitive | none | none | O(objects) per paint | `lineRenderGeometry.test.ts`, `lineSeriesPrimitive.test.ts`, `lineHitTest.test.ts`, `lineInteraction.test.ts`, `lineChartTool.test.ts` |
| **Aggregated Liquidations** | `aggregatedLiquidations.ts`, `aggregatedLiquidationsHistory.ts`, `aggregatedLiquidationsBuckets.ts`, `aggregatedLiquidationsChartSeries.ts` | 1 histogram (own pane) + 1 overlay primitive | same primitive | events walk (≤ 12 pages) or bucket query; **no warmup** | per live event: merge + sort of the retained buffer (≤ 20 000) and an O(N) candle-time map (`BtcPerpetualChartPanel.tsx:2765-2776`) | overlay rebuilds **all buckets** per paint, not V (`aggregatedLiquidationsChartSeries.ts:119-134`, `aggregatedLiquidationsRenderGeometry.ts:57-87`) | `aggregatedLiquidations.test.ts`, `aggregatedLiquidationsHistory.test.ts`, `aggregatedLiquidationsBuckets.test.ts`, `aggregatedLiquidationsChartSeries.test.ts`, `aggregatedLiquidationsRenderGeometry.test.ts`, `liquidationsCoverage.test.ts` |
| **Live price levels** (#280: liquidation, stop loss, take profit) | `priceLevelsKind.ts`, `liquidationLevelsProtocol.ts`, `liquidationLevelsStreamClient.ts`, `liquidationLevelsDecode.ts`, `liquidationLevelsFeed.ts`, `tpslLevelsFeed.ts`, `liquidationLevelsIndex.ts`, `liquidationLevelsProfileGeometry.ts`, `liquidationLevelsSeriesPrimitive.ts` | 0 (draws on the candle series) | up to 3 profile primitives on the candle series (one per enabled kind) | not history-driven: the books come from two MarketLens L4 sockets, not from loaded candles | no candle work; one ordered Parquet decode per file per socket (~1 MB for the first liquidation snapshot, ~8 200 / ~11 000 order snapshots for TPSL, ~1 KB per delta), then a lazy price-index rebuild per applied file on that channel only | visible price band + one row per CSS pixel of the candle pane (cap 2 000 rows); binary search into each profile's price index, never a walk over the book or candle history | `liquidationLevelsProtocol.test.ts`, `tpslProtocol.test.ts`, `liquidationLevelsStreamClient.test.ts`, `liquidationLevelsIndex.test.ts`, `liquidationLevelsProfileGeometry.test.ts`, `liquidationLevelsFeed.test.ts`, `tpslLevelsFeed.test.ts`, `liquidationLevelsSeriesPrimitive.test.ts`, `liquidationLevelsSettings.test.ts`, `priceLevelsHitPriority.test.ts`, `e2e/liquidation-levels-primitive.spec.ts`, `e2e/price-levels-app.spec.ts` |
| **Position markers** | `positionWallet.ts`, `hyperliquidFills.ts`, `lighterFills.ts`, `hyperliquidMarkers.ts`, `positionMarkers.ts` | markers plugin on candles | — | none on history apply; filter to loaded times on window change (`BtcPerpetualChartPanel.tsx:3183-3222`) | no per-tick marker write; window change rebuilds the marker set | library markers path (all markers) | `hyperliquidMarkers.test.ts`, `positionMarkers.test.ts`, `positionWallet.test.ts`, `hyperliquidFills.test.ts`, `lighterFills.test.ts`, `lighterFillsStore.test.ts` |
| **Current price line** | `btcPerpetualCurrentPriceLineOptions.ts` | candle series option | — | — | library | library | `btcPerpetualCurrentPriceLineOptions.test.ts` |
| **Selection chrome** (handles, halo, cursor) | `lineColors.ts`, `rectangleColors.ts`, `drawingCursor.ts`, `overlayIndicatorSelectionHalo.ts` | — | transient halo primitive while an overlay indicator is selected | — | — | halo walks visible logical segments only while selected (`overlayIndicatorSelectionHalo.ts:151-171`) | `overlayIndicatorSelectionHalo.test.ts`, `drawingCursor.test.ts`, `lineColors.test.ts`, `rectangleColors.test.ts` |

### Series and primitive count per panel

| Configuration | Native series | Attached primitives |
|---------------|---------------|---------------------|
| Default panel (no indicator enabled) | **21** (1 candle + 5 EMA + 15 session VWAP) | 5 session band primitives + rectangle + line + FRVP + anchored-drawing + markers plugin = **10** |
| + RSI | +3 in a new pane | — |
| + Aggregated Liquidations | +1 histogram in its own pane | +1 overlay |
| + each Rolling VWAP instance | +1 centre | +1 band primitive |
| + each Anchored VWAP instance | +7 | +2 (band fill, anchor handle) |
| Selected overlay indicator | — | +1 transient halo |

Every one of those native series is created when the chart is created (EMA and session VWAP series
exist hidden, `BtcPerpetualChartPanel.tsx:3356-3386`). None of the primitives is created per paint.

## Cost classification

### Proven source costs (static, current code)

These are facts about the source, not measured time shares. A full-array pass is not automatically a
bottleneck; it is a candidate that a measurement must confirm.

| Operation | Complexity | Call sites |
|-----------|-----------|------------|
| EMA recursion over the whole buffer | O(N) per series (5 series) | `ema.ts:19-38`; called from `applyChartHistorySeries.ts:40-49` and `applyChartLiveCandle.ts:93-103` |
| RSI Wilder recursion | O(N) | `rsi.ts:102-141`; `rsiChartPane.ts:344-367` |
| Session VWAP normalize (Map + sort) + session walk | O(N log N) + O(N) per level (5 levels) | `dailyVwap.ts:60-68,136-180`, analogous in `weeklyVwap.ts`, `monthlyVwap.ts`, `quarterlyVwap.ts`, `yearlyVwap.ts`; `dailyVwapChartSeries.ts:68-76` |
| Rolling VWAP normalize + sliding window | O(N log N) + O(N) per instance | `rollingVwap.ts:253-261,340-388`; `rollingVwapSettings.ts:251-260` |
| Anchored VWAP normalize + anchor slice/walk | O(N log N) + O(anchor→now) per instance | `anchoredVwap.ts:11-19,104-149`; `anchoredVwapDrawing.ts:87-109` |
| History page apply | 1 merge + 21 native `setData` + 5 band updates (default panel) | `btcPerpetualInfiniteHistoryCore.ts:171-189` → `applyChartHistorySeries.ts:33-60` |
| Viewport restore | up to 40 sequential page applies in one burst | `btcPerpetualViewportHistory.ts:14,47-81`, called from `BtcPerpetualChartPanel.tsx:3637-3692` |
| Indicator preload | up to 40 pages, 25 ms idle poll between busy polls | `indicatorHistoryPreload.ts:15-19,95-104` |
| FRVP source | R fetched bars → `rows` bins per request | `fixedRangeVolumeProfileDataPipeline.ts:52-95` |
| Liquidation bucket paint | O(buckets) coordinate conversions per build | `aggregatedLiquidationsChartSeries.ts:119-134` |

**Counting correction.** The Box research report counted "11 full `setData` per history page". That
is the number of bundle-level calls in `applyChartHistorySeries`; the native series writes are
**21** for a default panel, because each session VWAP level writes three native series
(`sessionVwapChartSeries.ts:111-124`) and each band level updates its primitive once. Use native
write counts when comparing chart work; use bundle-level counts only when talking about code paths.

### Measured bottlenecks (existing evidence, not re-measured here)

**1. Older-history page application and viewport restore (external research record).**
`/srv/0xdeck-research/box-offscreen-20261123/REPORT.md` measured the production React bundle with a
deterministic 500-bar page mock, 750-bar first load, 20 000-bar horizon, headless Chromium,
DPR 1/2, on the 2-vCPU EPYC host. Results, quoted with their provenance:

- Interactive back-pan page cost grows with N: median per-page long task ≈ **63–83 ms** at
  N ≈ 1 250, ≈ 76–105 ms at ≈ 2 250, ≈ 99–122 ms at ≈ 3 250, ≈ 119–132 ms at ≈ 4 750 (max 248 ms),
  and 0.9–2.9 s inside the restore burst.
- Viewport restore to a viewport ~19 000 bars back: **37 pages**, wall **14.1–15.7 s**, long-task
  total **14.5–16.0 s**, largest single long task **885–1 101 ms**, frame p95 **492–583 ms**,
  33 frames over 100 ms.
- Box presence made **no measurable difference** in matched cells (box cells were sometimes faster).
- Limits of that evidence: API stubbed, WebSocket stubbed (no live tick cell), React commit and
  localStorage persist not instrumented, 2-vCPU host, absolute times host-dependent. It is
  controlled fixture evidence, not a production promise.

**2. Rolling VWAP native update consolidation (#262, committed evidence).**
`perf/evidence/rolling-vwap-band-2026-11-23T03-29-57-093Z-fbd3dce1d139.json`: same candles, points,
viewport and cadence; 3 instances; N ≈ 20 000; 1 000 ms tick cadence; 10 ticks × 3 reps; isolated
real-library chart (candles + 200 markers + 5 EMA lines + Rolling instances; **no React tree, no
FRVP**); host AMD EPYC 9354P, 2 vCPU, DPR 1, 1800×700.

| Counter | Pre-#262 native bands | Consolidated (#262) |
|---------|----------------------|---------------------|
| native updates per tick (3 instances) | 21 (**7 per instance**) | 3 (**1 per instance**) |
| tick handler median | 382.3 ms | 38.1 ms |
| per-page apply median (40 pages) | 970.7 ms | 156.1 ms |
| `setData` calls per 40 pages | 840 (21/page) | 120 (3/page) |

The **7 → 1 native update per instance** is the structural result and it is what the standard now
requires. The millisecond columns are fixture measurements on that host at that DPR/cadence; they are
not production latency, not a budget, and not evidence about FRVP or the React panel. The 38 ms
consolidated handler is a useful *floor* estimate for the remaining per-tick source + library work at
N ≈ 20 000 in that fixture.

**3. Box geometry (external research record).** An off-pane box paints huge bitmap fills
(22 955 × 450 825 at DPR 1; 45 911 × 861 229 at DPR 2; 294 298 × 2 529 899 at V = 39) at
**≈ 0.07–0.9 ms per repaint**, with 0 long tasks and unchanged frame pacing. `fillOpacity: 0` still
draws the same geometry; `hidden` builds no model at all. Large fills, clipping and DPR are therefore
**not** the Box problem, and "cull huge rectangles" or "batch box fills" is not justified by evidence.

**4. FRVP correction.** The earlier "+283 ms during pan" FRVP number was a tracing-window artifact
and is withdrawn; the corrected bounded estimate in the same research record was **0.24 ms/frame**. A
separate, more severe FRVP concern is still **unresolved and unproven** — FRVP is an open risk, not a
measured bottleneck. Do not cite the withdrawn number, and do not treat the corrected 0.24 ms/frame
as proof that FRVP is finished.

### Unmeasured risks (source-inspected, not timed)

These are candidates. None is a proven user-visible defect, and none is a licence for a broad rewrite.

| ID | Risk | Where | Why it is a risk | Bounded next step |
|----|------|-------|------------------|-------------------|
| R1 | Every history page derives and writes **all** indicator series, including indicators that are not enabled | `applyChartHistorySeries.ts:39-60` | 5 EMA + 15 session VWAP native writes per page even when hidden; measured page cost grows with N | Owned by **#264** (inactive derivation + hydration). Not a docs change |
| R2 | Restore burst applies up to 40 pages synchronously | `btcPerpetualViewportHistory.ts:47-81` | 14–16 s of main-thread work measured; each page is one long task | Owned by **#264**. This audit does not prescribe yielding or page caps |
| R3 | Each selected session VWAP recomputes the whole buffer per tick and writes 3 native series | `dailyVwapChartSeries.ts:68-76`, `updateSessionVwapLineSeriesLast` | 5 selected levels ⇒ 5 × O(N log N) + **15** native updates per tick | Measure a tick with all 5 selected; then decide (incremental session accumulator is the obvious direction, but only with exactness tests) |
| R4 | Each anchored VWAP instance recomputes the whole buffer per tick and writes 7 native series | `anchoredVwapDrawingChartSeries.ts:352-361` | O(N log N) source + 7 native updates **per instance** per tick | Measure with 2–3 instances; consider anchor-bounded derivation |
| R5 | Anchored VWAP band-fill geometry walks anchor→now, not V | `anchoredVwapBandFillSeriesPrimitive.ts:36-42,104-126`; `anchoredVwapBandFillRenderGeometry.ts:90-118` | Zoomed into 100 bars of a 20 000-bar anchored fill, every pan frame converts ~20 000 points | Compare with the #252 window pattern (binary search + one neighbour); pixel-identity gate at DPR 1/2 |
| R6 | Selected anchored-VWAP anchor handle recomputes the full anchored series per view update | `anchoredVwapDrawingSeriesPrimitive.ts:100-126` | One selected instance ⇒ O(N log N) per pan frame while selected | The anchor price only needs the anchor bar; measure before changing |
| R7 | Liquidation overlay rebuilds all buckets per paint; live events merge/sort the retained buffer and map all candle times | `aggregatedLiquidationsChartSeries.ts:119-134`; `BtcPerpetualChartPanel.tsx:2765-2776` | O(buckets) per frame plus O(N) per live event while the pane is enabled | Measure a cascade with the pane on; consider a window bound like #252 |
| R8 | Each drawing attachment subscribes to **both** `subscribeVisibleLogicalRangeChange` and `subscribeVisibleTimeRangeChange`, and each callback requests an update | `BtcPerpetualChartPanel.tsx:2589-2730` | One pan pointer event can reach 4 attachments × 2 events = up to 8 `fullUpdate` requests; the library coalesces frames, but the request work is redundant | Count requests per pan event; dedupe the two subscriptions per attachment if the count is real |
| R9 | FRVP Extend Right uses the live right edge in its request key | `fixedRangeVolumeProfileRuntimeIdentity.ts:50-62` | One fetch per new bar per extending instance (the live right edge only changes when a candle opens), each costing R bars | Measure request cadence with 2 extending profiles; debounce/merge only if measured |
| R10 | Marker refresh maps all candle times and rewrites the marker set on window change | `BtcPerpetualChartPanel.tsx:3183-3222`; `hyperliquidFills.ts:182-197` | O(N) map + O(fills) per window change, per panel; not per tick | Keep for now; measure with a large fill set |
| R11 | Hover hit testing scans visible segments per candidate series and rebuilds band models | `chartObjectSeriesLineHit.ts:61-120`; `rollingVwapBandSeriesPrimitive.ts:415-438`; `chartObjectSettingsHitTest.ts:290-340` | O(V) per candidate per pointer move; bounded by V, not N | Measure hover with many overlay indicators; keep the shared hit test |
| R12 | Both backward loaders cap at 40 pages | `btcPerpetualViewportHistory.ts:14`; `indicatorHistoryPreload.ts:15` | A cap is a product/behaviour choice; it is not a performance contract | No change proposed. Do not turn the constant into a rule |

### Non-costs and rejected hypotheses

- **Box fill area / DPR / clipping**: measured ≈ 0.07–0.9 ms, 0 long tasks. Not a bottleneck.
- **Off-pane geometry**: clipped by the pane; not worth pixel-area culling or batching.
- **Object-count geometry** (rectangles, lines, FRVP models at O(objects)): not an O(N) path.
- **"Native series count is the problem"**: only per-*update* cost matters; 21 idle hidden series do
  not cost per frame. Replacing native series with a primitive is justified only by measured
  per-update cost (#262), never by count alone.
- **"Every O(N) formula is a bottleneck"**: several O(N) formulas run once per history page and not
  per frame. They are candidates for #264-style work, not proof of frame drops.

## Object behaviour notes (history, live, paint, invalidation, disposal)

**Indicators derived from candles.** History application is one bundle call that writes candle, EMA,
dual-EMA, session VWAP, Rolling/Anchored instances and (when its pane exists) RSI
(`applyChartHistorySeries.ts:33-60`). Live ticks take the same derivations to their latest point only
(`applyChartLiveCandle.ts:77-138`). EMA and dual-EMA series are created hidden and toggled by
visibility (`chartEmaIndicatorVisibility.ts:10-28`), so enabling them never hydrates anything — the
data is already current because every page writes them. The RSI pane is created on demand and
hydrates immediately (`BtcPerpetualChartPanel.tsx:1947-1985`); that is the existing reference for
"enable must hydrate". Session VWAP enables a context request when the loaded context level is
insufficient (`BtcPerpetualChartPanel.tsx:3816-3911`). Rolling/Anchored instances hydrate on add
(`handleRollingVwapAdd`, `applyRollingVwapInstanceHistory`).

**Prepend sensitivity.** A history page prepends candles and shifts the visible logical range by the
added count (`btcPerpetualInfiniteHistoryCore.ts:171-189`); the VWAP-context merge does the same via
`countPrependedCandles` (`BtcPerpetualChartPanel.tsx:3880-3895`). Anything that caches a
logical index, a running sum seeded at buffer start, or a first-visible price base across a prepend
is wrong unless it is rebased. Current implementations deliberately recompute from the full buffer
(EMA, RSI, session VWAP, Rolling, Anchored) and the Rolling band's percentage projection re-derives
its base per build (`rollingVwapBandRenderGeometry.ts`), which is why they survive prepends.

**Tools.** Rectangle, line, FRVP and anchored-VWAP handle primitives are attached once per chart and
rebuild models from a context getter on each `updateAllViews()`; each also subscribes to both time
scale range events and requests an update on them (R8). Rectangle/line models are O(objects) with a
whole-model drop when any edge cannot be resolved — including a start that predates loaded history
(`rectangleChartTime.ts:222-229`), which is the documented *visibility* limitation fixed by **#265**
and is **not** a paint cost. Their `update()` calls `invalidate()` (one request). The anchored-VWAP
handle attachment is the exception: its `update()` calls `updateAllViews()` directly and does not
request a frame; whether a selected-handle preview can therefore miss a repaint was **not exercised**
in this audit and is recorded as an unverified behaviour, not a defect claim.

**Panes and chrome.** The liquidation overlay rebuilds all buckets per paint (R7) and lives in its own
pane; RSI owns its own pane and 3 series; position markers use the official `createSeriesMarkers`
plugin on the candle series and are rewritten only when the loaded window changes; the transient
overlay halo is attached only while an overlay indicator is selected and walks visible segments.

**Disposal.** Every attachment exposes dispose/detach and the panel detaches on unmount
(`BtcPerpetualChartPanel.tsx:3447-3468`), the FRVP runtime controller aborts in-flight requests and
clears state (`fixedRangeVolumeProfileRuntimeController.ts:112-136`), and each primitive clears its
chart/series/request references in `detached()`. The redraw-lifecycle tests listed per primitive are
the evidence, not a grep.

## Availability and provenance contract

Interval support is source data, not a UI preference (`indicators.ts:55-106`). A per-interval
availability matrix is what the panel and the notices follow:

| Indicator | Supported intervals | History requirement |
|-----------|--------------------|---------------------|
| 3 EMA | 1m–1w (all nine) | 5 × max period bars warmup (175), minimum 35 (`indicatorHistoryRequirements.ts:28-32,176-178`) |
| 2 EMA | 1m–1w | 5 × 200 bars warmup (1 000), minimum 200 |
| Daily / Weekly VWAP | 1m–1d | session context; earliest required time is the current UTC period start |
| Monthly / Quarterly VWAP | 4h, 1d | same, longer context level |
| Yearly VWAP | 1d, 1w | same, yearly context level |
| Rolling VWAP | 1m–1w | window bars + `minBars`, per instance |
| Anchored VWAP | 1m–1w (tool) | anchor bar must be inside loaded history |
| RSI | 1m–1w | candles already loaded; never fetches |
| Aggregated Liquidations | 1m–1w | live-only; no warmup; the event walk is capped at 12 pages |
| FRVP | any chart interval (`selectionInterval`) | provider must serve the selection range; older than the provider horizon ⇒ explicit unavailable notice |

Provider provenance is part of the contract: a history page records `available_from` and
`history_unavailable` (`btcPerpetualInfiniteHistoryCore.ts:50-82`) and the panel surfaces a limit
notice instead of pretending the range is complete. Session VWAP context requests carry the same
provenance (`btcPerpetualVwapContextRequest.ts`), and FRVP reports it per instance
(`fixedRangeVolumeProfileDataPipeline.ts:26-40`, `frvpHistoryAvailability.ts`).

Preserved invariants for any performance work (listed here because they are the ones an optimisation
breaks first):

- **EMA seed** — SMA of the first `period` closes, then `2/(period+1)` recursion (`ema.ts:16-31`).
- **RSI seed** — average gain/loss over the first `period` changes, then Wilder smoothing (`rsi.ts`).
- **VWAP session boundaries** — UTC day, Monday 00:00 UTC week, calendar month/quarter/year; chart
  display timezone never changes them.
- **Rolling VWAP** — resolved window ms plus `minBars` floor; window eviction is exact.
- **Anchored VWAP** — anchor bar and anchor-sliced walk; no points before the anchor.
- **Candle invariants** — ascending unique times, dedupe policy, live-bar final state.
- **Exact viewport** — saved visible time range plus logical anchors/right offset are restored
  (`marketChartViewport.ts:274-341`); a restore that needs older history is a separate state, not a
  clamp or a fallback viewport.
- **Presentation** — colours, opacities, widths, styles and defaults are untouched by performance work.
- **Availability** — the final requested N, the requested page count and the provider horizon
  metadata are preserved; dropping requested pages or lowering history caps is not a performance fix.

## Benchmark evidence rules

Any future performance claim in this repository, in a PR or in an audit page must satisfy these, or
say exactly which one it does not:

1. **Immutable raw results** per cell, with the script/asset hashes, source SHA, host (CPU model and
   count), DPR, viewport and cadence. Raw files are never overwritten; errors are recorded, not
   swallowed.
2. **Anchored timing windows** — exclude mount/warm-up, name the window boundaries, and report the
   deltas inside it.
3. **Matched controls** — same candles, same final N and V, interleaved repeats; report the control
   in the same table.
4. **Counted units named** — requests, native `update`/`setData`, canvas fills/clears, long tasks,
   frame pacing are separate columns. Never present requests as frames.
5. **Fixture vs application** — an isolated chart fixture is not the React panel. Say which one was
   measured and what it therefore cannot support.
6. **Pixel identity when geometry changes** — compare at DPR 1 and DPR 2, including alpha seams;
   grouped paths that produce visible seams at DPR 1 are not acceptable just because counters drop.
7. **No universal budgets** — absolute milliseconds are host-dependent. Targets are assessments, not
   CI gates; only counters may gate.
8. **Version pin** — record the installed library version. Cost behaviour is version-scoped: the
   installed line here is 5.2.0, and the upstream 5.2.1 markers fix addresses a pane-copy path, which
   does **not** establish that every data-change copy is gone. Re-verify costs after any upgrade, and
   never upgrade the library as an unmeasured performance fix.

## Follow-up register

| ID | Finding | Owner / status |
|----|---------|----------------|
| F1 | Inactive indicators still derive and write full history on every page; restore burst applies up to 40 pages | **#264**, open |
| F2 | A Box whose start predates loaded history is dropped entirely until the user pans back | **#265**, open |
| F3 | Session VWAP: per-tick full recompute + 15 native updates when all five are selected | new, unmeasured (R3) |
| F4 | Anchored VWAP: per-tick full recompute + 7 native updates per instance | new, unmeasured (R4) |
| F5 | Anchored VWAP band fill is not visible-window bounded | new, unmeasured (R5) |
| F6 | Selected anchored-VWAP handle recomputes the full series per view update | new, unmeasured (R6) |
| F7 | Liquidation overlay rebuilds all buckets per paint; live event merge is O(N) per event | new, unmeasured (R7) |
| F8 | Duplicate time-scale subscriptions per drawing attachment request redundant updates | new, unmeasured (R8) |
| F9 | FRVP Extend Right fetch cadence follows every advanced candle | new, unmeasured (R9) |
| F10 | Severe FRVP concern remains unresolved and unproven | open, needs its own investigation |

The register is an inventory, not a work order. Each item needs its own authorized task, its own
counters and its own pixel/behaviour gate; none is "fixed" by this documentation change.

## Limitations of this audit

- No benchmark was run. All time numbers are quoted from existing records with their limitations.
- Static call counting cannot prove a user-visible cost; the unmeasured risks above are explicitly
  unmeasured.
- The Box research record is an external research artifact, not a repository file; its raw cells are
  named and hashed there, and its API/WebSocket stubbing limits what it can claim about live ticks.
- The committed Rolling VWAP evidence is a real-library chart fixture, not the React panel, and it
  does not include FRVP.
- Several unmeasured risks depend on user configuration (how many indicators are selected, how many
  instances exist); the count table shows the axis, not a particular user's deck.
- No source, test, configuration, deployment or library change is part of this audit.

## References

- Normative rules: [CHART-OBJECT-STANDARD.md](./CHART-OBJECT-STANDARD.md), especially
  [Performance and cost contracts](./CHART-OBJECT-STANDARD.md#performance-and-cost-contracts-must),
  [Series primitive redraw lifecycle](./CHART-OBJECT-STANDARD.md#series-primitive-redraw-lifecycle-must)
  and [Rolling VWAP band primitive](./CHART-OBJECT-STANDARD.md#rolling-vwap-band-primitive-262-must).
- Panel wiring: [BtcPerpetualChartPanel.tsx](../src/BtcPerpetualChartPanel.tsx).
- History and live application: [applyChartHistorySeries.ts](../src/market/applyChartHistorySeries.ts),
  [applyChartLiveCandle.ts](../src/market/applyChartLiveCandle.ts),
  [btcPerpetualInfiniteHistoryCore.ts](../src/market/btcPerpetualInfiniteHistoryCore.ts),
  [btcPerpetualViewportHistory.ts](../src/market/btcPerpetualViewportHistory.ts),
  [indicatorHistoryPreload.ts](../src/market/indicatorHistoryPreload.ts).
- Measurement harness: [perf/README.md](../perf/README.md),
  [perf/evidence/rolling-vwap-band-2026-11-23T03-29-57-093Z-fbd3dce1d139.json](../perf/evidence/rolling-vwap-band-2026-11-23T03-29-57-093Z-fbd3dce1d139.json).
- Real-library specs: [e2e/anchored-vwap-redraw.spec.ts](../e2e/anchored-vwap-redraw.spec.ts),
  [e2e/vwap-band-fill.spec.ts](../e2e/vwap-band-fill.spec.ts),
  [e2e/rolling-vwap-band-primitive.spec.ts](../e2e/rolling-vwap-band-primitive.spec.ts),
  [e2e/rolling-vwap-band-perf.spec.ts](../e2e/rolling-vwap-band-perf.spec.ts),
  [e2e/chart-network-hygiene.spec.ts](../e2e/chart-network-hygiene.spec.ts),
  [e2e/chart-perf.spec.ts](../e2e/chart-perf.spec.ts).
