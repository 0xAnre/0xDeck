import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { RsiPoint } from './rsi.ts'
import {
  RSI_OVERBOUGHT_LINE_COLOR,
  RSI_OVERSOLD_LINE_COLOR,
  rsiLineColorForValue,
  toRsiLineData,
  toRsiLineDataPoint,
} from './rsiLineColors.ts'

const THRESHOLDS = { overbought: 70, oversold: 30 }

function makePoint(time: number, value: number): RsiPoint {
  return { time, value }
}

describe('rsiLineColorForValue', () => {
  it('uses the fixed red/green threshold colors', () => {
    assert.equal(RSI_OVERBOUGHT_LINE_COLOR, '#EF4444')
    assert.equal(RSI_OVERSOLD_LINE_COLOR, '#22C55E')
  })

  it('colors exact threshold equality red at overbought and green at oversold', () => {
    assert.equal(rsiLineColorForValue(70, THRESHOLDS), RSI_OVERBOUGHT_LINE_COLOR)
    assert.equal(rsiLineColorForValue(30, THRESHOLDS), RSI_OVERSOLD_LINE_COLOR)
  })

  it('colors values beyond the thresholds', () => {
    assert.equal(rsiLineColorForValue(100, THRESHOLDS), RSI_OVERBOUGHT_LINE_COLOR)
    assert.equal(rsiLineColorForValue(70.5, THRESHOLDS), RSI_OVERBOUGHT_LINE_COLOR)
    assert.equal(rsiLineColorForValue(0, THRESHOLDS), RSI_OVERSOLD_LINE_COLOR)
    assert.equal(rsiLineColorForValue(29.5, THRESHOLDS), RSI_OVERSOLD_LINE_COLOR)
  })

  it('keeps the series line color strictly between the thresholds', () => {
    assert.equal(rsiLineColorForValue(30.001, THRESHOLDS), undefined)
    assert.equal(rsiLineColorForValue(50, THRESHOLDS), undefined)
    assert.equal(rsiLineColorForValue(69.999, THRESHOLDS), undefined)
  })

  it('follows custom thresholds', () => {
    const wide = { overbought: 85, oversold: 15 }
    assert.equal(rsiLineColorForValue(70, wide), undefined)
    assert.equal(rsiLineColorForValue(85, wide), RSI_OVERBOUGHT_LINE_COLOR)
    assert.equal(rsiLineColorForValue(15, wide), RSI_OVERSOLD_LINE_COLOR)
  })
})

describe('toRsiLineDataPoint', () => {
  it('carries the threshold color on the data point', () => {
    assert.deepEqual(toRsiLineDataPoint(makePoint(1_700_000_000, 70), THRESHOLDS), {
      time: 1_700_000_000,
      value: 70,
      color: RSI_OVERBOUGHT_LINE_COLOR,
    })
  })

  it('omits the point color between the thresholds so the series color applies', () => {
    const point = toRsiLineDataPoint(makePoint(1_700_000_000, 50), THRESHOLDS)
    assert.deepEqual(point, { time: 1_700_000_000, value: 50 })
    assert.equal('color' in point, false)
  })
})

describe('toRsiLineData', () => {
  it('colors every historical point and preserves time order and values', () => {
    const points = [
      makePoint(1_700_000_000, 80),
      makePoint(1_700_000_060, 50),
      makePoint(1_700_000_120, 20),
      makePoint(1_700_000_180, 70),
      makePoint(1_700_000_240, 30),
    ]

    const line = toRsiLineData(points, THRESHOLDS)

    assert.deepEqual(line, [
      { time: 1_700_000_000, value: 80, color: RSI_OVERBOUGHT_LINE_COLOR },
      { time: 1_700_000_060, value: 50 },
      { time: 1_700_000_120, value: 20, color: RSI_OVERSOLD_LINE_COLOR },
      { time: 1_700_000_180, value: 70, color: RSI_OVERBOUGHT_LINE_COLOR },
      { time: 1_700_000_240, value: 30, color: RSI_OVERSOLD_LINE_COLOR },
    ])
  })

  it('returns an empty line for empty RSI input', () => {
    assert.deepEqual(toRsiLineData([], THRESHOLDS), [])
  })
})
