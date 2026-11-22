import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { RECTANGLE_FILL_OPACITY } from './rectangleColors.ts'
import {
  buildSessionVwapBandDrawModels,
  sessionVwapBandPriceRange,
  sessionVwapBandSampleWindow,
  sessionVwapPointsToBandPoints,
  type SessionVwapBandPoint,
} from './sessionVwapBandRenderGeometry.ts'

const FILL_STYLE = `rgba(115, 115, 115, ${RECTANGLE_FILL_OPACITY})`

function linearPoints(count: number, startTime = 0): SessionVwapBandPoint[] {
  return Array.from({ length: count }, (_, index) => ({
    time: startTime + index,
    upper1: 11 + (index % 5),
    lower1: 9 - (index % 3),
  }))
}

function countingPoints(points: readonly SessionVwapBandPoint[]) {
  let sampleReads = 0
  const proxy = new Proxy(points as SessionVwapBandPoint[], {
    get(target, property, receiver) {
      if (typeof property === 'string' && /^\d+$/.test(property)) sampleReads += 1
      return Reflect.get(target, property, receiver)
    },
  })
  return { points: proxy, sampleReads: () => sampleReads }
}

describe('sessionVwapPointsToBandPoints', () => {
  it('maps upper1 and lower1 without other fields', () => {
    const bandPoints = sessionVwapPointsToBandPoints([
      { time: 10, upper1: 12, lower1: 8, vwap: 10 },
    ])
    assert.deepEqual(bandPoints, [{ time: 10, upper1: 12, lower1: 8 }])
  })
})

describe('sessionVwapBandSampleWindow', () => {
  const points = linearPoints(10)

  it('returns an empty window without points or a visible range', () => {
    assert.deepEqual(sessionVwapBandSampleWindow([], { fromTime: 1, toTime: 2 }), {
      startIndex: 0,
      endIndex: 0,
    })
    assert.deepEqual(sessionVwapBandSampleWindow(points, null), {
      startIndex: 0,
      endIndex: 0,
    })
    assert.deepEqual(sessionVwapBandSampleWindow(points, { fromTime: 5, toTime: 4 }), {
      startIndex: 0,
      endIndex: 0,
    })
    assert.deepEqual(
      sessionVwapBandSampleWindow(points, { fromTime: Number.NaN, toTime: 4 }),
      { startIndex: 0, endIndex: 0 },
    )
  })

  it('includes one predecessor and one successor around the visible window', () => {
    assert.deepEqual(sessionVwapBandSampleWindow(points, { fromTime: 3, toTime: 6 }), {
      startIndex: 2,
      endIndex: 8,
    })
  })

  it('clamps at the first and last source samples', () => {
    assert.deepEqual(sessionVwapBandSampleWindow(points, { fromTime: 0, toTime: 9 }), {
      startIndex: 0,
      endIndex: 10,
    })
    assert.deepEqual(sessionVwapBandSampleWindow(points, { fromTime: -100, toTime: -50 }), {
      startIndex: 0,
      endIndex: 1,
    })
    assert.deepEqual(sessionVwapBandSampleWindow(points, { fromTime: 100, toTime: 200 }), {
      startIndex: 9,
      endIndex: 10,
    })
  })

  it('keeps both boundary samples when no sample time is inside the window', () => {
    assert.deepEqual(sessionVwapBandSampleWindow(points, { fromTime: 3.2, toTime: 3.8 }), {
      startIndex: 3,
      endIndex: 5,
    })
  })

  it('visits a logarithmic number of samples as history grows', () => {
    const small = countingPoints(linearPoints(1_000))
    const large = countingPoints(linearPoints(1_000_000))

    sessionVwapBandSampleWindow(small.points, { fromTime: 900, toTime: 999 })
    const smallReads = small.sampleReads()
    sessionVwapBandSampleWindow(large.points, { fromTime: 999_900, toTime: 999_999 })
    const largeReads = large.sampleReads()

    assert.ok(smallReads <= 2 * Math.ceil(Math.log2(1_000)) + 2)
    assert.ok(largeReads <= 2 * Math.ceil(Math.log2(1_000_000)) + 2)
    assert.ok(largeReads - smallReads <= 24)
  })
})

