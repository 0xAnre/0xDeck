import { BINANCE_USDM_BTCUSDT_PERPETUAL_TICK_SIZE } from './binanceUsdmBtcusdtPerpetual.ts'
import { candleIntervalDurationSeconds } from './candleIntervalDuration.ts'
import {
  DEFAULT_MARKET_EXCHANGE,
  MARKET_EXCHANGES,
  type CandleInterval,
  type MarketExchange,
  type MarketSymbol,
} from './types.ts'

export const MARKET_EXCHANGE_OPTIONS = [
  { value: 'binance', label: 'Binance' },
  { value: 'hyperliquid', label: 'Hyperliquid' },
] as const

export function isMarketExchange(value: unknown): value is MarketExchange {
  return (
    typeof value === 'string' &&
    (MARKET_EXCHANGES as readonly string[]).includes(value)
  )
}

export function normalizeMarketExchange(value: unknown): MarketExchange {
  return isMarketExchange(value) ? value : DEFAULT_MARKET_EXCHANGE
}

export function marketSymbolForExchange(exchange: MarketExchange): MarketSymbol {
  return exchange === 'hyperliquid' ? 'BTC' : 'BTCUSDT'
}

/** REST/WS base path for one provider (the Binance route is unchanged). */
export function marketApiBasePath(exchange: MarketExchange): string {
  return exchange === 'hyperliquid'
    ? '/market/hyperliquid/btc'
    : '/market/binance/usdm/btcusdt'
}

export function marketKlinesPath(
  exchange: MarketExchange,
  suffix = '',
): string {
  return `${marketApiBasePath(exchange)}/klines${suffix}`
}

/** Hyperliquid documents: "Only the most recent 5000 candles are available." */
export const HYPERLIQUID_HISTORY_LIMIT_CANDLES = 5000

export const HYPERLIQUID_HISTORY_LIMIT_NOTICE =
  'Hyperliquid history is limited to the most recent 5000 candles; older data is unavailable'

export function marketHistoryLimitCandles(
  exchange: MarketExchange,
): number | null {
  return exchange === 'hyperliquid' ? HYPERLIQUID_HISTORY_LIMIT_CANDLES : null
}

export function marketHistoryAvailableFromSeconds(
  exchange: MarketExchange,
  interval: CandleInterval,
  nowSeconds: number,
): number | null {
  const limit = marketHistoryLimitCandles(exchange)
  if (limit === null) return null
  return nowSeconds - limit * candleIntervalDurationSeconds(interval)
}

export function marketHistoryRequestUnavailable(
  exchange: MarketExchange,
  interval: CandleInterval,
  beforeSeconds: number,
  nowSeconds: number,
): boolean {
  const availableFrom = marketHistoryAvailableFromSeconds(
    exchange,
    interval,
    nowSeconds,
  )
  return availableFrom !== null && beforeSeconds <= availableFrom
}

/**
 * Hyperliquid prices use 5 significant figures and max `6 - szDecimals`
 * decimals (BTC has szDecimals 5, so 0.1 is the finest increment). Integer
 * prices are always valid. At ~80k this resolves to 1, not Binance's 0.1.
 */
export function marketPriceTickSize(
  exchange: MarketExchange,
  referencePrice: number | null = null,
): number {
  if (exchange === 'binance') return BINANCE_USDM_BTCUSDT_PERPETUAL_TICK_SIZE
  if (
    referencePrice === null ||
    !Number.isFinite(referencePrice) ||
    referencePrice <= 0
  ) {
    return 1
  }
  const magnitude = Math.floor(Math.log10(referencePrice))
  const fiveSignificantFigures = 10 ** (magnitude - 4)
  return Math.max(0.1, fiveSignificantFigures)
}

export type MarketHistoryLimitNoticeParams = {
  exchange: MarketExchange
  interval: CandleInterval
  oldestCandleTime: number | null
  availableFrom: number | null
  hasUnmetRequirements: boolean
  /** Provider reported that the requested history page predates its horizon. */
  historyUnavailable?: boolean
}

/**
 * Explicit "older history is unavailable" notice once the loaded buffer has
 * reached the provider's recent-history horizon.
 *
 * `historyUnavailable` comes straight from the `/klines/history` response, so
 * panning to the horizon shows the notice even when every active indicator is
 * already satisfied. The oldest-candle heuristic stays for the case where the
 * horizon is known but no page has been requested yet.
 */
export function marketHistoryLimitNotice({
  exchange,
  interval,
  oldestCandleTime,
  availableFrom,
  hasUnmetRequirements,
  historyUnavailable = false,
}: MarketHistoryLimitNoticeParams): string | null {
  if (exchange !== 'hyperliquid') return null
  if (historyUnavailable) return HYPERLIQUID_HISTORY_LIMIT_NOTICE
  if (!hasUnmetRequirements) return null
  if (oldestCandleTime === null || availableFrom === null) return null

  const intervalSeconds = candleIntervalDurationSeconds(interval)
  if (oldestCandleTime > availableFrom + intervalSeconds * 2) return null

  return HYPERLIQUID_HISTORY_LIMIT_NOTICE
}
