import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  AggregatedLiquidationsSeriesPrimitive,
  createAggregatedLiquidationsChartOverlay,
} from './aggregatedLiquidationsChartSeries.ts'
import { AGGREGATED_LIQUIDATIONS_PANE_HEIGHT_PX } from './aggregatedLiquidationsPaneLayout.ts'
import { registerCandleChartSeries } from './candlePane.ts'
import { resolveChartPaneRolePane } from './chartPaneRoles.ts'

type FakePane = {
  paneIndex: () => number
  moveTo: (paneIndex: number) => void
  setHeight: (height: number) => void
  getHTMLElement: () => null
}

type PaneEvent =
  | { operation: 'moveTo'; pane: FakePane; target: number }
  | { operation: 'setHeight'; pane: FakePane; height: number }

function createFakePane(
  panes: FakePane[],
  heights: Map<FakePane, number>,
  paneEvents: PaneEvent[],
): FakePane {
  const pane: FakePane = {
    paneIndex: () => panes.indexOf(pane),
    moveTo: (paneIndex) => {
      paneEvents.push({ operation: 'moveTo', pane, target: paneIndex })
      const from = panes.indexOf(pane)
      if (from < 0) return
      panes.splice(from, 1)
      panes.splice(paneIndex, 0, pane)
    },
    setHeight: (height) => {
      paneEvents.push({ operation: 'setHeight', pane, height })
      heights.set(pane, height)
    },
    getHTMLElement: () => null,
  }
  return pane
}

/**
 * Fake chart that models the v5 pane semantics the overlay depends on:
 * `addSeries(type, options, paneIndex)` joins the pane at `paneIndex` when it
 * already exists and appends a brand new pane when the index equals
 * `panes.length`.
 *
 * `addSeriesJoinsCandlePane` simulates the pane-collision hazard (a series that
 * ends up inside the candle pane) so the candle-pane guard can be asserted.
 *
 * `modelPriceScaleRecalculation` models the three Lightweight Charts 5.2.0
 * behaviours the refresh fix depends on, and nothing else:
 *
 * 1. options applied to the **default** `'right'` scale id are merged into the
 *    chart-wide options, i.e. they become the template every pane created later
 *    inherits (`Model._internal_applyPriceScaleOptions`);
 * 2. `Pane._internal_recalculatePriceScale` early-returns for a non-autoscale
 *    scale, so `setData` never recomputes the range of a manual pane;
 * 3. a new pane always gets one autoscale pass, which installs the library's
 *    `[-0.5, 0.5]` placeholder when the series has no bars yet.
 */
