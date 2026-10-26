import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  AggregatedLiquidationsSeriesPrimitive,
  createAggregatedLiquidationsChartOverlay,
} from './aggregatedLiquidationsChartSeries.ts'
import { AGGREGATED_LIQUIDATIONS_PANE_HEIGHT_PX } from './aggregatedLiquidationsPaneLayout.ts'
import { registerCandleChartSeries } from './candlePane.ts'

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
