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

function createMockLineSeries(
  points: Array<{ time: number; value: number }>,
  visible = true,
): ISeriesApi<'Line', Time> {
  return {
    options: () => ({ visible }),
    data: () => points,
    priceToCoordinate: (value: number) => value,
  } as ISeriesApi<'Line', Time>
}

describe('resolveVisibleLineSegmentIndexBounds', () => {
  it('returns the full segment range when logical range is unavailable', () => {
    const chart = createMockChart(null)
    assert.deepEqual(resolveVisibleLineSegmentIndexBounds(chart, 100), {
      startIndex: 0,
      endIndex: 98,
    })
  })

  it('limits segments to the visible logical range plus one boundary segment', () => {
    const chart = createMockChart({ from: 10.2, to: 20.8 })
    assert.deepEqual(resolveVisibleLineSegmentIndexBounds(chart, 1000), {
      startIndex: 9,
      endIndex: 22,
    })
  })

  it('returns no segments when data is too short', () => {
    const chart = createMockChart({ from: 0, to: 10 })
    assert.deepEqual(resolveVisibleLineSegmentIndexBounds(chart, 1), {
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
    assert.equal(hitTestLineSeriesAtPane(chart, series, 400.5, 50), false)
  })
})
