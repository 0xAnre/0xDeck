import type { ISeriesApi, UTCTimestamp } from 'lightweight-charts'
import { computeEmaLine, EMA_PERIODS } from '@/market/ema'
import { applyLiveCandle } from '@/market/parseMarketCandle'
import type { MarketCandle } from '@/market/types'

function toCandlestickPoint(candle: MarketCandle) {
  return {
    time: candle.time as UTCTimestamp,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  }
}

type ChartSeriesBundle = {
  candle: ISeriesApi<'Candlestick'>
  emas: ISeriesApi<'Line'>[]
}

/** Update in-memory candles and chart series (no full setData). */
export function applyChartLiveCandle(
  candles: MarketCandle[],
  candle: MarketCandle,
  bundle: ChartSeriesBundle,
): void {
  const applyResult = applyLiveCandle(candles, candle)
  if (applyResult === 'ignore') return

  bundle.candle.update(toCandlestickPoint(candle))

  EMA_PERIODS.forEach((period, index) => {
    const line = computeEmaLine(candles, period)
    if (line.length === 0) return
    const last = line[line.length - 1]
    bundle.emas[index].update({
      time: last.time as UTCTimestamp,
      value: last.value,
    })
  })
}
