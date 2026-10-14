import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  anchoredVwapDrawingPointsToBandFillPoints,
  buildAnchoredVwapBandFillDrawModels,
} from './anchoredVwapBandFillGeometry.ts'

describe('anchoredVwapDrawingPointsToBandFillPoints', () => {
  it('maps only the requested upper/lower pair', () => {
    const points = [
      {
        time: 10,
        vwap: 10,
        upper1: 12,
        lower1: 8,
        upper2: 14,
        lower2: 6,
        upper3: 16,
        lower3: 4,
      },
    ]
    assert.deepEqual(anchoredVwapDrawingPointsToBandFillPoints(points, 'upper2', 'lower2'), [
      { time: 10, upper: 14, lower: 6 },
    ])
  })
})

describe('buildAnchoredVwapBandFillDrawModels', () => {
  it('builds one contour per contiguous run and splits on null values', () => {
    const fillStyle = 'rgba(76, 175, 80, 0.15)'
    const models = buildAnchoredVwapBandFillDrawModels({
      points: [
        { time: 1, upper: 11, lower: 9 },
        { time: 2, upper: null, lower: 9 },
        { time: 3, upper: 12, lower: 8 },
        { time: 4, upper: 13, lower: 7 },
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
  })

  it('orders a multi-bar run as a single upper-forward/lower-reverse contour', () => {
    const models = buildAnchoredVwapBandFillDrawModels({
      points: [
        { time: 1, upper: 11, lower: 9 },
        { time: 2, upper: 12, lower: 8 },
        { time: 3, upper: 13, lower: 7 },
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
    const models = buildAnchoredVwapBandFillDrawModels({
      points: [
        { time: 1, upper: 11, lower: 9 },
        { time: 2, upper: 12, lower: 8 },
        { time: 3, upper: 13, lower: 7 },
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

  it('turns a single-point run into a half-bar-spacing rectangle', () => {
    const models = buildAnchoredVwapBandFillDrawModels({
      points: [{ time: 5, upper: 20, lower: 10 }],
      barSpacing: 10,
      fillStyle: 'rgba(0,0,0,0.2)',
      timeToCoordinate: () => 100,
      priceToY: (price) => price,
    })

    assert.equal(models.length, 1)
    assert.deepEqual(models[0].polygon, [95, 20, 105, 20, 105, 10, 95, 10])
  })

  it('returns no models when the band is not fillable', () => {
    const models = buildAnchoredVwapBandFillDrawModels({
      points: [{ time: 1, upper: null, lower: 9 }],
      barSpacing: 6,
      fillStyle: 'rgba(0,0,0,0.2)',
      timeToCoordinate: () => 5,
      priceToY: () => 5,
    })
    assert.deepEqual(models, [])
  })
})
