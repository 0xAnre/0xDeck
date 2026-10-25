import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { LineStyle } from 'lightweight-charts'
import {
  applyAnchoredVwapDrawingChartPresentation,
  clearAnchoredVwapDrawingChartSeriesData,
  createAnchoredVwapDrawingChartSeriesBundle,
  removeAnchoredVwapDrawingChartSeriesBundle,
  setAnchoredVwapDrawingChartSeriesData,
  updateAnchoredVwapDrawingChartSeriesLast,
} from './anchoredVwapDrawingChartSeries.ts'
import type { AnchoredVwapBandFillPairContext } from './anchoredVwapBandFillSeriesPrimitive.ts'
import {
  createDefaultAnchoredVwapDrawingSettings,
  type AnchoredVwapDrawingSettings,
} from './anchoredVwapDrawingSettings.ts'
import type { AnchoredVwapDrawingPoint } from './anchoredVwapDrawing.ts'
import type { AnchoredVwapInstance } from './anchoredVwapInstances.ts'

type MockSeries = {
  options: Record<string, unknown>
  applied: Record<string, unknown>[]
  data: unknown[]
  updates: unknown[]
  primitives: unknown[]
  applyOptions: (options: Record<string, unknown>) => void
  setData: (data: unknown[]) => void
  update: (point: unknown) => void
  attachPrimitive: (primitive: unknown) => void
  detachPrimitive: (primitive: unknown) => void
  priceToCoordinate: () => number | null
}

function createMockChart() {
  const series: MockSeries[] = []
  let removed = 0
  const chart = {
    addSeries: (_type: unknown, options: Record<string, unknown>) => {
      const mock: MockSeries = {
        options,
        applied: [],
        data: [],
        updates: [],
        primitives: [],
        applyOptions: (opts) => {
          mock.applied.push(opts)
        },
        setData: (data) => {
          mock.data = data
        },
        update: (point) => {
          mock.updates.push(point)
        },
        attachPrimitive: (primitive) => {
          mock.primitives.push(primitive)
        },
        detachPrimitive: () => {},
        priceToCoordinate: () => null,
      }
      series.push(mock)
      return mock
    },
    removeSeries: () => {
      removed += 1
    },
  }
  return { chart, series, removedCount: () => removed }
}

function instanceWith(settings: AnchoredVwapDrawingSettings): AnchoredVwapInstance {
  return {
    id: 'avwap-test',
    anchorTime: 1_700_000_000,
    displaySequence: 1,
    settings,
  }
}

const FILL_POINTS: AnchoredVwapDrawingPoint[] = [
  { time: 1, vwap: 10, upper1: 12, lower1: 8, upper2: 13, lower2: 7, upper3: 14, lower3: 6 },
  { time: 2, vwap: 11, upper1: null, lower1: 9, upper2: 14, lower2: 8, upper3: 15, lower3: 7 },
]

describe('anchoredVwapDrawingChartSeries band colors', () => {
  it('creates each band side with its own configured color and opacity', () => {
    const settings = createDefaultAnchoredVwapDrawingSettings()
    settings.band1.upperColor = '#111111'
    settings.band1.upperOpacity = 100
    settings.band1.lowerColor = '#222222'
    settings.band1.lowerOpacity = 40
    settings.band2.upperColor = '#333333'
    settings.band2.upperOpacity = 25
    settings.band2.lowerColor = '#444444'
    settings.band2.lowerOpacity = 100
    const { chart, series } = createMockChart()

    createAnchoredVwapDrawingChartSeriesBundle(chart as never, settings, 'Anchored VWAP 1')

    // series[0] is the center VWAP line, then upper1, lower1, upper2, lower2, ...
    assert.equal(series[1].options.color, '#111111')
    assert.equal(series[2].options.color, 'rgba(34, 34, 34, 0.4)')
    assert.equal(series[3].options.color, 'rgba(51, 51, 51, 0.25)')
    assert.equal(series[4].options.color, '#444444')
  })

  it('applies independent upper/lower colors and preserves width and style', () => {
    const settings = createDefaultAnchoredVwapDrawingSettings()
    const { chart, series } = createMockChart()
    const bundle = createAnchoredVwapDrawingChartSeriesBundle(
      chart as never,
      settings,
      'Anchored VWAP 1',
    )

    settings.band1.upperColor = '#abcdef'
    settings.band1.upperOpacity = 100
    settings.band1.lowerColor = '#fedcba'
    settings.band1.lowerOpacity = 100
    settings.band1.lineWidth = 3
    settings.band1.lineStyle = 'dotted'
    applyAnchoredVwapDrawingChartPresentation(bundle, instanceWith(settings), 'Anchored VWAP 1')

    const upperApplied = series[1].applied.at(-1)!
    const lowerApplied = series[2].applied.at(-1)!
    assert.equal(upperApplied.color, '#abcdef')
    assert.equal(lowerApplied.color, '#fedcba')
    assert.equal(upperApplied.lineWidth, 3)
    assert.equal(lowerApplied.lineWidth, 3)
    assert.equal(upperApplied.lineStyle, LineStyle.Dotted)
    assert.equal(lowerApplied.lineStyle, LineStyle.Dotted)
  })

  it('resolves the fill style from fill color and opacity', () => {
    const settings = createDefaultAnchoredVwapDrawingSettings()
    settings.band1.fillColor = '#4caf50'
    settings.band1.fillOpacity = 25
    const { chart } = createMockChart()
    const bundle = createAnchoredVwapDrawingChartSeriesBundle(
      chart as never,
      settings,
      'Anchored VWAP 1',
    )

    applyAnchoredVwapDrawingChartPresentation(bundle, instanceWith(settings), 'Anchored VWAP 1')
    assert.equal(bundle.bandFillPairs[0].fillStyle, 'rgba(76, 175, 80, 0.25)')
  })
})

