import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { API_BASE } from '../api/apiBase.ts'
import {
  MARKET_INDICATOR_DEFINITIONS,
  VWAP_CONTEXT_LEVEL_ORDER,
  type MarketIndicatorId,
} from './indicators.ts'
import { marketApiBasePath, marketKlinesPath } from './marketExchange.ts'
import { aggregatedLiquidationsHistoryPath } from './aggregatedLiquidationsHistory.ts'
import {
  hyperliquidAccountFillsByTimePath,
  hyperliquidAccountFillsPath,
  hyperliquidAccountPositionPath,
  hyperliquidUserFillsChannel,
} from './hyperliquidAccount.ts'
import {
  CANDLE_INTERVALS,
  MARKET_EXCHANGES,
  marketKlineChannelForInterval,
  type CandleInterval,
  type MarketExchange,
} from './types.ts'

/**
 * Route/path contract shared with the backend.
 *
 * These literals are mirrored by `backend/tests/test_market_route_contract.py`.
 * If either side's routes or the paths the client builds drift, one of the two
 * tests fails — that is the whole point: a live 404 like
 * `GET /api/market/hyperliquid/btc/klines` (backend without the Hyperliquid
 * routes) must be impossible to ship silently.
 */
const MARKET_KLINES_SUFFIXES = [
  '',
  '/history',
  '/daily-context',
  '/weekly-context',
  '/monthly-context',
  '/quarterly-context',
  '/yearly-context',
  '/volume-profile',
] as const

/** Base path (without `/api`) each provider's kline routes live under. */
const MARKET_KLINES_BASE_PATHS: Record<MarketExchange, string> = {
  binance: '/market/binance/usdm/btcusdt/klines',
  hyperliquid: '/market/hyperliquid/btc/klines',
}

/** Intervals the UI can request per VWAP context level (mirrored in the backend test). */
/** Mirrors `HYPERLIQUID_ACCOUNT_SUFFIXES` in the backend route-contract test. */
const HYPERLIQUID_ACCOUNT_ADDRESS = '0xaf68caebaa151dd592112a07e2344b3950e13561'
const HYPERLIQUID_ACCOUNT_SUFFIXES = ['/position', '/fills', '/fills/by-time'] as const

const CONTEXT_INTERVAL_MATRIX: Record<string, readonly CandleInterval[]> = {
  // `requiredVwapContextLevel` defaults to `daily`, so daily context is
  // requested for every chart interval — including `1w`.
  '/daily-context': ['1m', '5m', '15m', '30m', '1h', '2h', '4h', '1d', '1w'],
  // Weekly and finer VWAP indicators stop at `1d` (see indicators.ts).
  '/weekly-context': ['1m', '5m', '15m', '30m', '1h', '2h', '4h', '1d'],
  '/monthly-context': ['4h', '1d'],
  '/quarterly-context': ['4h', '1d'],
  '/yearly-context': ['1d', '1w'],
}

function expectedPath(exchange: MarketExchange, suffix: string): string {
  return `${API_BASE}${MARKET_KLINES_BASE_PATHS[exchange]}${suffix}`
}

describe('Hyperliquid account route contract (paths the client builds)', () => {
  it('builds exactly the documented read-only account paths', () => {
    assert.deepEqual(
      [
        hyperliquidAccountPositionPath(HYPERLIQUID_ACCOUNT_ADDRESS),
        hyperliquidAccountFillsPath(HYPERLIQUID_ACCOUNT_ADDRESS),
        hyperliquidAccountFillsByTimePath(HYPERLIQUID_ACCOUNT_ADDRESS),
      ].map((path) => `${API_BASE}${path}`),
      HYPERLIQUID_ACCOUNT_SUFFIXES.map(
        (suffix) =>
          `${API_BASE}/market/hyperliquid/account/${HYPERLIQUID_ACCOUNT_ADDRESS}${suffix}`,
      ),
    )
  })

  it('names the account fills relay channel the backend accepts', () => {
    assert.equal(
      hyperliquidUserFillsChannel(HYPERLIQUID_ACCOUNT_ADDRESS),
      `hyperliquid.account.${HYPERLIQUID_ACCOUNT_ADDRESS}.userfills`,
    )
    // The backend WS channel cap is 96; this channel is 72 chars.
    assert.ok(
      hyperliquidUserFillsChannel(HYPERLIQUID_ACCOUNT_ADDRESS).length <= 96,
    )
  })
})

