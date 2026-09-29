import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { applyLiveCandle, parseMarketCandlePayload } from './parseMarketCandle.ts'
import type { MarketCandle } from './types.ts'

const VALID_PAYLOAD = {
  symbol: 'BTCUSDT',
  interval: '1m',
  time: 1_710_000_000,
  open: 62000.1,
  high: 62100.2,
  low: 61900.3,
  close: 62050.4,
  volume: 100,
  closed: false,
}

function candle(overrides: Partial<MarketCandle> = {}): MarketCandle {
  return {
    symbol: 'BTCUSDT',
    interval: '1m',
    time: 1_710_000_000,
    open: 1,
    high: 2,
    low: 0.5,
    close: 1.5,
    volume: 10,
    closed: false,
    ...overrides,
  }
}

describe('parseMarketCandlePayload', () => {
  it('accepts finite non-negative volume', () => {
    const parsed = parseMarketCandlePayload(VALID_PAYLOAD)
    assert.equal(parsed?.volume, 100)
  })

  it('rejects missing volume', () => {
    const rest: Record<string, unknown> = { ...VALID_PAYLOAD }
    delete rest.volume
    assert.equal(parseMarketCandlePayload(rest), null)
  })

  it('rejects negative volume', () => {
    assert.equal(parseMarketCandlePayload({ ...VALID_PAYLOAD, volume: -1 }), null)
  })

  it('rejects invalid volume', () => {
    assert.equal(parseMarketCandlePayload({ ...VALID_PAYLOAD, volume: 'bad' }), null)
  })
})

describe('applyLiveCandle', () => {
  it('replaces volume on same-timestamp update', () => {
    const candles = [candle({ volume: 10 })]
    const updated = candle({ volume: 25 })
    assert.equal(applyLiveCandle(candles, updated), 'update')
    assert.equal(candles[0].volume, 25)
  })
})