describe('buildSessionVwapBandDrawModels', () => {
  it('builds an independent simple contour for each contiguous run', () => {
    const models = buildSessionVwapBandDrawModels({
      points: [
        { time: 1, upper1: 11, lower1: 9 },
        { time: 2, upper1: null, lower1: 9 },
        { time: 3, upper1: 12, lower1: 8 },
        { time: 4, upper1: 13, lower1: 7 },
      ],
      visibleWindow: { fromTime: 1, toTime: 4 },
      barSpacing: 8,
      fillStyle: FILL_STYLE,
      timeToCoordinate: (time) => time * 10,
      priceToY: (price) => 100 - price,
    })

    assert.equal(models.length, 2)
    assert.equal(models[0].fillStyle, FILL_STYLE)
    assert.equal(models[1].fillStyle, FILL_STYLE)
    // Isolated bar at t=1, then a separate upper-forward/lower-reverse contour for t=3..4.
    assert.deepEqual(models[0].polygon, [6, 89, 14, 89, 14, 91, 6, 91])
    assert.deepEqual(models[1].polygon, [30, 88, 40, 87, 40, 93, 30, 92])
    const gapXs = new Set([20])
    for (const model of models) {
      for (let index = 0; index < model.polygon.length; index += 2) {
        assert.equal(gapXs.has(model.polygon[index]), false)
      }
    }
  })

  it('orders a multi-bar run as one contour instead of stacked quads', () => {
    const models = buildSessionVwapBandDrawModels({
      points: [
        { time: 1, upper1: 11, lower1: 9 },
        { time: 2, upper1: 12, lower1: 8 },
        { time: 3, upper1: 13, lower1: 7 },
      ],
      visibleWindow: { fromTime: 1, toTime: 3 },
      barSpacing: 8,
      fillStyle: 'rgba(0,0,0,0.2)',
      timeToCoordinate: (time) => time * 10,
      priceToY: (price) => 100 - price,
    })

    assert.equal(models.length, 1)
    assert.deepEqual(models[0].polygon, [10, 89, 20, 88, 30, 87, 30, 93, 20, 92, 10, 91])
  })

  it('splits a run when a plotted coordinate is missing', () => {
    const models = buildSessionVwapBandDrawModels({
      points: [
        { time: 1, upper1: 11, lower1: 9 },
        { time: 2, upper1: 12, lower1: 8 },
        { time: 3, upper1: 13, lower1: 7 },
      ],
      visibleWindow: { fromTime: 1, toTime: 3 },
      barSpacing: 8,
      fillStyle: 'rgba(0,0,0,0.2)',
      timeToCoordinate: (time) => (time === 2 ? null : Number(time) * 10),
      priceToY: (price) => 100 - price,
    })

    assert.equal(models.length, 2)
    assert.deepEqual(models[0].polygon, [6, 89, 14, 89, 14, 91, 6, 91])
    assert.deepEqual(models[1].polygon, [26, 87, 34, 87, 34, 93, 26, 93])
  })

  it('returns empty models when band is not visible in data', () => {
    const models = buildSessionVwapBandDrawModels({
      points: [{ time: 1, upper1: null, lower1: 9 }],
      visibleWindow: { fromTime: 1, toTime: 1 },
      barSpacing: 6,
      fillStyle: 'rgba(0,0,0,0.2)',
      timeToCoordinate: () => 5,
      priceToY: () => 5,
    })
    assert.deepEqual(models, [])
  })

  it('draws only the visible samples and their immediate neighbors', () => {
    const points = linearPoints(20)
    const convertedTimes: number[] = []
    const models = buildSessionVwapBandDrawModels({
      points,
      visibleWindow: { fromTime: 8, toTime: 12 },
      barSpacing: 8,
      fillStyle: FILL_STYLE,
      timeToCoordinate: (time) => {
        convertedTimes.push(Number(time))
        return Number(time) * 10
      },
      priceToY: (price) => 200 - price * 10,
    })

    assert.deepEqual(convertedTimes, [7, 8, 9, 10, 11, 12, 13])
    assert.equal(models.length, 1)
    assert.equal(models[0].polygon.length, 7 * 2 * 2)
  })

  it('does not traverse hidden history as the array grows at a fixed viewport', () => {
    const small = countingPoints(linearPoints(2_000))
    const large = countingPoints(linearPoints(200_000))
    let smallConversions = 0
    let largeConversions = 0

    const smallModels = buildSessionVwapBandDrawModels({
      points: small.points,
      visibleWindow: { fromTime: 1_800, toTime: 1_950 },
      barSpacing: 6,
      fillStyle: FILL_STYLE,
      timeToCoordinate: (time) => {
        smallConversions += 1
        return Number(time)
      },
      priceToY: (price) => price,
    })
    const largeModels = buildSessionVwapBandDrawModels({
      points: large.points,
      visibleWindow: { fromTime: 199_800, toTime: 199_950 },
      barSpacing: 6,
      fillStyle: FILL_STYLE,
      timeToCoordinate: (time) => {
        largeConversions += 1
        return Number(time)
      },
      priceToY: (price) => price,
    })

    const visibleSamples = 151
    const samplesWithNeighbors = visibleSamples + 2
    assert.ok(small.sampleReads() <= samplesWithNeighbors + 2 * Math.ceil(Math.log2(2_000)))
    assert.ok(large.sampleReads() <= samplesWithNeighbors + 2 * Math.ceil(Math.log2(200_000)))
    assert.ok(large.sampleReads() - small.sampleReads() <= 32)
    assert.equal(smallConversions, samplesWithNeighbors)
    assert.equal(largeConversions, samplesWithNeighbors)
    assert.equal(smallModels.length, 1)
    assert.equal(largeModels.length, 1)
    assert.equal(largeModels[0].polygon.length, samplesWithNeighbors * 2 * 2)
  })

  it('renders a segment that crosses the viewport with no sample inside', () => {
    const models = buildSessionVwapBandDrawModels({
      points: [
        { time: 0, upper1: 12, lower1: 8 },
        { time: 100, upper1: 14, lower1: 10 },
      ],
      visibleWindow: { fromTime: 40, toTime: 60 },
      barSpacing: 8,
      fillStyle: FILL_STYLE,
      timeToCoordinate: (time) => Number(time),
      priceToY: (price) => 100 - price,
    })

    assert.equal(models.length, 1)
    assert.deepEqual(models[0].polygon, [0, 88, 100, 86, 100, 90, 0, 92])
  })

  it('keeps an isolated edge sample with half-bar geometry', () => {
    const models = buildSessionVwapBandDrawModels({
      points: [
        { time: 0, upper1: 12, lower1: 8 },
        { time: 1, upper1: null, lower1: null },
        { time: 2, upper1: null, lower1: null },
      ],
      visibleWindow: { fromTime: 0, toTime: 2 },
      barSpacing: 10,
      fillStyle: FILL_STYLE,
      timeToCoordinate: (time) => Number(time) * 20,
      priceToY: (price) => 100 - price,
    })

    assert.equal(models.length, 1)
    assert.deepEqual(models[0].polygon, [-5, 88, 5, 88, 5, 92, -5, 92])
  })

  it('keeps explicit null gaps and never fills across them', () => {
    const points = linearPoints(11)
    points[5] = { time: 5, upper1: null, lower1: null }
    const models = buildSessionVwapBandDrawModels({
      points,
      visibleWindow: { fromTime: 3, toTime: 7 },
      barSpacing: 8,
      fillStyle: FILL_STYLE,
      timeToCoordinate: (time) => Number(time) * 10,
      priceToY: (price) => 100 - price,
    })

    assert.equal(models.length, 2)
    for (const model of models) {
      for (let index = 0; index < model.polygon.length; index += 2) {
        assert.notEqual(model.polygon[index], 50)
      }
    }
  })

  it('returns no geometry for a wholly off-pane window or missing visible range', () => {
    const points = linearPoints(5)
    assert.deepEqual(
      buildSessionVwapBandDrawModels({
        points,
        visibleWindow: null,
        barSpacing: 8,
        fillStyle: FILL_STYLE,
        timeToCoordinate: (time) => Number(time),
        priceToY: (price) => price,
      }),
      [],
    )
    assert.deepEqual(
      buildSessionVwapBandDrawModels({
        points: [],
        visibleWindow: { fromTime: 0, toTime: 10 },
        barSpacing: 8,
        fillStyle: FILL_STYLE,
        timeToCoordinate: (time) => Number(time),
        priceToY: (price) => price,
      }),
      [],
    )
  })
})