describe('persistent liquidation history route contract', () => {
  it('builds the path the backend registers for stored liquidations', () => {
    assert.equal(
      `${API_BASE}${aggregatedLiquidationsHistoryPath()}`,
      '/api/market/binance/usdm/btcusdt/liquidations/history',
    )
  })

  it('passes the pagination cursor and limit as query parameters', () => {
    assert.equal(
      `${API_BASE}${aggregatedLiquidationsHistoryPath({
        before: 1_792_000_000_000,
        limit: 1000,
      })}`,
      '/api/market/binance/usdm/btcusdt/liquidations/history?before=1792000000000&limit=1000',
    )
  })
})

describe('market route contract (paths the client builds)', () => {
  it('uses the /api prefix the backend mounts every route under', () => {
    assert.equal(API_BASE, '/api')
  })

  it('builds exactly the documented path set for both exchanges', () => {
    const built: string[] = []
    for (const exchange of MARKET_EXCHANGES) {
      for (const suffix of MARKET_KLINES_SUFFIXES) {
        built.push(`${API_BASE}${marketKlinesPath(exchange, suffix)}`)
      }
    }

    const expected: string[] = []
    for (const exchange of MARKET_EXCHANGES) {
      for (const suffix of MARKET_KLINES_SUFFIXES) {
        expected.push(expectedPath(exchange, suffix))
      }
    }

    assert.deepEqual(built, expected)
  })

  it('keeps the Binance base path byte-compatible with the pre-exchange client', () => {
    assert.equal(
      `${API_BASE}${marketApiBasePath('binance')}`,
      '/api/market/binance/usdm/btcusdt',
    )
    assert.equal(
      `${API_BASE}${marketKlinesPath('binance')}`,
      '/api/market/binance/usdm/btcusdt/klines',
    )
  })

  it('maps the Hyperliquid base path onto its registered route', () => {
    assert.equal(marketApiBasePath('hyperliquid'), '/market/hyperliquid/btc')
    assert.equal(
      `${API_BASE}${marketKlinesPath('hyperliquid')}`,
      '/api/market/hyperliquid/btc/klines',
    )
  })

  it('only requests chart intervals the backend accepts', () => {
    assert.deepEqual([...CANDLE_INTERVALS], [
      '1m',
      '5m',
      '15m',
      '30m',
      '1h',
      '2h',
      '4h',
      '1d',
      '1w',
    ])
  })

  it('derives the context-interval matrix from indicator availability', () => {
    // `requiredVwapContextLevel` defaults to `daily` for candle load, so the
    // daily context route must serve every chart interval.
    const derived: Record<string, CandleInterval[]> = {
      '/daily-context': [...CANDLE_INTERVALS],
    }

    for (const level of VWAP_CONTEXT_LEVEL_ORDER) {
      const intervals = new Set<CandleInterval>()
      for (const id of Object.keys(
        MARKET_INDICATOR_DEFINITIONS,
      ) as MarketIndicatorId[]) {
        const definition = MARKET_INDICATOR_DEFINITIONS[id]
        if (definition.contextLevel !== level) continue
        for (const interval of definition.supportedIntervals) {
          intervals.add(interval)
        }
      }
      const suffix = `/${level}-context`
      if (suffix in derived) continue
      derived[suffix] = CANDLE_INTERVALS.filter((interval) =>
        intervals.has(interval),
      )
    }

    assert.deepEqual(derived, CONTEXT_INTERVAL_MATRIX)
  })

  it('builds one relay channel per exchange and interval', () => {
    for (const exchange of MARKET_EXCHANGES) {
      for (const interval of CANDLE_INTERVALS) {
        const channel = marketKlineChannelForInterval(exchange, interval)
        assert.equal(
          channel,
          exchange === 'binance'
            ? `binance.usdm.btcusdt.kline.${interval}`
            : `hyperliquid.btc.kline.${interval}`,
        )
      }
    }
  })
})
