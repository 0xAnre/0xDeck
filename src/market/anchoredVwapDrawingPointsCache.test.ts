import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createAnchoredVwapInstance } from './anchoredVwapInstances.ts'
import {
  evictCachedAnchoredVwapDrawingPointsForInstance,
  getCachedAnchoredVwapDrawingPointsForInstance,
  hasCachedAnchoredVwapDrawingPointsForInstance,
  syncAnchoredVwapDrawingPointsCache,
} from './anchoredVwapDrawingPointsCache.ts'
import type { MarketCandle } from './types.ts'

const CANDLES: MarketCandle[] = [
  { time: 100, open: 10, high: 11, low: 9, close: 10, volume: 1, interval: '1h' },
  { time: 200, open: 11, high: 12, low: 10, close: 11, volume: 1, interval: '1h' },
]

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
})
