import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { FixedRangeVolumeProfileDevelopingSample } from './fixedRangeVolumeProfile.ts'
import {
  buildFrvpDevelopingStepRuns,
  resolveFrvpDevelopingSampleWindow,
  type FrvpDevelopingLevel,
  type FrvpDevelopingStepRun,
} from './frvpDevelopingStepLine.ts'

function sample(
  time: number,
  pocPrice: number | null,
  vah: number | null = null,
  val: number | null = null,
): FixedRangeVolumeProfileDevelopingSample {
  return { time, pocPrice, vah, val }
}

/** time → x with one candle every 10 px; price → y flipped like a chart pane. */
const timeToX = (time: number) => time / 10
const priceToY = (price: number) => 500 - price

function runsFor(
  samples: readonly FixedRangeVolumeProfileDevelopingSample[],
  options: {
    level?: FrvpDevelopingLevel
    rangeStartX?: number
    rangeEndX?: number
    timeToX?: (time: number) => number | null
    priceToY?: (price: number) => number | null
    visibleTimeRange?: { fromTime: number; toTime: number } | null
  } = {},
): FrvpDevelopingStepRun[] {
  return buildFrvpDevelopingStepRuns({
    samples,
    level: options.level ?? 'poc',
    rangeStartX: options.rangeStartX ?? 9.5,
    rangeEndX: options.rangeEndX ?? 14.5,
    timeToX: options.timeToX ?? timeToX,
    priceToY: options.priceToY ?? priceToY,
    visibleTimeRange: options.visibleTimeRange,
  })
}

describe('resolveFrvpDevelopingSampleWindow', () => {
  const samples = [sample(100, 1), sample(110, 1), sample(120, 2), sample(130, 2)]

  it('returns every sample without a visible range', () => {
    assert.deepEqual(resolveFrvpDevelopingSampleWindow(samples, null), {
      startIndex: 0,
      endIndex: 3,
    })
    assert.deepEqual(resolveFrvpDevelopingSampleWindow(samples, undefined), {
      startIndex: 0,
      endIndex: 3,
    })
  })

  it('keeps the sample whose step spans each visible edge', () => {
    // [110, 120] is visible: step 110→120 is at index 1 and step 120→130 at index 2.
    assert.deepEqual(resolveFrvpDevelopingSampleWindow(samples, { fromTime: 110, toTime: 120 }), {
      startIndex: 1,
      endIndex: 2,
    })
    // Between samples: the previous sample's step still covers `fromTime`.
    assert.deepEqual(resolveFrvpDevelopingSampleWindow(samples, { fromTime: 115, toTime: 125 }), {
      startIndex: 1,
      endIndex: 3,
    })
  })

  it('clamps ranges outside the samples and normalizes reversed bounds', () => {
    assert.deepEqual(resolveFrvpDevelopingSampleWindow(samples, { fromTime: 0, toTime: 50 }), {
      startIndex: 0,
      endIndex: 0,
    })
    assert.deepEqual(resolveFrvpDevelopingSampleWindow(samples, { fromTime: 200, toTime: 300 }), {
      startIndex: 3,
      endIndex: 3,
    })
    assert.deepEqual(resolveFrvpDevelopingSampleWindow(samples, { fromTime: 130, toTime: 100 }), {
      startIndex: 0,
      endIndex: 3,
    })
  })

  it('returns an empty window for an empty sample list', () => {
    assert.deepEqual(resolveFrvpDevelopingSampleWindow([], { fromTime: 0, toTime: 100 }), {
      startIndex: 0,
      endIndex: -1,
    })
  })
})

