import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { shouldApplyVwapContextResponse } from './btcPerpetualVwapContext.ts'
import { parseMarketCandlePayload } from './parseMarketCandle.ts'

const BINANCE_CANDLE = {
  symbol: 'BTCUSDT',
  interval: '1h',
  time: 1_700_000_000,
  open: 62000.1,
  high: 62100.2,
  low: 61900.3,
  close: 62050.4,
  volume: 100,
  closed: false,
}

const HYPERLIQUID_CANDLE = {
  ...BINANCE_CANDLE,
  symbol: 'BTC',
}

const BASE_CONTEXT_RESPONSE = {
  requestGeneration: 7,
  activeGeneration: 7,
  requestInterval: '1h' as const,
  responseInterval: '1h' as const,
  requestId: 3,
  latestRequestId: 3,
  requestContextLevel: 'daily' as const,
  stillNeededContextLevel: 'daily' as const,
}

describe('exchange switch isolation', () => {
  it('drops VWAP context responses from the previous exchange', () => {
    assert.equal(
      shouldApplyVwapContextResponse({
        ...BASE_CONTEXT_RESPONSE,
        requestExchange: 'hyperliquid',
        responseExchange: 'binance',
      }),
      false,
    )
    assert.equal(
      shouldApplyVwapContextResponse({
        ...BASE_CONTEXT_RESPONSE,
        requestExchange: 'hyperliquid',
        responseExchange: 'hyperliquid',
      }),
      true,
    )
  })

  it('still drops responses from a superseded generation or request', () => {
    assert.equal(
      shouldApplyVwapContextResponse({
        ...BASE_CONTEXT_RESPONSE,
        activeGeneration: 8,
        requestExchange: 'hyperliquid',
        responseExchange: 'hyperliquid',
      }),
      false,
    )
    assert.equal(
      shouldApplyVwapContextResponse({
        ...BASE_CONTEXT_RESPONSE,
        latestRequestId: 4,
        requestExchange: 'hyperliquid',
        responseExchange: 'hyperliquid',
      }),
      false,
    )
  })

  it('rejects a live candle whose symbol belongs to the other exchange', () => {
    assert.equal(
      parseMarketCandlePayload(HYPERLIQUID_CANDLE, {
        exchange: 'hyperliquid',
        interval: '1h',
      })?.symbol,
      'BTC',
    )
    assert.equal(
      parseMarketCandlePayload(BINANCE_CANDLE, {
        exchange: 'hyperliquid',
        interval: '1h',
      }),
      null,
    )
    assert.equal(
      parseMarketCandlePayload(HYPERLIQUID_CANDLE, {
        exchange: 'binance',
        interval: '1h',
      }),
      null,
    )
  })

  it('rejects a live candle from a different interval', () => {
    assert.equal(
      parseMarketCandlePayload(BINANCE_CANDLE, {
        exchange: 'binance',
        interval: '4h',
      }),
      null,
    )
  })
})