describe('sessionVwapBandPriceRange', () => {
  const points = [
    { time: 10, upper1: 12, lower1: 8 },
    { time: 20, upper1: null, lower1: 1 },
    { time: 30, upper1: 40, lower1: 5 },
    { time: 40, upper1: 15, lower1: 9 },
  ]

  it('uses only complete band samples inside the visible time window', () => {
    assert.deepEqual(sessionVwapBandPriceRange(points, 20, 30), {
      minValue: 5,
      maxValue: 40,
    })
  })

  it('ignores samples outside the visible window', () => {
    assert.deepEqual(sessionVwapBandPriceRange(points, 40, 40), {
      minValue: 9,
      maxValue: 15,
    })
  })

  it('returns null when the window has no fillable band', () => {
    assert.equal(sessionVwapBandPriceRange(points, 20, 20), null)
    assert.equal(sessionVwapBandPriceRange([], 10, 40), null)
  })

  it('keeps autoscale over the full source range independent of the draw window', () => {
    assert.deepEqual(sessionVwapBandPriceRange(points, 10, 40), {
      minValue: 5,
      maxValue: 40,
    })
  })

  it('keeps boundary-crossing autoscale samples that the bounded draw window omits', () => {
    const source = linearPoints(200)
    source[0] = { time: 0, upper1: 500, lower1: 1 }
    source[199] = { time: 199, upper1: 600, lower1: 2 }
    const models = buildSessionVwapBandDrawModels({
      points: source,
      visibleWindow: { fromTime: 90, toTime: 100 },
      barSpacing: 6,
      fillStyle: FILL_STYLE,
      timeToCoordinate: (time) => Number(time),
      priceToY: (price) => price,
    })

    assert.equal(models.length, 1)
    assert.equal(models[0].polygon.length, (100 - 90 + 3) * 2 * 2)
    assert.deepEqual(sessionVwapBandPriceRange(source, 0, 199), {
      minValue: 1,
      maxValue: 600,
    })
    assert.deepEqual(sessionVwapBandPriceRange(source, 90, 100), {
      minValue: 7,
      maxValue: 15,
    })
  })
})
