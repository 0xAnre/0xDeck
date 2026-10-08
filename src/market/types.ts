export const CANDLE_INTERVALS = ['1m', '5m', '30m', '1h', '2h', '4h', '1d', '1w'] as const

export type CandleInterval = (typeof CANDLE_INTERVALS)[number]

export const DEFAULT_CANDLE_INTERVAL: CandleInterval = '1m'

export const BTC_USDM_KLINE_CHANNELS: Record<CandleInterval, string> = {
  '1m': 'binance.usdm.btcusdt.kline.1m',
  '5m': 'binance.usdm.btcusdt.kline.5m',
  '30m': 'binance.usdm.btcusdt.kline.30m',
  '1h': 'binance.usdm.btcusdt.kline.1h',
  '2h': 'binance.usdm.btcusdt.kline.2h',
  '4h': 'binance.usdm.btcusdt.kline.4h',
  '1d': 'binance.usdm.btcusdt.kline.1d',
  '1w': 'binance.usdm.btcusdt.kline.1w',
}

export type MarketCandle = {
  symbol: 'BTCUSDT'
  interval: CandleInterval
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  closed: boolean
}

export type BinanceKlinesResponse = {
  symbol: 'BTCUSDT'
  interval: CandleInterval
  candles: MarketCandle[]
}

export function klineChannelForInterval(interval: CandleInterval): string {
  return BTC_USDM_KLINE_CHANNELS[interval]
}