describe('buildFrvpDevelopingStepRuns', () => {
  it('returns no runs for an empty sample list', () => {
    assert.deepEqual(runsFor([]), [])
  })

  it('draws a single-bar range from the range start to the range end', () => {
    const runs = runsFor([sample(100, 10)])
    assert.deepEqual(runs, [
      {
        points: [
          { x: 9.5, y: 490 },
          { x: 14.5, y: 490 },
        ],
      },
    ])
  })

  it('holds a level until it changes, then steps to the new level', () => {
    const runs = runsFor([
      sample(100, 10),
      sample(110, 10),
      sample(120, 20),
      sample(130, 20),
      sample(140, 30),
    ])
    assert.equal(runs.length, 1)
    assert.deepEqual(runs[0].points, [
      { x: 9.5, y: 490 },
      { x: 12, y: 490 },
      { x: 12, y: 480 },
      { x: 14, y: 480 },
      { x: 14, y: 470 },
      { x: 14.5, y: 470 },
    ])
  })

  it('ends the final step on the range end at the full-range level', () => {
    const runs = runsFor([sample(100, 40), sample(110, 30), sample(120, 20)])
    const lastRun = runs[runs.length - 1]
    const last = lastRun.points[lastRun.points.length - 1]
    assert.deepEqual(last, { x: 14.5, y: 480 })
  })

  it('draws independent levels from the same samples', () => {
    const samples = [sample(100, 10, 30, 5), sample(110, 10, 35, 4)]
    const poc = runsFor(samples, { level: 'poc' })
    const vah = runsFor(samples, { level: 'vah' })
    const val = runsFor(samples, { level: 'val' })
    assert.deepEqual(poc[0].points, [
      { x: 9.5, y: 490 },
      { x: 14.5, y: 490 },
    ])
    assert.deepEqual(vah[0].points, [
      { x: 9.5, y: 470 },
      { x: 11, y: 470 },
      { x: 11, y: 465 },
      { x: 14.5, y: 465 },
    ])
    assert.deepEqual(val[0].points, [
      { x: 9.5, y: 495 },
      { x: 11, y: 495 },
      { x: 11, y: 496 },
      { x: 14.5, y: 496 },
    ])
  })

  it('splits the series into contiguous runs around missing levels', () => {
    const runs = runsFor([sample(100, 10), sample(110, null), sample(120, 20)])
    assert.equal(runs.length, 2)
    assert.deepEqual(runs[0].points, [
      { x: 9.5, y: 490 },
      { x: 11, y: 490 },
    ])
    assert.deepEqual(runs[1].points, [
      { x: 12, y: 480 },
      { x: 14.5, y: 480 },
    ])
  })

  it('splits the series when a coordinate cannot be resolved', () => {
    const runs = runsFor([sample(100, 10), sample(110, 20), sample(120, 30)], {
      timeToX: (time) => (time === 120 ? null : timeToX(time)),
    })
    assert.equal(runs.length, 1)
    // The 110 step cannot reach its next bar, so the series closes there; the
    // 120 step has no resolvable x and starts nothing.
    assert.deepEqual(runs[0].points, [
      { x: 9.5, y: 490 },
      { x: 11, y: 490 },
    ])
  })

  it('returns no runs when the range bounds are not finite', () => {
    assert.deepEqual(runsFor([sample(100, 10)], { rangeStartX: Number.NaN }), [])
    assert.deepEqual(runsFor([sample(100, 10)], { rangeEndX: Number.POSITIVE_INFINITY }), [])
  })

  it('matches the full geometry inside a sliced visible window', () => {
    const samples = Array.from({ length: 40 }, (_, index) =>
      sample(100 + index * 10, 10 + (index % 3)),
    )
    const full = runsFor(samples)
    const windowed = runsFor(samples, { visibleTimeRange: { fromTime: 200, toTime: 250 } })

    assert.equal(windowed.length, 1)
    const windowPoints = windowed[0].points
    const fullPoints = full[0].points
    // The windowed run covers the visible steps at the same coordinates.
    assert.ok(windowPoints.length < fullPoints.length)
    // Sample 10 (time 200) is the step that spans the window's left edge.
    assert.deepEqual(windowPoints[0], { x: 20, y: 489 })
    for (const point of windowPoints) {
      assert.ok(point.x >= 20 && point.x <= 26)
    }
  })

  it('bounds the walked geometry to the visible samples', () => {
    const samples = Array.from({ length: 1_000 }, (_, index) => sample(100 + index * 10, 20))
    const full = runsFor(samples)
    const windowed = runsFor(samples, { visibleTimeRange: { fromTime: 4000, toTime: 4100 } })

    assert.equal(full.length, 1)
    assert.equal(windowed.length, 1)
    // 11 visible candles collapse into a flat run; the walk never touches the
    // other 989 samples.
    assert.deepEqual(windowed[0].points, [
      { x: 400, y: 480 },
      { x: 411, y: 480 },
    ])
  })
})
