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
 */
function createHarness({
  addSeriesJoinsCandlePane = false,
  paneAboveCandles = false,
}: { addSeriesJoinsCandlePane?: boolean; paneAboveCandles?: boolean } = {}) {
  const panes: FakePane[] = []
  const heights = new Map<FakePane, number>()
  const paneEvents: PaneEvent[] = []
  const scaleOptions: Array<{
    invertScale?: boolean
    scaleMargins?: { top: number; bottom: number }
  }> = []
  const addSeriesPaneIndexes: number[] = []
  // Manual price-scale state, mirroring the `IPriceScaleApi` surface the
  // overlay reads and resets.
  const scaleState: {
    autoScale: boolean
    visibleRange: { from: number; to: number } | null
    setAutoScaleCalls: boolean[]
  } = { autoScale: true, visibleRange: null, setAutoScaleCalls: [] }
  // Visible time window, as reported by `ITimeScaleApi.getVisibleRange()`.
  const timeRangeState: {
    range: { from: number; to: number } | null
    handlers: Set<() => void>
  } = { range: { from: 0, to: 10_000_000 }, handlers: new Set() }
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
      },
      options: () => ({ autoScale: scaleState.autoScale }),
      getVisibleRange: () => scaleState.visibleRange,
      setAutoScale: (on: boolean) => {
        scaleState.setAutoScaleCalls.push(on)
        scaleState.autoScale = on
      },
    }),
    setData: () => {
      setDataCount += 1
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
    priceToCoordinate: () => null,
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
      }
      return series
    },
    panes: () => panes,
    timeScale: () => ({
      options: () => ({ barSpacing: 10 }),
      timeToCoordinate: () => null,
      getVisibleRange: () => timeRangeState.range,
      subscribeVisibleTimeRangeChange: (handler: () => void) => {
        timeRangeState.handlers.add(handler)
      },
      unsubscribeVisibleTimeRangeChange: (handler: () => void) => {
        timeRangeState.handlers.delete(handler)
      },
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
    timeRangeState,
    /** Simulates a pan/zoom: new visible window, then the library's callback. */
    changeVisibleTimeRange(range: { from: number; to: number } | null) {
      timeRangeState.range = range
      for (const handler of [...timeRangeState.handlers]) handler()
    },
    get visibleTimeRangeHandlerCount() {
      return timeRangeState.handlers.size
    },
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

  it('moves the existing pane between Bottom and Top without recreating anything', () => {
    const harness = createHarness()
    const overlay = createAggregatedLiquidationsChartOverlay(harness.chart as never, 'bottom')

    assert.equal(harness.panes[1], harness.liquidationPane)
    assert.equal(harness.heights.get(harness.liquidationPane), AGGREGATED_LIQUIDATIONS_PANE_HEIGHT_PX)
    assert.deepEqual(harness.scaleOptions.at(-1), {
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

  it('restores native autoscale when a manual price range cannot show a bar', () => {
    const harness = createHarness()
    const overlay = createAggregatedLiquidationsChartOverlay(harness.chart as never, 'bottom')

    // A manual range above every bar (an accidental axis zoom plus pane drag):
    // the pane would render nothing until the axis is double-clicked.
    harness.scaleState.autoScale = false
    harness.scaleState.visibleRange = { from: 1_000_000, to: 2_000_000 }
    overlay.setBuckets([{ time: 60, long: 9_500, short: 400 }])

    assert.deepEqual(harness.scaleState.setAutoScaleCalls, [true])
    assert.equal(harness.scaleState.autoScale, true)

    overlay.dispose()
  })

  it('judges the manual range against the on-screen bars, not the whole history', () => {
    const harness = createHarness()
    const overlay = createAggregatedLiquidationsChartOverlay(harness.chart as never, 'bottom')

    // A 1M bucket sits far off screen; only 9.5k is drawn. The manual range
    // hides every visible bar, so it must be replaced even though the manual
    // `low` is below the whole-history peak.
    harness.timeRangeState.range = { from: 900, to: 1_100 }
    harness.scaleState.autoScale = false
    harness.scaleState.visibleRange = { from: 500_000, to: 2_000_000 }
    overlay.setBuckets([
      { time: 60, long: 1_000_000, short: 0 },
      { time: 1_000, long: 9_500, short: 400 },
    ])

    assert.deepEqual(harness.scaleState.setAutoScaleCalls, [true])

    overlay.dispose()
  })

  it('leaves a manual range alone when no bar is on screen', () => {
    const harness = createHarness()
    const overlay = createAggregatedLiquidationsChartOverlay(harness.chart as never, 'bottom')

    // Nothing is drawn in this window, so there is nothing to protect: the
    // guard must not override the user's scale.
    harness.timeRangeState.range = { from: 5_000, to: 6_000 }
    harness.scaleState.autoScale = false
    harness.scaleState.visibleRange = { from: 500_000, to: 2_000_000 }
    overlay.setBuckets([{ time: 60, long: 9_500, short: 400 }])
    assert.deepEqual(harness.scaleState.setAutoScaleCalls, [])

    // Empty time scale: no visible window, so no judgement either.
    harness.changeVisibleTimeRange(null)
    assert.deepEqual(harness.scaleState.setAutoScaleCalls, [])

    overlay.dispose()
  })

  it('re-checks when panning or zooming changes the visible window', () => {
    const harness = createHarness()
    const overlay = createAggregatedLiquidationsChartOverlay(harness.chart as never, 'bottom')

    // Data change alone does not fire: the bucket is off screen at that moment.
    harness.timeRangeState.range = { from: 0, to: 10 }
    harness.scaleState.autoScale = false
    harness.scaleState.visibleRange = { from: 500_000, to: 2_000_000 }
    overlay.setBuckets([{ time: 1_000, long: 9_500, short: 400 }])
    assert.deepEqual(harness.scaleState.setAutoScaleCalls, [])

    // Panning brings that bar on screen: the manual range now hides it.
    harness.changeVisibleTimeRange({ from: 900, to: 1_100 })
    assert.deepEqual(harness.scaleState.setAutoScaleCalls, [true])

    overlay.dispose()
  })

  it('keeps a manual price range that still shows bars', () => {
    const harness = createHarness()
    const overlay = createAggregatedLiquidationsChartOverlay(harness.chart as never, 'bottom')

    // The user zoomed the pane; the bars are still inside the visible range, so
    // the manual scale is their intent and must survive.
    harness.scaleState.autoScale = false
    harness.scaleState.visibleRange = { from: 0, to: 20_000 }
    overlay.setBuckets([{ time: 60, long: 9_500, short: 400 }])
    assert.deepEqual(harness.scaleState.setAutoScaleCalls, [])

    harness.scaleState.visibleRange = { from: 4_000, to: 12_000 }
    overlay.setBuckets([{ time: 120, long: 9_500, short: 400 }])
    assert.deepEqual(harness.scaleState.setAutoScaleCalls, [])

    // Autoscale panes are never touched at all.
    harness.scaleState.autoScale = true
    harness.scaleState.visibleRange = { from: 1_000_000, to: 2_000_000 }
    overlay.setBuckets([{ time: 180, long: 9_500, short: 400 }])
    assert.deepEqual(harness.scaleState.setAutoScaleCalls, [])

    overlay.dispose()
  })

  it('never resets the candle pane scale when the series collides into it', () => {
    const harness = createHarness({ addSeriesJoinsCandlePane: true })
    const overlay = createAggregatedLiquidationsChartOverlay(harness.chart as never, 'bottom')

    harness.scaleState.autoScale = false
    harness.scaleState.visibleRange = { from: 1_000_000, to: 2_000_000 }
    overlay.setBuckets([{ time: 60, long: 9_500, short: 400 }])
    harness.changeVisibleTimeRange({ from: 0, to: 200 })

    assert.deepEqual(harness.scaleState.setAutoScaleCalls, [])

    overlay.dispose()
  })

  it('stops watching the visible range after dispose', () => {
    const harness = createHarness()
    const overlay = createAggregatedLiquidationsChartOverlay(harness.chart as never, 'bottom')
    assert.equal(harness.visibleTimeRangeHandlerCount, 1)

    overlay.dispose()
    assert.equal(harness.visibleTimeRangeHandlerCount, 0)

    harness.scaleState.autoScale = false
    harness.scaleState.visibleRange = { from: 1_000_000, to: 2_000_000 }
    harness.changeVisibleTimeRange({ from: 0, to: 200 })
    assert.deepEqual(harness.scaleState.setAutoScaleCalls, [])
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
