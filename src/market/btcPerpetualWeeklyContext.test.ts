import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  canRetryWeeklyContextLoad,
  countPrependedCandles,
  mergeWeeklyContextCandles,
  shiftVisibleLogicalRange,
  shouldApplyWeeklyContextResponse,
} from './btcPerpetualWeeklyContext.ts'
import type { MarketCandle } from './types.ts'

function candle(time: number, close = 1): MarketCandle {
  return {
    symbol: 'BTCUSDT',
    interval: '1m',
    time,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1,
    closed: true,
  }
}

describe('mergeWeeklyContextCandles', () => {
  it('keeps existing live candle on duplicate timestamp', () => {
    const existing = [candle(100, 5)]
    const weekly = [candle(50, 1), candle(100, 9)]
    const merged = mergeWeeklyContextCandles(existing, weekly)
    assert.equal(merged.length, 2)
    assert.equal(merged[1].close, 5)
  })
})

describe('shiftVisibleLogicalRange', () => {
  it('shifts logical range by prepended bar count', () => {
    const shifted = shiftVisibleLogicalRange({ from: 10, to: 20 }, 3)
    assert.deepEqual(shifted, { from: 13, to: 23 })
  })

  it('returns null range unchanged', () => {
    assert.equal(shiftVisibleLogicalRange(null, 5), null)
  })
})

describe('countPrependedCandles', () => {
  it('counts added history length', () => {
    assert.equal(countPrependedCandles(100, 130), 30)
    assert.equal(countPrependedCandles(100, 100), 0)
  })
})

describe('shouldApplyWeeklyContextResponse', () => {
  it('rejects stale generation or interval mismatch', () => {
    assert.equal(
      shouldApplyWeeklyContextResponse({
        requestGeneration: 1,
        activeGeneration: 2,
        requestInterval: '1m',
        responseInterval: '1m',
      }),
      false,
    )
    assert.equal(
      shouldApplyWeeklyContextResponse({
        requestGeneration: 2,
        activeGeneration: 2,
        requestInterval: '1m',
        responseInterval: '5m',
      }),
      false,
    )
    assert.equal(
      shouldApplyWeeklyContextResponse({
        requestGeneration: 2,
        activeGeneration: 2,
        requestInterval: '1m',
        responseInterval: '1m',
      }),
      true,
    )
  })
})

describe('canRetryWeeklyContextLoad', () => {
  it('allows retry when weekly context was not marked loaded', () => {
    assert.equal(canRetryWeeklyContextLoad(null), true)
    assert.equal(canRetryWeeklyContextLoad('1m'), false)
  })
})