describe('anchoredVwapDrawingChartSeries fill data', () => {
  it('pushes per-pair fill points from the computed series points', () => {
    const settings = createDefaultAnchoredVwapDrawingSettings()
    const { chart } = createMockChart()
    const bundle = createAnchoredVwapDrawingChartSeriesBundle(
      chart as never,
      settings,
      'Anchored VWAP 1',
    )
    const calls: AnchoredVwapBandFillPairContext[][] = []
    bundle.bandFill.setPairs = (pairs) => {
      calls.push([...pairs])
    }

    setAnchoredVwapDrawingChartSeriesData(bundle, FILL_POINTS)

    assert.equal(calls.length, 1)
    assert.deepEqual(calls[0][0].points, [
      { time: 1, upper: 12, lower: 8 },
      { time: 2, upper: null, lower: 9 },
    ])
    assert.deepEqual(calls[0][1].points, [
      { time: 1, upper: 13, lower: 7 },
      { time: 2, upper: 14, lower: 8 },
    ])
    assert.deepEqual(calls[0][2].points, [
      { time: 1, upper: 14, lower: 6 },
      { time: 2, upper: 15, lower: 7 },
    ])
  })

  it('replaces the last fill point on live updates and appends new bars', () => {
    const settings = createDefaultAnchoredVwapDrawingSettings()
    const { chart } = createMockChart()
    const bundle = createAnchoredVwapDrawingChartSeriesBundle(
      chart as never,
      settings,
      'Anchored VWAP 1',
    )
    setAnchoredVwapDrawingChartSeriesData(bundle, FILL_POINTS)

    updateAnchoredVwapDrawingChartSeriesLast(bundle, {
      time: 2,
      vwap: 12,
      upper1: 20,
      lower1: 4,
      upper2: 21,
      lower2: 5,
      upper3: 22,
      lower3: 6,
    })
    assert.equal(bundle.bandFillPairs[0].points.length, 2)
    assert.deepEqual(bundle.bandFillPairs[0].points.at(-1), { time: 2, upper: 20, lower: 4 })

    updateAnchoredVwapDrawingChartSeriesLast(bundle, {
      time: 3,
      vwap: 13,
      upper1: 30,
      lower1: 3,
      upper2: 31,
      lower2: 4,
      upper3: 32,
      lower3: 5,
    })
    assert.equal(bundle.bandFillPairs[0].points.length, 3)
    assert.deepEqual(bundle.bandFillPairs[0].points.at(-1), { time: 3, upper: 30, lower: 3 })
  })

  it('clears fill points when the series data is cleared', () => {
    const settings = createDefaultAnchoredVwapDrawingSettings()
    const { chart } = createMockChart()
    const bundle = createAnchoredVwapDrawingChartSeriesBundle(
      chart as never,
      settings,
      'Anchored VWAP 1',
    )
    setAnchoredVwapDrawingChartSeriesData(bundle, FILL_POINTS)

    clearAnchoredVwapDrawingChartSeriesData(bundle)
    assert.deepEqual(bundle.bandFillPairs[0].points, [])
    assert.deepEqual(bundle.bandFillPairs[1].points, [])
    assert.deepEqual(bundle.bandFillPairs[2].points, [])
  })

  it('disposes the fill primitive and removes every series', () => {
    const settings = createDefaultAnchoredVwapDrawingSettings()
    const { chart, removedCount } = createMockChart()
    const bundle = createAnchoredVwapDrawingChartSeriesBundle(
      chart as never,
      settings,
      'Anchored VWAP 1',
    )
    let disposed = false
    bundle.bandFill.dispose = () => {
      disposed = true
    }

    removeAnchoredVwapDrawingChartSeriesBundle(chart as never, bundle)
    assert.equal(disposed, true)
    assert.equal(removedCount(), 7)
  })
})
