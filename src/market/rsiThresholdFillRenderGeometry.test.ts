import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildRsiThresholdFillDrawModels,
  rsiThresholdFillSide,
  type RsiThresholdFillPoint,
  type RsiThresholdFillThresholds,
} from './rsiThresholdFillRenderGeometry.ts'

const DEFAULT_THRESHOLDS: RsiThresholdFillThresholds = { overbought: 70, oversold: 30 }
const OVERBOUGHT_FILL = 'rgba(239, 68, 68, 0.13)'
const OVERSOLD_FILL = 'rgba(34, 197, 94, 0.13)'

function build(
  points: readonly RsiThresholdFillPoint[],
  thresholds: RsiThresholdFillThresholds = DEFAULT_THRESHOLDS,
  options: {
    timeToCoordinate?: (time: number) => number | null
    barSpacing?: number
  } = {},
) {
  return buildRsiThresholdFillDrawModels({
    points,
    thresholds,
    overboughtFillStyle: OVERBOUGHT_FILL,
    oversoldFillStyle: OVERSOLD_FILL,
    barSpacing: options.barSpacing ?? 8,
    timeToCoordinate: options.timeToCoordinate ?? ((time) => time * 10),
    priceToY: (price) => 100 - price,
  })
}

describe('rsiThresholdFillSide', () => {
  it('treats values exactly at a threshold as inside (no fill)', () => {
    assert.equal(rsiThresholdFillSide(70, DEFAULT_THRESHOLDS), null)
    assert.equal(rsiThresholdFillSide(30, DEFAULT_THRESHOLDS), null)
    assert.equal(rsiThresholdFillSide(69.9, DEFAULT_THRESHOLDS), null)
    assert.equal(rsiThresholdFillSide(70.1, DEFAULT_THRESHOLDS), 'overbought')
    assert.equal(rsiThresholdFillSide(29.9, DEFAULT_THRESHOLDS), 'oversold')
  })
})

describe('buildRsiThresholdFillDrawModels', () => {
  it('fills each contiguous overbought run between the line and the threshold', () => {
    const models = build([
      { time: 1, value: 80 },
      { time: 2, value: 75 },
      { time: 3, value: 60 },
      { time: 4, value: 85 },
      { time: 5, value: 90 },
    ])

    assert.equal(models.length, 2)
    // 80 -> y 20, 75 -> y 25, threshold 70 -> y 30.
    assert.deepEqual(models[0].polygon, [10, 20, 20, 25, 20, 30, 10, 30])
    assert.equal(models[0].fillStyle, OVERBOUGHT_FILL)
    // The inside-threshold point at t=3 breaks the run, so no fill spans it.
    assert.deepEqual(models[1].polygon, [40, 15, 50, 10, 50, 30, 40, 30])
    assert.equal(models[1].fillStyle, OVERBOUGHT_FILL)
  })

  it('fills oversold runs with the green style', () => {
    const models = build([
      { time: 1, value: 20 },
      { time: 2, value: 25 },
    ])

    assert.equal(models.length, 1)
    // 20 -> y 80, 25 -> y 75, threshold 30 -> y 70.
    assert.deepEqual(models[0].polygon, [10, 80, 20, 75, 20, 70, 10, 70])
    assert.equal(models[0].fillStyle, OVERSOLD_FILL)
  })

  it('starts a new polygon when the side flips without an inside-threshold point', () => {
    const models = build([
      { time: 1, value: 80 },
      { time: 2, value: 20 },
    ])

    assert.equal(models.length, 2)
    assert.equal(models[0].fillStyle, OVERBOUGHT_FILL)
    assert.equal(models[1].fillStyle, OVERSOLD_FILL)
  })

  it('uses the bar half-width for a single-point run', () => {
    const models = build([{ time: 5, value: 80 }])

    assert.equal(models.length, 1)
    assert.deepEqual(models[0].polygon, [46, 20, 54, 20, 54, 30, 46, 30])
  })

  it('draws nothing for points between or exactly on the thresholds', () => {
    assert.deepEqual(
      build([
        { time: 1, value: 70 },
        { time: 2, value: 50 },
        { time: 3, value: 30 },
      ]),
      [],
    )
    assert.deepEqual(build([]), [])
  })

  it('breaks a run when a coordinate cannot be resolved', () => {
    const models = build(
      [
        { time: 1, value: 80 },
        { time: 2, value: 80 },
        { time: 3, value: 80 },
      ],
      DEFAULT_THRESHOLDS,
      { timeToCoordinate: (time) => (time === 2 ? null : time * 10) },
    )

    assert.equal(models.length, 2)
    assert.deepEqual(models[0].polygon, [6, 20, 14, 20, 14, 30, 6, 30])
    assert.deepEqual(models[1].polygon, [26, 20, 34, 20, 34, 30, 26, 30])
  })

  it('re-segments with new thresholds so a threshold change re-fills the same points', () => {
    const points = [
      { time: 1, value: 50 },
      { time: 2, value: 55 },
      { time: 3, value: 45 },
    ]

    assert.deepEqual(build(points), [])

    const filled = build(points, { overbought: 40, oversold: 20 })
    assert.equal(filled.length, 1)
    assert.equal(filled[0].polygon.length, points.length * 4)
    assert.equal(filled[0].fillStyle, OVERBOUGHT_FILL)

    const oversold = build(points, { overbought: 65, oversold: 56 })
    assert.equal(oversold.length, 1)
    assert.equal(oversold[0].polygon.length, points.length * 4)
    assert.equal(oversold[0].fillStyle, OVERSOLD_FILL)
  })
})
