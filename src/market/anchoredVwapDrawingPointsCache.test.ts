import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { computeAnchoredVwapDrawing } from './anchoredVwapDrawing.ts'
import { computeAnchoredVwapDrawingPointsForInstance } from './anchoredVwapDrawingChartSeries.ts'
import { createAnchoredVwapInstance } from './anchoredVwapInstances.ts'
import {
  evictCachedAnchoredVwapDrawingPointsForInstance,
  getCachedAnchoredVwapDrawingPointsForInstance,
  hasCachedAnchoredVwapDrawingPointsForInstance,
  syncAnchoredVwapDrawingPointsCache,
} from './anchoredVwapDrawingPointsCache.ts'
import type { MarketCandle } from './types.ts'

const CANDLES: MarketCandle[] = [
  {
    time: 100,
    open: 10,
    high: 11,
    low: 9,
    close: 10,
    volume: 1,
    interval: '1h',
    symbol: 'BTCUSDT',
    closed: true,
  },
  {
    time: 200,
    open: 11,
    high: 12,
    low: 10,
    close: 11,
    volume: 1,
    interval: '1h',
    symbol: 'BTCUSDT',
    closed: true,
  },
]

function candle(
  time: number,
  high: number,
  low: number,
  close: number,
  volume: number,
): MarketCandle {
  return {
    time,
    open: close,
    high,
    low,
    close,
    volume,
    interval: '1h',
    symbol: 'BTCUSDT',
    closed: true,
  }
}

describe('anchoredVwapDrawingPointsCache', () => {
  it('evicts a single instance entry', () => {
    const instance = createAnchoredVwapInstance({ anchorTime: 100 })
    assert.ok(instance)
    getCachedAnchoredVwapDrawingPointsForInstance(CANDLES, instance!)
    assert.equal(hasCachedAnchoredVwapDrawingPointsForInstance(instance!.id), true)
    evictCachedAnchoredVwapDrawingPointsForInstance(instance!.id)
    assert.equal(hasCachedAnchoredVwapDrawingPointsForInstance(instance!.id), false)
  })

  it('sync drops entries not in the active id set', () => {
    const a = createAnchoredVwapInstance({ anchorTime: 100 })
    const b = createAnchoredVwapInstance({ anchorTime: 200 })
    assert.ok(a && b)
    getCachedAnchoredVwapDrawingPointsForInstance(CANDLES, a)
    getCachedAnchoredVwapDrawingPointsForInstance(CANDLES, b)
    syncAnchoredVwapDrawingPointsCache(new Set([a.id]))
    assert.equal(hasCachedAnchoredVwapDrawingPointsForInstance(a.id), true)
    assert.equal(hasCachedAnchoredVwapDrawingPointsForInstance(b.id), false)
  })

  it('recomputes when the forming bar HLC3 or volume changes with the same close', () => {
    const candles = [
      candle(100, 12, 8, 10, 100),
      candle(200, 14, 10, 12, 200),
    ]
    const instance = createAnchoredVwapInstance({ anchorTime: 100 })!
    const expectedInitial = computeAnchoredVwapDrawing(candles, instance.anchorTime)
    const cachedInitial = getCachedAnchoredVwapDrawingPointsForInstance(candles, instance)
    assert.deepEqual(cachedInitial, expectedInitial)

    candles[1] = candle(200, 18, 9, 12, 500)
    const expectedUpdated = computeAnchoredVwapDrawing(candles, instance.anchorTime)
    const cachedUpdated = getCachedAnchoredVwapDrawingPointsForInstance(candles, instance)
    assert.notDeepEqual(cachedUpdated, cachedInitial)
    assert.deepEqual(cachedUpdated, expectedUpdated)
  })

  it('returns the same array reference when candles are unchanged', () => {
    const instance = createAnchoredVwapInstance({ anchorTime: 100 })!
    const candles = [candle(100, 12, 8, 10, 100), candle(200, 14, 10, 12, 200)]
    const first = getCachedAnchoredVwapDrawingPointsForInstance(candles, instance)
    const second = getCachedAnchoredVwapDrawingPointsForInstance(candles, instance)
    assert.equal(first, second)
  })

  it('appends one point when a new candle is added without full recompute', () => {
    const instance = createAnchoredVwapInstance({ anchorTime: 100 })!
    const candles = [candle(100, 12, 8, 10, 100), candle(200, 14, 10, 12, 200)]
    getCachedAnchoredVwapDrawingPointsForInstance(candles, instance)
    const withNewBar = [
      ...candles,
      candle(300, 16, 12, 14, 300),
    ]
    const cached = getCachedAnchoredVwapDrawingPointsForInstance(withNewBar, instance)
    const fresh = computeAnchoredVwapDrawingPointsForInstance(withNewBar, instance)
    assert.deepEqual(cached, fresh)
  })
})
