export const CANDLE_INTERVALS = ['1m', '5m', '15m', '30m', '1h', '2h', '4h', '1d', '1w'] as const

export const MARKET_EXCHANGES = ['binance', 'hyperliquid'] as const

export type MarketExchange = (typeof MARKET_EXCHANGES)[number]

export const DEFAULT_MARKET_EXCHANGE: MarketExchange = 'binance'

export type MarketSymbol = 'BTCUSDT' | 'BTC'

export type CandleInterval = (typeof CANDLE_INTERVALS)[number]

export const DEFAULT_CANDLE_INTERVAL: CandleInterval = '1m'

export const BTC_USDM_KLINE_CHANNELS: Record<CandleInterval, string> = {
  '1m': 'binance.usdm.btcusdt.kline.1m',
  '5m': 'binance.usdm.btcusdt.kline.5m',
  '15m': 'binance.usdm.btcusdt.kline.15m',
  '30m': 'binance.usdm.btcusdt.kline.30m',
  '1h': 'binance.usdm.btcusdt.kline.1h',
  '2h': 'binance.usdm.btcusdt.kline.2h',
  '4h': 'binance.usdm.btcusdt.kline.4h',
  '1d': 'binance.usdm.btcusdt.kline.1d',
  '1w': 'binance.usdm.btcusdt.kline.1w',
}

export type MarketCandle = {
  symbol: MarketSymbol
  interval: CandleInterval
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  closed: boolean
}

export type MarketKlinesResponse = {
  exchange?: MarketExchange
  symbol: MarketSymbol
  interval: CandleInterval
  candles: MarketCandle[]
  /** Provider candle limit per interval, or null when the provider has no documented cap. */
  history_limit?: number | null
  /** Earliest candle open time (unix seconds) the provider can serve, when limited. */
  available_from?: number | null
  /** True when the requested history page is older than the provider window. */
  history_unavailable?: boolean
}

/** @deprecated Prefer MarketKlinesResponse; kept for existing Binance call sites. */
export type BinanceKlinesResponse = MarketKlinesResponse

export const HYPERLIQUID_BTC_KLINE_CHANNELS: Record<CandleInterval, string> = {
  '1m': 'hyperliquid.btc.kline.1m',
  '5m': 'hyperliquid.btc.kline.5m',
  '15m': 'hyperliquid.btc.kline.15m',
  '30m': 'hyperliquid.btc.kline.30m',
  '1h': 'hyperliquid.btc.kline.1h',
  '2h': 'hyperliquid.btc.kline.2h',
  '4h': 'hyperliquid.btc.kline.4h',
  '1d': 'hyperliquid.btc.kline.1d',
  '1w': 'hyperliquid.btc.kline.1w',
}

export const MARKET_KLINE_CHANNELS: Record<
  MarketExchange,
  Record<CandleInterval, string>
> = {
  binance: BTC_USDM_KLINE_CHANNELS,
  hyperliquid: HYPERLIQUID_BTC_KLINE_CHANNELS,
}

export function klineChannelForInterval(interval: CandleInterval): string {
  return BTC_USDM_KLINE_CHANNELS[interval]
}

export function marketKlineChannelForInterval(
  exchange: MarketExchange,
  interval: CandleInterval,
): string {
  return MARKET_KLINE_CHANNELS[exchange][interval]
}

export function parseMarketKlineChannel(
  channel: string,
): { exchange: MarketExchange; interval: CandleInterval } | null {
  for (const exchange of MARKET_EXCHANGES) {
    for (const interval of CANDLE_INTERVALS) {
      if (MARKET_KLINE_CHANNELS[exchange][interval] === channel) {
        return { exchange, interval }
      }
    }
  }
  return null
}
