import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CANDLE_INTERVAL_DURATION_SECONDS,
  candleIntervalDurationSeconds,
  isCandleInterval,
} from './candleIntervalDuration.ts'
import { BTC_USDM_KLINE_CHANNELS, CANDLE_INTERVALS, klineChannelForInterval } from './types.ts'
import { MARKET_INTERVAL_OPTIONS } from '../marketIntervalStorage.ts'

describe('CANDLE_INTERVALS and kline channels', () => {
  it('includes 1h and 2h without removing existing intervals', () => {
    assert.deepEqual(CANDLE_INTERVALS, ['1m', '5m', '15m', '30m', '1h', '2h', '4h', '1d', '1w'])
    for (const interval of CANDLE_INTERVALS) {
      assert.equal(klineChannelForInterval(interval), BTC_USDM_KLINE_CHANNELS[interval])
      assert.equal(isCandleInterval(interval), true)
    }
  })
})

describe('15m kline channel contract', () => {
  it('resolves 15m to the literal Binance USD-M stream channel', () => {
    assert.equal(klineChannelForInterval('15m'), 'binance.usdm.btcusdt.kline.15m')
    assert.equal(BTC_USDM_KLINE_CHANNELS['15m'], 'binance.usdm.btcusdt.kline.15m')
  })
})

describe('candleIntervalDurationSeconds', () => {
  it('returns 3600 and 7200 for 1h and 2h', () => {
    assert.equal(candleIntervalDurationSeconds('1h'), 3600)
    assert.equal(candleIntervalDurationSeconds('2h'), 7200)
  })

  it('returns 900 for 15m', () => {
    assert.equal(candleIntervalDurationSeconds('15m'), 900)
  })
})

describe('interval tables stay in sync', () => {
  it('covers exactly the intervals in CANDLE_INTERVALS', () => {
    assert.deepEqual(
      Object.keys(CANDLE_INTERVAL_DURATION_SECONDS).sort(),
      [...CANDLE_INTERVALS].sort(),
    )
    assert.deepEqual(
      Object.keys(BTC_USDM_KLINE_CHANNELS).sort(),
      [...CANDLE_INTERVALS].sort(),
    )
  })

  it('uses the documented duration for every interval', () => {
    // Mirrors LIQUIDATION_BUCKET_INTERVAL_MS / INTERVAL_DURATION_MS on the
    // backend; the liquidation bucket route and the chart must floor an event
    // to the same candle open time.
    const expected: Record<string, number> = {
      '1m': 60,
      '5m': 300,
      '15m': 900,
      '30m': 1800,
      '1h': 3600,
      '2h': 7200,
      '4h': 14_400,
      '1d': 86_400,
      '1w': 604_800,
    }

    for (const interval of CANDLE_INTERVALS) {
      assert.equal(
        candleIntervalDurationSeconds(interval),
        expected[interval],
        `duration for ${interval}`,
      )
    }
  })
})

describe('MARKET_INTERVAL_OPTIONS', () => {
  it('uses 1H and 2H labels in the interval picker', () => {
    const oneHour = MARKET_INTERVAL_OPTIONS.find((o) => o.value === '1h')
    const twoHour = MARKET_INTERVAL_OPTIONS.find((o) => o.value === '2h')
    assert.equal(oneHour?.label, '1H')
    assert.equal(twoHour?.label, '2H')
  })

  it('lists 15m between 5m and 30m in the interval picker', () => {
    const values = MARKET_INTERVAL_OPTIONS.map((o) => o.value)
    assert.equal(values.indexOf('15m'), values.indexOf('5m') + 1)
    assert.equal(values.indexOf('15m'), values.indexOf('30m') - 1)
    assert.equal(MARKET_INTERVAL_OPTIONS.find((o) => o.value === '15m')?.label, '15m')
  })
})
