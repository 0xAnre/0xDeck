import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  canRetryWeeklyContextLoad,
  countPrependedCandles,
  mergeWeeklyContextCandles,
  shiftVisibleLogicalRange,
  shouldApplyWeeklyContextResponse,
  shouldFinalizeWeeklyContextRequest,
  shouldShowWeeklyVwapSeries,
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
  it('counts only candles older than the first existing timestamp', () => {
    const before = [candle(100), candle(110)]
    const after = [candle(90), candle(95), candle(100), candle(115)]
    assert.equal(countPrependedCandles(before, after), 2)
  })

  it('ignores duplicate timestamps and newer bars when counting prepend', () => {
    const before = [candle(100)]
    const after = [candle(90), candle(100, 9), candle(105)]
    assert.equal(countPrependedCandles(before, after), 1)
  })

  it('returns zero when existing list is empty', () => {
    const after = [candle(90), candle(100)]
    assert.equal(countPrependedCandles([], after), 0)
  })
})

describe('shouldShowWeeklyVwapSeries', () => {
  it('hides weekly lines until context is loaded for the active interval', () => {
    assert.equal(
      shouldShowWeeklyVwapSeries({
        indicatorSelected: true,
        loadedInterval: null,
        activeInterval: '1m',
      }),
      false,
    )
    assert.equal(
      shouldShowWeeklyVwapSeries({
        indicatorSelected: true,
        loadedInterval: '5m',
        activeInterval: '1m',
      }),
      false,
    )
    assert.equal(
      shouldShowWeeklyVwapSeries({
        indicatorSelected: true,
        loadedInterval: '1m',
        activeInterval: '1m',
        loadedLevel: 'weekly',
      }),
      true,
    )
  })

  it('hides when indicator is not selected', () => {
    assert.equal(
      shouldShowWeeklyVwapSeries({
        indicatorSelected: false,
        loadedInterval: '1m',
        activeInterval: '1m',
      }),
      false,
    )
  })
})

describe('shouldApplyWeeklyContextResponse', () => {
  it('rejects stale generation, interval mismatch, or superseded request id', () => {
    assert.equal(
      shouldApplyWeeklyContextResponse({
        requestGeneration: 1,
        activeGeneration: 2,
        requestInterval: '1m',
        responseInterval: '1m',
        requestId: 1,
        latestRequestId: 1,
        requestContextLevel: 'weekly',
        stillNeededContextLevel: 'weekly',
      }),
      false,
    )
    assert.equal(
      shouldApplyWeeklyContextResponse({
        requestGeneration: 2,
        activeGeneration: 2,
        requestInterval: '1m',
        responseInterval: '5m',
        requestId: 2,
        latestRequestId: 2,
        requestContextLevel: 'weekly',
        stillNeededContextLevel: 'weekly',
      }),
      false,
    )
    assert.equal(
      shouldApplyWeeklyContextResponse({
        requestGeneration: 2,
        activeGeneration: 2,
        requestInterval: '1m',
        responseInterval: '1m',
        requestId: 2,
        latestRequestId: 3,
        requestContextLevel: 'weekly',
        stillNeededContextLevel: 'weekly',
      }),
      false,
    )
    assert.equal(
      shouldApplyWeeklyContextResponse({
        requestGeneration: 2,
        activeGeneration: 2,
        requestInterval: '1m',
        responseInterval: '1m',
        requestId: 3,
        latestRequestId: 3,
        requestContextLevel: 'weekly',
        stillNeededContextLevel: 'weekly',
      }),
      true,
    )
    assert.equal(
      shouldApplyWeeklyContextResponse({
        requestGeneration: 2,
        activeGeneration: 2,
        requestInterval: '1m',
        responseInterval: '1m',
        requestId: 4,
        latestRequestId: 4,
        requestContextLevel: 'weekly',
        stillNeededContextLevel: 'daily',
      }),
      false,
    )
  })
})

describe('shouldFinalizeWeeklyContextRequest', () => {
  it('allows only the latest request to clear shared in-flight ownership', () => {
    assert.equal(shouldFinalizeWeeklyContextRequest(1, 2), false)
    assert.equal(shouldFinalizeWeeklyContextRequest(2, 2), true)
  })
})

describe('canRetryWeeklyContextLoad', () => {
  it('allows retry when weekly context was not marked loaded', () => {
    assert.equal(canRetryWeeklyContextLoad(null, '1m'), true)
    assert.equal(canRetryWeeklyContextLoad('1m', '1m'), false)
  })
})
