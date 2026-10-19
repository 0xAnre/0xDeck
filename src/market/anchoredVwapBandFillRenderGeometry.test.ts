import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  anchoredVwapBandFillPriceRange,
  buildAnchoredVwapBandFillDrawModels,
  type AnchoredVwapBandFillPairGeometry,
} from './anchoredVwapBandFillRenderGeometry.ts'

describe('buildAnchoredVwapBandFillDrawModels', () => {
  it('splits a run at null values and keeps one contour per run', () => {
    const models = buildAnchoredVwapBandFillDrawModels({
      pairs: [
        {
          points: [
            { time: 1, upper: 11, lower: 9 },
            { time: 2, upper: 12, lower: 8 },
            { time: 3, upper: null, lower: 7 },
            { time: 4, upper: 14, lower: 6 },
          ],
          fillStyle: 'rgba(1, 2, 3, 0.4)',
        },
      ],
      barSpacing: 8,
      timeToCoordinate: (time) => time * 10,
      priceToY: (price) => 100 - price,
    })

    assert.equal(models.length, 2)
    assert.equal(models[0].fillStyle, 'rgba(1, 2, 3, 0.4)')
    assert.equal(models[1].fillStyle, 'rgba(1, 2, 3, 0.4)')
    assert.deepEqual(models[0].polygon, [10, 89, 20, 88, 20, 92, 10, 91])
    assert.deepEqual(models[1].polygon, [36, 86, 44, 86, 44, 94, 36, 94])
  })

  it('splits a run when a plotted coordinate is missing', () => {
    const models = buildAnchoredVwapBandFillDrawModels({
      pairs: [
        {
          points: [
            { time: 1, upper: 11, lower: 9 },
            { time: 2, upper: 12, lower: 8 },
            { time: 3, upper: 13, lower: 7 },
          ],
          fillStyle: 'rgba(0, 0, 0, 0.2)',
        },
      ],
      barSpacing: 8,
      timeToCoordinate: (time) => (time === 2 ? null : Number(time) * 10),
      priceToY: (price) => 100 - price,
    })

    assert.equal(models.length, 2)
    assert.deepEqual(models[0].polygon, [6, 89, 14, 89, 14, 91, 6, 91])
    assert.deepEqual(models[1].polygon, [26, 87, 34, 87, 34, 93, 26, 93])
  })

  it('never emits a polygon before the anchor because pre-anchor points are absent', () => {
    const anchorTime = 5
    const models = buildAnchoredVwapBandFillDrawModels({
      pairs: [
        {
          points: [
            { time: 5, upper: 11, lower: 9 },
            { time: 6, upper: 12, lower: 8 },
            { time: 7, upper: 13, lower: 7 },
          ],
          fillStyle: 'rgba(0, 0, 0, 0.2)',
        },
      ],
      barSpacing: 8,
      timeToCoordinate: (time) => time * 10,
      priceToY: (price) => 100 - price,
    })

    assert.equal(models.length, 1)
    const minX = anchorTime * 10 - 8 / 2
    for (const model of models) {
      for (let index = 0; index < model.polygon.length; index += 2) {
        assert.ok(model.polygon[index] >= minX)
      }
    }
  })

  it('uses each pair style and keeps pairs independent', () => {
    const models = buildAnchoredVwapBandFillDrawModels({
      pairs: [
        {
          points: [{ time: 1, upper: 11, lower: 9 }],
          fillStyle: 'rgba(10, 20, 30, 0.1)',
        },
        {
          points: [{ time: 1, upper: 21, lower: 19 }],
          fillStyle: 'rgba(40, 50, 60, 0.9)',
        },
      ],
      barSpacing: 6,
      timeToCoordinate: () => 30,
      priceToY: (price) => 100 - price,
    })

    assert.equal(models.length, 2)
    assert.equal(models[0].fillStyle, 'rgba(10, 20, 30, 0.1)')
    assert.equal(models[1].fillStyle, 'rgba(40, 50, 60, 0.9)')
  })

  it('returns no models when a pair has no fillable samples', () => {
    const models = buildAnchoredVwapBandFillDrawModels({
      pairs: [
        {
          points: [{ time: 1, upper: null, lower: 9 }],
          fillStyle: 'rgba(0, 0, 0, 0.2)',
        },
      ],
      barSpacing: 6,
      timeToCoordinate: () => 5,
      priceToY: () => 5,
    })
    assert.deepEqual(models, [])
  })
})

describe('anchoredVwapBandFillPriceRange', () => {
  const pair = (
    points: AnchoredVwapBandFillPairGeometry['points'],
  ): AnchoredVwapBandFillPairGeometry => ({ points, fillStyle: 'rgba(0, 0, 0, 0.2)' })

  it('combines fillable samples of every pair inside the visible window', () => {
    const pairs = [
      pair([
        { time: 10, upper: 12, lower: 8 },
        { time: 20, upper: null, lower: 1 },
        { time: 30, upper: 40, lower: 5 },
      ]),
      pair([
        { time: 10, upper: 1000, lower: 900 },
        { time: 20, upper: 50, lower: 2 },
      ]),
    ]

    assert.deepEqual(anchoredVwapBandFillPriceRange(pairs, 20, 30), {
      minValue: 2,
      maxValue: 50,
    })
  })

  it('omits samples missing a bound and returns null when nothing is fillable', () => {
    const pairs = [pair([{ time: 10, upper: null, lower: 5 }])]
    assert.equal(anchoredVwapBandFillPriceRange(pairs, 0, 20), null)
    assert.equal(anchoredVwapBandFillPriceRange([], 0, 20), null)
  })

  it('returns null for an inverted or non-finite window', () => {
    const pairs = [pair([{ time: 10, upper: 12, lower: 8 }])]
    assert.equal(anchoredVwapBandFillPriceRange(pairs, 20, 10), null)
    assert.equal(anchoredVwapBandFillPriceRange(pairs, Number.NaN, 10), null)
  })
})
