import type { ISeriesApi, UTCTimestamp } from 'lightweight-charts'
import { computeEmaLine, EMA_100_PERIOD, EMA_200_PERIOD } from './ema.ts'
import type { MarketCandle } from './types.ts'

function setEmaPeriodHistoryData(
  series: ISeriesApi<'Line'>,
  candles: readonly MarketCandle[],
  period: number,
): void {
  const line = computeEmaLine([...candles], period)
  series.setData(
    line.map((point) => ({
      time: point.time as UTCTimestamp,
      value: point.value,
    })),
  )
}

function updateEmaPeriodLive(
  series: ISeriesApi<'Line'>,
  candles: readonly MarketCandle[],
  period: number,
): void {
  const line = computeEmaLine([...candles], period)
  if (line.length === 0) return
  const last = line[line.length - 1]
  series.update({
    time: last.time as UTCTimestamp,
    value: last.value,
  })
}

export function setDualEmaHistoryData(
  ema100Series: ISeriesApi<'Line'>,
  ema200Series: ISeriesApi<'Line'>,
  candles: readonly MarketCandle[],
): void {
  setEmaPeriodHistoryData(ema100Series, candles, EMA_100_PERIOD)
  setEmaPeriodHistoryData(ema200Series, candles, EMA_200_PERIOD)
}

export function updateDualEmaLive(
  ema100Series: ISeriesApi<'Line'>,
  ema200Series: ISeriesApi<'Line'>,
  candles: readonly MarketCandle[],
): void {
  updateEmaPeriodLive(ema100Series, candles, EMA_100_PERIOD)
  updateEmaPeriodLive(ema200Series, candles, EMA_200_PERIOD)
}
