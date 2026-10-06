import type { ISeriesApi, UTCTimestamp } from 'lightweight-charts'
import { computeEmaLine, EMA_200_PERIOD } from './ema.ts'
import type { MarketCandle } from './types.ts'

export function setEma200HistoryData(
  series: ISeriesApi<'Line'>,
  candles: readonly MarketCandle[],
): void {
  const ema200Line = computeEmaLine([...candles], EMA_200_PERIOD)
  series.setData(
    ema200Line.map((point) => ({
      time: point.time as UTCTimestamp,
      value: point.value,
    })),
  )
}

export function updateEma200Live(series: ISeriesApi<'Line'>, candles: readonly MarketCandle[]): void {
  const ema200Line = computeEmaLine([...candles], EMA_200_PERIOD)
  if (ema200Line.length === 0) return
  const last = ema200Line[ema200Line.length - 1]
  series.update({
    time: last.time as UTCTimestamp,
    value: last.value,
  })
}
