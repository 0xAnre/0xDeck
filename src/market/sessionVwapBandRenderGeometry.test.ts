import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { RECTANGLE_FILL_OPACITY } from './rectangleColors.ts'
import {
  buildSessionVwapBandDrawModels,
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
  it('skips gaps and builds quads for contiguous valid segments', () => {
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

    assert.equal(models.length, 1)
    assert.equal(models[0].fillStyle, fillStyle)
    // One isolated bar at t=1 and one quad between t=3 and t=4.
    assert.equal(models[0].polygon.length, 16)
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