function createHarness({
  addSeriesJoinsCandlePane = false,
  paneAboveCandles = false,
  modelPriceScaleRecalculation = false,
}: {
  addSeriesJoinsCandlePane?: boolean
  paneAboveCandles?: boolean
  modelPriceScaleRecalculation?: boolean
} = {}) {
  const panes: FakePane[] = []
  const heights = new Map<FakePane, number>()
  const paneEvents: PaneEvent[] = []
  const scaleOptions: Array<{
    invertScale?: boolean
    scaleMargins?: { top: number; bottom: number }
    autoScale?: boolean
  }> = []
  const addSeriesPaneIndexes: number[] = []
  // Price-scale state the overlay reads: `null` models a scale that never
  // received a visible-bar window (no range at all).
  const scaleState: {
    autoScale: boolean
    visibleRange: { from: number; to: number } | null
  } = {
    autoScale: true,
    visibleRange: { from: 0, to: 930_000 },
  }
  /**
   * Chart-wide `rightPriceScale` options. Lightweight Charts merges options
   * applied to the default `'right'` scale id here, so this is what a pane
   * created later inherits.
   */
  const template: { autoScale: boolean } = { autoScale: true }

  const otherPane = createFakePane(panes, heights, paneEvents)
  if (paneAboveCandles) panes.push(otherPane)
  const candlePane = createFakePane(panes, heights, paneEvents)
  panes.push(candlePane)
  const liquidationPane = createFakePane(panes, heights, paneEvents)

  let requestUpdateCount = 0
  let addSeriesCount = 0
  let setDataCount = 0
  let attachedPrimitive: AggregatedLiquidationsSeriesPrimitive | null = null
  let seriesPane: FakePane | null = null

  const series = {
    getPane: () => seriesPane ?? liquidationPane,
    priceScale: () => ({
      applyOptions: (options: (typeof scaleOptions)[number]) => {
        scaleOptions.push(options)
        if (options.autoScale === undefined) return
        // Default `'right'` scale id: the instance *and* the chart-wide template.
        scaleState.autoScale = options.autoScale
        template.autoScale = options.autoScale
      },
      getVisibleRange: () => scaleState.visibleRange,
    }),
    setData: (data?: ReadonlyArray<{ time: number; value: number }>) => {
      setDataCount += 1
      if (!modelPriceScaleRecalculation) return
      // A manual (non-autoscale) pane is never re-scaled: the library's
      // `Pane._internal_recalculatePriceScale` returns before touching it.
      if (!scaleState.autoScale) return
      const peak = (data ?? []).reduce((max, point) => Math.max(max, point.value), 0)
      // An empty series leaves the `[-0.5, 0.5]` placeholder the pane got from
      // its one creation-time autoscale pass; real bars scale to `[0, peak]`.
      scaleState.visibleRange = peak > 0 ? { from: 0, to: peak } : { from: -0.5, to: 0.5 }
    },
    attachPrimitive: (primitive: AggregatedLiquidationsSeriesPrimitive) => {
      attachedPrimitive = primitive
      primitive.attached({
        chart: chart as never,
        series: series as never,
        requestUpdate: () => {
          requestUpdateCount += 1
        },
      })
    },
    detachPrimitive: () => {},
    priceToCoordinate: (value: number) => priceToCoordinate(value),
  }

  /**
   * Library-shaped price → y mapping (`PriceScale._private__logicalToCoordinate`)
   * so the tests can assert what is drawn, not just which options were applied.
   */
  const priceToCoordinate = (value: number): number | null => {
    if (!modelPriceScaleRecalculation) return null
    const range = scaleState.visibleRange
    if (!range || range.from === range.to) return null
    const height = AGGREGATED_LIQUIDATIONS_PANE_HEIGHT_PX
    const margins = scaleOptions.at(-1)?.scaleMargins ?? { top: 0, bottom: 0 }
    const topPx = margins.top * height
    const bottomPx = margins.bottom * height
    const internalHeight = height - topPx - bottomPx - 1
    const invertedCoordinate =
      bottomPx + (internalHeight * (value - range.from)) / (range.to - range.from)
    return height - 1 - invertedCoordinate
  }

  const chart = {
    addSeries: (_type: unknown, _options: unknown, paneIndex: number) => {
      addSeriesCount += 1
      addSeriesPaneIndexes.push(paneIndex)
      if (addSeriesJoinsCandlePane) {
        seriesPane = candlePane
        return series
      }
      const clamped = Math.min(panes.length, paneIndex)
      if (clamped < panes.length) {
        // Existing pane: the series joins it (this is the collision hazard).
        seriesPane = panes[clamped]
      } else {
        panes.push(liquidationPane)
        seriesPane = liquidationPane
        if (modelPriceScaleRecalculation) {
          // A brand new pane inherits the chart-wide template and always gets
          // one autoscale pass, which installs the placeholder (no bars yet).
          scaleState.autoScale = template.autoScale
          scaleState.visibleRange = { from: -0.5, to: 0.5 }
        }
      }
      return series
    },
    panes: () => panes,
    timeScale: () => ({
      options: () => ({ barSpacing: 10 }),
      timeToCoordinate: () => null,
    }),
    removeSeries: () => {
      const target = seriesPane
      const index = target ? panes.indexOf(target) : -1
      if (index >= 0 && panes.length > 1) panes.splice(index, 1)
      seriesPane = null
    },
  }

  registerCandleChartSeries(chart as never, { getPane: () => candlePane } as never)

  return {
    chart,
    series,
    panes,
    heights,
    scaleOptions,
    candlePane,
    liquidationPane,
    otherPane,
    paneEvents,
    addSeriesPaneIndexes,
    scaleState,
    template,
    priceToCoordinate,
    get requestUpdateCount() {
      return requestUpdateCount
    },
    get addSeriesCount() {
      return addSeriesCount
    },
    get setDataCount() {
      return setDataCount
    },
    get attachedPrimitive() {
      return attachedPrimitive
    },
  }
}

