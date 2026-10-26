import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildAggregatedLiquidationBarModels,
  liquidationSideWidths,
} from './aggregatedLiquidationsRenderGeometry.ts'

function bottomScale(value: number): number {
  // Bottom position: zero at the pane baseline (y=100), values grow upward.
  return 100 - value
}

function topScale(value: number): number {
  // Top position inverts the pane scale: zero at the top (y=0), values grow down.
  return value
}

describe('liquidationSideWidths', () => {
  it('reserves two non-overlapping halves inside the candle slot', () => {
    const { totalWidth, sideWidth, gap } = liquidationSideWidths(10)
    assert.ok(sideWidth > 0)
    assert.ok(sideWidth * 2 + gap <= totalWidth + 0.001)
  })

  it('keeps both sides at least one pixel wide for tiny bar spacing', () => {
    const { sideWidth } = liquidationSideWidths(0)
    assert.ok(sideWidth >= 1)
  })
})

describe('buildAggregatedLiquidationBarModels', () => {
  const buckets = [
    { time: 100, long: 40, short: 25 },
    { time: 200, long: 0, short: 10 },
    { time: 300, long: 10, short: 0 },
  ]

  it('renders long and short side by side in a bucket that has both', () => {
    const models = buildAggregatedLiquidationBarModels({
      buckets: [buckets[0]],
      barSpacing: 12,
      timeToCoordinate: () => 50,
      valueToCoordinate: bottomScale,
    })
    assert.equal(models.length, 1)
    const long = models[0].long
    const short = models[0].short
    assert.ok(long)
    assert.ok(short)
    // Disjoint x ranges: neither side can hide the other.
    assert.ok(long.x + long.width <= short.x)
    assert.ok(short.x + short.width > long.x + long.width)
    assert.equal(long.bottom, 100)
    assert.equal(short.bottom, 100)
    assert.ok(long.top < long.bottom)
    assert.ok(short.top < short.bottom)
  })

  it('grows downward when the value scale is inverted for Top position', () => {
    const models = buildAggregatedLiquidationBarModels({
      buckets: [buckets[0]],
      barSpacing: 12,
      timeToCoordinate: () => 50,
      valueToCoordinate: topScale,
    })
    const long = models[0].long
    assert.ok(long)
    assert.equal(long.top, 0)
    assert.equal(long.bottom, 40)
  })

  it('omits a zero side and buckets outside the chart x range', () => {
    const models = buildAggregatedLiquidationBarModels({
      buckets,
      barSpacing: 12,
      timeToCoordinate: (time) => (time === 200 ? null : time),
      valueToCoordinate: bottomScale,
    })
    assert.equal(models.length, 2)
    assert.equal(models[0].long !== null, true)
    assert.equal(models[0].short !== null, true)
    // time=200 is outside the visible range, time=300 has only a long side.
    assert.equal(models[1].time, 300)
    assert.equal(models[1].long !== null, true)
    assert.equal(models[1].short, null)
  })

  it('renders no models when the price scale is unavailable', () => {
    assert.deepEqual(
      buildAggregatedLiquidationBarModels({
        buckets,
        barSpacing: 12,
        timeToCoordinate: () => 50,
        valueToCoordinate: () => null,
      }),
      [],
    )
  })
})
