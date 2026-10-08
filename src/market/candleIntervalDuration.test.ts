import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  candleIntervalDurationSeconds,
  isCandleInterval,
} from './candleIntervalDuration.ts'
import { BTC_USDM_KLINE_CHANNELS, CANDLE_INTERVALS, klineChannelForInterval } from './types.ts'
import { MARKET_INTERVAL_OPTIONS } from '../marketIntervalStorage.ts'

describe('CANDLE_INTERVALS and kline channels', () => {
  it('includes 1h and 2h without removing existing intervals', () => {
    assert.deepEqual(CANDLE_INTERVALS, ['1m', '5m', '30m', '1h', '2h', '4h', '1d', '1w'])
    for (const interval of CANDLE_INTERVALS) {
      assert.equal(klineChannelForInterval(interval), BTC_USDM_KLINE_CHANNELS[interval])
      assert.equal(isCandleInterval(interval), true)
    }
  })
})

describe('candleIntervalDurationSeconds', () => {
  it('returns 3600 and 7200 for 1h and 2h', () => {
    assert.equal(candleIntervalDurationSeconds('1h'), 3600)
    assert.equal(candleIntervalDurationSeconds('2h'), 7200)
  })
})

describe('MARKET_INTERVAL_OPTIONS', () => {
  it('uses 1H and 2H labels in the interval picker', () => {
    const oneHour = MARKET_INTERVAL_OPTIONS.find((o) => o.value === '1h')
    const twoHour = MARKET_INTERVAL_OPTIONS.find((o) => o.value === '2h')
    assert.equal(oneHour?.label, '1H')
    assert.equal(twoHour?.label, '2H')
  })
})
