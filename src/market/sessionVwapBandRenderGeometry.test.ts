import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { RECTANGLE_FILL_OPACITY } from './rectangleColors.ts'
import {
  buildSessionVwapBandDrawModels,
  sessionVwapBandPriceRange,
  sessionVwapPointsToBandPoints,
} from './sessionVwapBandRenderGeometry.ts'

describe('sessionVwapPointsToBandPoints', () => {
  it('maps upper1 and lower1 without other fields', () => {
    const bandPoints = sessionVwapPointsToBandPoints([
      { time: 10, upper1: 12, lower1: 8, vwap: 10 },
    ])
    assert.deepEqual(bandPoints, [{ time: 10, upper1: 12, lower1: 8 }])
  })
})

describe('buildSessionVwapBandDrawModels', () => {
  it('builds an independent simple contour for each contiguous run', () => {
    const fillStyle = `rgba(115, 115, 115, ${RECTANGLE_FILL_OPACITY})`
    const models = buildSessionVwapBandDrawModels({
      points: [
        { time: 1, upper1: 11, lower1: 9 },
        { time: 2, upper1: null, lower1: 9 },
        { time: 3, upper1: 12, lower1: 8 },
        { time: 4, upper1: 13, lower1: 7 },
      ],
      barSpacing: 8,
      fillStyle,
      timeToCoordinate: (time) => time * 10,
      priceToY: (price) => 100 - price,
    })

    assert.equal(models.length, 2)
    assert.equal(models[0].fillStyle, fillStyle)
    assert.equal(models[1].fillStyle, fillStyle)
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
      barSpacing: 6,
      fillStyle: 'rgba(0,0,0,0.2)',
      timeToCoordinate: () => 5,
      priceToY: () => 5,
    })
    assert.deepEqual(models, [])
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
})
