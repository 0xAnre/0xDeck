import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  HYPERLIQUID_HISTORY_LIMIT_NOTICE,
  marketApiBasePath,
  marketHistoryAvailableFromSeconds,
  marketHistoryLimitCandles,
  marketHistoryLimitNotice,
  marketHistoryRequestUnavailable,
  marketKlinesPath,
  marketPriceTickSize,
  marketSymbolForExchange,
  normalizeMarketExchange,
} from './marketExchange.ts'
import {
  MARKET_KLINE_CHANNELS,
  marketKlineChannelForInterval,
  parseMarketKlineChannel,
} from './types.ts'

describe('market exchange selection', () => {
  it('defaults unknown values to binance', () => {
    assert.equal(normalizeMarketExchange('hyperliquid'), 'hyperliquid')
    assert.equal(normalizeMarketExchange('binance'), 'binance')
    assert.equal(normalizeMarketExchange('binance-usdm'), 'binance')
    assert.equal(normalizeMarketExchange(undefined), 'binance')
    assert.equal(normalizeMarketExchange(null), 'binance')
  })

  it('maps both symbols and provider base paths', () => {
    assert.equal(marketSymbolForExchange('binance'), 'BTCUSDT')
    assert.equal(marketSymbolForExchange('hyperliquid'), 'BTC')
    assert.equal(
      marketApiBasePath('binance'),
      '/market/binance/usdm/btcusdt',
    )
    assert.equal(marketApiBasePath('hyperliquid'), '/market/hyperliquid/btc')
    assert.equal(
      marketKlinesPath('hyperliquid', '/history'),
      '/market/hyperliquid/btc/klines/history',
    )
  })
})

describe('exchange-aware channels', () => {
  it('keeps Binance channel names unchanged', () => {
    assert.equal(
      marketKlineChannelForInterval('binance', '1m'),
      'binance.usdm.btcusdt.kline.1m',
    )
  })

  it('maps every interval for Hyperliquid', () => {
    for (const interval of Object.keys(
      MARKET_KLINE_CHANNELS.hyperliquid,
    ) as (keyof typeof MARKET_KLINE_CHANNELS.hyperliquid)[]) {
      assert.equal(
        marketKlineChannelForInterval('hyperliquid', interval),
        `hyperliquid.btc.kline.${interval}`,
      )
    }
  })

  it('parses channels back to exchange and interval', () => {
    assert.deepEqual(parseMarketKlineChannel('hyperliquid.btc.kline.4h'), {
      exchange: 'hyperliquid',
      interval: '4h',
    })
    assert.deepEqual(parseMarketKlineChannel('binance.usdm.btcusdt.kline.1w'), {
      exchange: 'binance',
      interval: '1w',
    })
    assert.equal(parseMarketKlineChannel('hyperliquid.btc.kline.3m'), null)
    assert.equal(parseMarketKlineChannel('trades.live'), null)
  })
})

describe('provider history limits', () => {
  it('only caps Hyperliquid at 5000 candles', () => {
    assert.equal(marketHistoryLimitCandles('binance'), null)
    assert.equal(marketHistoryLimitCandles('hyperliquid'), 5000)
  })

  it('derives the Hyperliquid recent-history horizon per interval', () => {
    const nowSeconds = 2_000_000_000
    assert.equal(
      marketHistoryAvailableFromSeconds('binance', '1h', nowSeconds),
      null,
    )
    assert.equal(
      marketHistoryAvailableFromSeconds('hyperliquid', '1h', nowSeconds),
      nowSeconds - 5000 * 3600,
    )
    assert.equal(
      marketHistoryAvailableFromSeconds('hyperliquid', '1m', nowSeconds),
      nowSeconds - 5000 * 60,
    )
  })

  it('treats pages older than the horizon as explicitly unavailable', () => {
    const nowSeconds = 2_000_000_000
    const horizon = marketHistoryAvailableFromSeconds(
      'hyperliquid',
      '1h',
      nowSeconds,
    )
    assert.ok(horizon !== null)
    assert.equal(
      marketHistoryRequestUnavailable(
        'hyperliquid',
        '1h',
        horizon,
        nowSeconds,
      ),
      true,
    )
    assert.equal(
      marketHistoryRequestUnavailable(
        'hyperliquid',
        '1h',
        horizon + 3600,
        nowSeconds,
      ),
      false,
    )
    assert.equal(
      marketHistoryRequestUnavailable('binance', '1h', 1, nowSeconds),
      false,
    )
  })

  it('surfaces the limit from the explicit history_unavailable flag', () => {
    // Panning to the horizon with satisfied indicators still has to surface
    // the explicit state (the flag comes straight from /klines/history).
    assert.equal(
      marketHistoryLimitNotice({
        exchange: 'hyperliquid',
        interval: '1h',
        oldestCandleTime: 2_000_000,
        availableFrom: 1_000,
        hasUnmetRequirements: false,
        historyUnavailable: true,
      }),
      HYPERLIQUID_HISTORY_LIMIT_NOTICE,
    )
    assert.equal(
      marketHistoryLimitNotice({
        exchange: 'binance',
        interval: '1h',
        oldestCandleTime: 1_000,
        availableFrom: 1_000,
        hasUnmetRequirements: false,
        historyUnavailable: true,
      }),
      null,
    )
  })

  it('surfaces the limit only when Hyperliquid indicators are unmet at the horizon', () => {
    assert.equal(
      marketHistoryLimitNotice({
        exchange: 'hyperliquid',
        interval: '1h',
        oldestCandleTime: 1_000,
        availableFrom: 1_000,
        hasUnmetRequirements: true,
      }),
      HYPERLIQUID_HISTORY_LIMIT_NOTICE,
    )
    assert.equal(
      marketHistoryLimitNotice({
        exchange: 'hyperliquid',
        interval: '1h',
        oldestCandleTime: 1_000,
        availableFrom: 1_000,
        hasUnmetRequirements: false,
      }),
      null,
    )
    assert.equal(
      marketHistoryLimitNotice({
        exchange: 'binance',
        interval: '1h',
        oldestCandleTime: 1_000,
        availableFrom: 1_000,
        hasUnmetRequirements: true,
      }),
      null,
    )
    assert.equal(
      marketHistoryLimitNotice({
        exchange: 'hyperliquid',
        interval: '1h',
        oldestCandleTime: 2_000_000,
        availableFrom: 1_000,
        hasUnmetRequirements: true,
      }),
      null,
    )
  })
})

describe('exchange-specific price tick', () => {
  it('keeps Binance BTCUSDT at 0.1', () => {
    assert.equal(marketPriceTickSize('binance', 80_240), 0.1)
    assert.equal(marketPriceTickSize('binance', null), 0.1)
  })

  it('uses Hyperliquid five-significant-figure ticks', () => {
    assert.equal(marketPriceTickSize('hyperliquid', 80_240), 1)
    assert.equal(marketPriceTickSize('hyperliquid', 123_456), 10)
    assert.equal(marketPriceTickSize('hyperliquid', 8_024), 0.1)
    assert.equal(marketPriceTickSize('hyperliquid', null), 1)
  })
})