describe('AggregatedLiquidationsSeriesPrimitive', () => {
  it('never requests a redraw from updateAllViews', () => {
    const harness = createHarness()
    const primitive = new AggregatedLiquidationsSeriesPrimitive(() => ({ buckets: [] }))
    let requests = 0

    primitive.requestRedraw()
    assert.equal(requests, 0)

    primitive.attached({
      chart: harness.chart as never,
      series: harness.series as never,
      requestUpdate: () => {
        requests += 1
      },
    })
    assert.equal(requests, 0)

    primitive.updateAllViews()
    assert.equal(requests, 0)

    primitive.requestRedraw()
    assert.equal(requests, 1)

    primitive.detached()
    primitive.requestRedraw()
    assert.equal(requests, 1)
  })
})

describe('createAggregatedLiquidationsChartOverlay', () => {
  it('registers its pane role by series identity until dispose', () => {
    const harness = createHarness()
    const overlay = createAggregatedLiquidationsChartOverlay(harness.chart as never, 'bottom')
    assert.equal(
      resolveChartPaneRolePane(harness.chart as never, 'aggregated-liquidations'),
      harness.liquidationPane,
    )

    overlay.setPosition('top')
    assert.equal(
      resolveChartPaneRolePane(harness.chart as never, 'aggregated-liquidations'),
      harness.liquidationPane,
    )

    overlay.dispose()
    assert.equal(
      resolveChartPaneRolePane(harness.chart as never, 'aggregated-liquidations'),
      null,
    )
  })

  it('re-attaches the data once when the pane price scale has no range', () => {
    const harness = createHarness()
    const overlay = createAggregatedLiquidationsChartOverlay(harness.chart as never, 'bottom')

    // State B: the pane's price scale never received a visible-bar window, so
    // it has no range at all (empty axis, priceToCoordinate() === 0 for every
    // value, nothing drawn) until the price axis is double-clicked. Attaching
    // the data has to run the library's own pane recalculation a second time.
    harness.scaleState.visibleRange = null
    overlay.setBuckets([{ time: 60, long: 9_500, short: 400 }])

    assert.equal(harness.setDataCount, 2)

    overlay.dispose()
  })

  it('does not re-attach the data when the pane price scale already has a range', () => {
    const harness = createHarness()
    const overlay = createAggregatedLiquidationsChartOverlay(harness.chart as never, 'bottom')

    harness.scaleState.visibleRange = { from: 0, to: 930_000 }
    overlay.setBuckets([{ time: 60, long: 9_500, short: 400 }])
    assert.equal(harness.setDataCount, 1)

    // An empty pane still gets a placeholder range from the library, so the
    // healthy path stays a single setData.
    harness.scaleState.visibleRange = { from: -0.5, to: 0.5 }
    overlay.setBuckets([{ time: 120, long: 9_500, short: 400 }])
    assert.equal(harness.setDataCount, 2)

    overlay.dispose()
  })

  it('re-asserts autoscale for a pane born from a leaked manual candle price-scale template', () => {
    const harness = createHarness({ modelPriceScaleRecalculation: true })
    // A manual candle price scale was restored before this overlay existed. The
    // default `'right'` id is chart-global in Lightweight Charts 5, so the
    // restored `autoScale: false` becomes the template for panes created later
    // (refresh order: restore in `applyInitialSeries`, overlay after
    // `setChartReady(true)`).
    harness.template.autoScale = false

    const overlay = createAggregatedLiquidationsChartOverlay(harness.chart as never, 'bottom')

    // The pane must not inherit the manual template, and the template itself has
    // to be repaired so panes created later (e.g. RSI) are not born manual.
    assert.equal(harness.scaleState.autoScale, true)
    assert.equal(harness.template.autoScale, true)

    // Which is what makes the first real bucket land on a usable scale.
    overlay.setBuckets([{ time: 60, long: 9_500, short: 400 }])
    assert.deepEqual(harness.scaleState.visibleRange, { from: 0, to: 9_500 })

    overlay.dispose()
  })

  it('ends on the real autoscaled range when a manual candle viewport was restored first', () => {
    const harness = createHarness({ modelPriceScaleRecalculation: true })
    // 1. Manual candle viewport restored before the overlay exists: the chart-wide
    //    default `'right'` template is now `autoScale: false`.
    harness.template.autoScale = false

    // 2. The overlay is created afterwards (the refresh ordering), so its pane is
    //    born manual and gets the library's `[-0.5, 0.5]` creation placeholder.
    const overlay = createAggregatedLiquidationsChartOverlay(harness.chart as never, 'bottom')
    assert.deepEqual(harness.scaleState.visibleRange, { from: -0.5, to: 0.5 })

    // 3. The bucket effect runs before liquidation history arrives …
    overlay.setBuckets([])

    // 4. … and the real buckets follow.
    overlay.setBuckets([
      { time: 60, long: 9_500, short: 400 },
      { time: 120, long: 1_200, short: 750_000 },
    ])

    const range = harness.scaleState.visibleRange
    assert.notDeepEqual(range, { from: -0.5, to: 0.5 })
    assert.deepEqual(range, { from: 0, to: 750_000 })

    // The zero baseline sits at the pane bottom and the peak is inside the pane,
    // so the bars are drawn instead of being projected off-pane by the
    // placeholder (the `0` / `0.5` axis the issue reports).
    const zeroCoordinate = harness.priceToCoordinate(0)
    const peakCoordinate = harness.priceToCoordinate(750_000)
    assert.ok(zeroCoordinate !== null && zeroCoordinate > AGGREGATED_LIQUIDATIONS_PANE_HEIGHT_PX - 5)
    assert.ok(peakCoordinate !== null && peakCoordinate >= 0)
    assert.ok(peakCoordinate !== null && peakCoordinate <= AGGREGATED_LIQUIDATIONS_PANE_HEIGHT_PX)

    overlay.dispose()
  })

  it('moves the existing pane between Bottom and Top without recreating anything', () => {
    const harness = createHarness()
    const overlay = createAggregatedLiquidationsChartOverlay(harness.chart as never, 'bottom')

    assert.equal(harness.panes[1], harness.liquidationPane)
    assert.equal(harness.heights.get(harness.liquidationPane), AGGREGATED_LIQUIDATIONS_PANE_HEIGHT_PX)
    // `at(-2)`: creation re-asserts autoscale after the layout options.
    assert.deepEqual(harness.scaleOptions.at(-2), {
      invertScale: false,
      scaleMargins: { top: 0.08, bottom: 0 },
    })
    assert.equal(harness.requestUpdateCount, 0)

    overlay.setPosition('bottom')
    assert.equal(harness.requestUpdateCount, 0)

    overlay.setPosition('top')
    assert.equal(harness.panes[0], harness.liquidationPane)
    assert.equal(harness.panes[1], harness.candlePane)
    assert.equal(harness.heights.get(harness.liquidationPane), AGGREGATED_LIQUIDATIONS_PANE_HEIGHT_PX)
    // The position change applied the layout options last (the creation-time
    // autoscale re-assertion belongs to the entries before it).
    assert.deepEqual(harness.scaleOptions.at(-1), {
      invertScale: true,
      scaleMargins: { top: 0, bottom: 0.08 },
    })
    assert.equal(harness.requestUpdateCount, 1)
    assert.equal(harness.addSeriesCount, 1)
    assert.equal(harness.setDataCount, 0)

    const buckets = [{ time: 100, long: 40, short: 25 }]
    overlay.setBuckets(buckets)
    assert.equal(harness.setDataCount, 1)
    assert.equal(harness.requestUpdateCount, 2)

    overlay.setBuckets(buckets)
    assert.equal(harness.setDataCount, 1)
    assert.equal(harness.requestUpdateCount, 2)

    overlay.update()
    assert.equal(harness.requestUpdateCount, 3)

    overlay.setPosition('bottom')
    assert.equal(harness.panes[1], harness.liquidationPane)
    assert.equal(harness.panes[0], harness.candlePane)
    assert.equal(harness.requestUpdateCount, 4)
    assert.equal(harness.addSeriesCount, 1)

    overlay.dispose()
  })

  it('creates its series in a brand new pane instead of joining an existing one', () => {
    const harness = createHarness()
    createAggregatedLiquidationsChartOverlay(harness.chart as never, 'top')

    // The requested index equals the pane count at creation time, so the series
    // can never land in an existing pane.
    assert.deepEqual(harness.addSeriesPaneIndexes, [1])
    assert.equal(harness.panes.length, 2)
    assert.equal(harness.panes[0], harness.liquidationPane)
    assert.equal(harness.panes[1], harness.candlePane)
  })

  it('reports its current pane index and position so another pane can slot above it', () => {
    const harness = createHarness()
    const overlay = createAggregatedLiquidationsChartOverlay(harness.chart as never, 'bottom')

    assert.equal(overlay.getPosition(), 'bottom')
    assert.equal(overlay.getPaneIndex(), 1)

    overlay.setPosition('top')
    assert.equal(overlay.getPosition(), 'top')
    assert.equal(overlay.getPaneIndex(), 0)

    overlay.dispose()
  })

  it('never lands in the candle pane when the candle pane is not index 0', () => {
    // Some other pane already sits above the candles, so the candle pane is
    // index 1 and a hardcoded pane index 1 would join it, move it and shrink it.
    const harness = createHarness({ paneAboveCandles: true })
    const overlay = createAggregatedLiquidationsChartOverlay(harness.chart as never, 'bottom')

    assert.deepEqual(harness.addSeriesPaneIndexes, [2])
    assert.equal(harness.panes.length, 3)
    assert.equal(harness.panes[0], harness.otherPane)
    assert.equal(harness.panes[1], harness.candlePane)
    assert.equal(harness.panes[2], harness.liquidationPane)
    assert.equal(harness.heights.get(harness.candlePane), undefined)
    assert.deepEqual(
      harness.paneEvents.filter((event) => event.pane === harness.candlePane),
      [],
    )

    overlay.setPosition('top')
    assert.equal(harness.panes[0], harness.liquidationPane)
    assert.equal(harness.panes[2], harness.candlePane)
    assert.equal(harness.heights.get(harness.candlePane), undefined)
    assert.deepEqual(
      harness.paneEvents.filter((event) => event.pane === harness.candlePane),
      [],
    )

    overlay.dispose()
  })

  it('keeps create/dispose/recreate pane indices stable', () => {
    const harness = createHarness()
    const first = createAggregatedLiquidationsChartOverlay(harness.chart as never, 'top')
    assert.equal(harness.liquidationPane.paneIndex(), 0)
    assert.equal(harness.candlePane.paneIndex(), 1)

    first.dispose()
    assert.deepEqual(harness.panes, [harness.candlePane])

    const second = createAggregatedLiquidationsChartOverlay(harness.chart as never, 'top')
    assert.deepEqual(harness.addSeriesPaneIndexes, [1, 1])
    assert.equal(harness.liquidationPane.paneIndex(), 0)
    assert.equal(harness.candlePane.paneIndex(), 1)
    assert.equal(harness.panes.length, 2)

    second.setPosition('bottom')
    assert.equal(harness.candlePane.paneIndex(), 0)
    assert.equal(harness.liquidationPane.paneIndex(), 1)

    second.dispose()
    assert.deepEqual(harness.panes, [harness.candlePane])
    assert.equal(harness.candlePane.paneIndex(), 0)
  })

  it('never moves or resizes the pane that holds the candle series', () => {
    const harness = createHarness({ addSeriesJoinsCandlePane: true })
    const overlay = createAggregatedLiquidationsChartOverlay(harness.chart as never, 'top')

    assert.deepEqual(harness.paneEvents, [])
    assert.equal(harness.candlePane.paneIndex(), 0)
    assert.equal(harness.heights.get(harness.candlePane), undefined)
    assert.deepEqual(harness.scaleOptions, [])

    overlay.setPosition('top')
    overlay.setPosition('bottom')
    assert.deepEqual(harness.paneEvents, [])
    assert.deepEqual(harness.scaleOptions, [])

    overlay.dispose()
    assert.equal(harness.candlePane.paneIndex(), 0)
  })
})
