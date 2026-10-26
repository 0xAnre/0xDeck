import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  AggregatedLiquidationsSeriesPrimitive,
  createAggregatedLiquidationsChartOverlay,
} from './aggregatedLiquidationsChartSeries.ts'
import { AGGREGATED_LIQUIDATIONS_PANE_HEIGHT_PX } from './aggregatedLiquidationsPaneLayout.ts'

type FakePane = {
  paneIndex: () => number
  moveTo: (paneIndex: number) => void
  setHeight: (height: number) => void
  getHTMLElement: () => null
}

function createFakePane(panes: FakePane[], heights: Map<FakePane, number>): FakePane {
  const pane: FakePane = {
    paneIndex: () => panes.indexOf(pane),
    moveTo: (paneIndex) => {
      const from = panes.indexOf(pane)
      if (from < 0) return
      panes.splice(from, 1)
      panes.splice(paneIndex, 0, pane)
    },
    setHeight: (height) => {
      heights.set(pane, height)
    },
    getHTMLElement: () => null,
  }
  return pane
}

function createHarness() {
  const panes: FakePane[] = []
  const heights = new Map<FakePane, number>()
  const scaleOptions: Array<{
    invertScale?: boolean
    scaleMargins?: { top: number; bottom: number }
  }> = []
  const candlePane = createFakePane(panes, heights)
  panes.push(candlePane)
  const liquidationPane = createFakePane(panes, heights)

  let requestUpdateCount = 0
  let addSeriesCount = 0
  let setDataCount = 0
  let attachedPrimitive: AggregatedLiquidationsSeriesPrimitive | null = null

  const series = {
    getPane: () => liquidationPane,
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
      while (panes.length <= paneIndex) {
        panes.push(liquidationPane)
      }
      return series
    },
    panes: () => panes,
    timeScale: () => ({
      options: () => ({ barSpacing: 10 }),
      timeToCoordinate: () => null,
    }),
    removeSeries: () => {},
  }

  return {
    chart,
    series,
    panes,
    heights,
    scaleOptions,
    candlePane,
    liquidationPane,
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
})
