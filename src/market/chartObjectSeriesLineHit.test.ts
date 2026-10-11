import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts'
import {
  hitTestLineSeriesAtPane,
  resolveVisibleLineSegmentIndexBounds,
} from './chartObjectSeriesLineHit.ts'

function createMockChart(visibleLogicalRange: { from: number; to: number } | null): IChartApi {
  return {
    timeScale: () => ({
      getVisibleLogicalRange: () => visibleLogicalRange,
      timeToCoordinate: (time: Time) => (typeof time === 'number' ? time : null),
    }),
  } as IChartApi
}

type MockLineSeriesOptions = {
  visible?: boolean
  /** Chart logical index of series.data()[0] when the series omits leading bars. */
  firstLogicalIndex?: number
}

function createMockLineSeries(
  points: Array<{ time: number; value: number }>,
  options: MockLineSeriesOptions = {},
): ISeriesApi<'Line', Time> {
  const visible = options.visible ?? true
  const firstLogicalIndex = options.firstLogicalIndex ?? 0

  return {
    options: () => ({ visible }),
    data: () => points,
    dataByIndex: (logicalIndex: number) => {
      const dataIndex = logicalIndex - firstLogicalIndex
      if (dataIndex < 0 || dataIndex >= points.length) {
        return null
      }
      return points[dataIndex]
    },
    priceToCoordinate: (value: number) => value,
    barsInLogicalRange: (range) => {
      if (points.length === 0) {
        return null
      }
      const lastLogicalIndex = firstLogicalIndex + points.length - 1
      const fromLogical = Math.max(firstLogicalIndex, Math.ceil(range.from))
      const toLogical = Math.min(lastLogicalIndex, Math.floor(range.to))
      if (fromLogical > toLogical) {
        return {
          barsBefore: Math.floor(range.from - firstLogicalIndex),
          barsAfter: Math.floor(lastLogicalIndex - range.to),
        }
      }
      const fromIndex = fromLogical - firstLogicalIndex
      const toIndex = toLogical - firstLogicalIndex
      return {
        barsBefore: Math.floor(range.from - firstLogicalIndex),
        barsAfter: Math.floor(lastLogicalIndex - range.to),
        from: points[fromIndex].time,
        to: points[toIndex].time,
      }
    },
  } as ISeriesApi<'Line', Time>
}

describe('resolveVisibleLineSegmentIndexBounds', () => {
  it('returns the full segment range when logical range is unavailable', () => {
    const chart = createMockChart(null)
    const series = createMockLineSeries(
      Array.from({ length: 100 }, (_, index) => ({ time: index, value: index })),
    )
    assert.deepEqual(resolveVisibleLineSegmentIndexBounds(chart, series), {
      startIndex: 0,
      endIndex: 98,
    })
  })

  it('limits segments using series bars in the visible logical range', () => {
    const chart = createMockChart({ from: 10.2, to: 20.8 })
    const series = createMockLineSeries(
      Array.from({ length: 1000 }, (_, index) => ({ time: index, value: index })),
    )
    assert.deepEqual(resolveVisibleLineSegmentIndexBounds(chart, series), {
      startIndex: 10,
      endIndex: 21,
    })
  })

  it('uses integral data indexes when logical range is fractional', () => {
    const chart = createMockChart({ from: 10.2, to: 20.8 })
    const series = createMockLineSeries(
      Array.from({ length: 100 }, (_, index) => ({ time: index, value: index })),
    )
    const { startIndex, endIndex } = resolveVisibleLineSegmentIndexBounds(chart, series)
    assert.equal(Number.isInteger(startIndex), true)
    assert.equal(Number.isInteger(endIndex), true)
    assert.equal(hitTestLineSeriesAtPane(chart, series, 15.5, 15), true)
  })

  it('maps visible logical range to compact indicator data', () => {
    const chart = createMockChart({ from: 900, to: 999 })
    const series = createMockLineSeries(
      Array.from({ length: 801 }, (_, index) => ({
        time: 199 + index,
        value: index,
      })),
      { firstLogicalIndex: 199 },
    )
    assert.deepEqual(resolveVisibleLineSegmentIndexBounds(chart, series), {
      startIndex: 899,
      endIndex: 1000,
    })
  })

  it('returns no segments when data is too short', () => {
    const chart = createMockChart({ from: 0, to: 10 })
    const series = createMockLineSeries([{ time: 0, value: 1 }])
    assert.deepEqual(resolveVisibleLineSegmentIndexBounds(chart, series), {
      startIndex: 0,
      endIndex: -1,
    })
  })
})

describe('hitTestLineSeriesAtPane', () => {
  it('hits a segment inside the visible logical range', () => {
    const chart = createMockChart({ from: 0, to: 5 })
    const series = createMockLineSeries([
      { time: 0, value: 0 },
      { time: 1, value: 10 },
      { time: 2, value: 0 },
      { time: 3, value: 10 },
      { time: 4, value: 0 },
      { time: 5, value: 10 },
    ])
    assert.equal(hitTestLineSeriesAtPane(chart, series, 0.5, 5), true)
  })

  it('does not scan segments far outside the visible logical range', () => {
    const chart = createMockChart({ from: 0, to: 2 })
    const points = Array.from({ length: 500 }, (_, index) => ({
      time: index,
      value: index % 2 === 0 ? 0 : 100,
    }))
    const series = createMockLineSeries(points)
    let dataCalls = 0
    Object.defineProperty(series, 'data', {
      get: () => {
        dataCalls += 1
        return points
      },
    })
    assert.equal(hitTestLineSeriesAtPane(chart, series, 400.5, 50), false)
    assert.equal(dataCalls, 0)
  })

  it('hits indicators that omit leading bars when viewing recent history', () => {
    const chart = createMockChart({ from: 900, to: 999 })
    const points = Array.from({ length: 801 }, (_, index) => ({
      time: 199 + index,
      value: index % 2 === 0 ? 0 : 100,
    }))
    const series = createMockLineSeries(points, { firstLogicalIndex: 199 })
    assert.equal(hitTestLineSeriesAtPane(chart, series, 950.5, 50), true)
  })
})
