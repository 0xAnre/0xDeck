import type { MarketCandle } from '@/market/types'

export const SMA_20_PERIOD = 20
export const SMA_50_PERIOD = 50
export const SMA_100_PERIOD = 100
export const SMA_200_PERIOD = 200

export type SmaPoint = {
  time: number
  value: number
}

/** Arithmetic mean of the latest `period` candle closes; first point at candle `period`. */
export function computeSmaLine(candles: MarketCandle[], period: number): SmaPoint[] {
  if (candles.length < period) return []

  const points: SmaPoint[] = []
  const closes = candles.map((c) => c.close)

  for (let i = period - 1; i < candles.length; i += 1) {
    let sum = 0
    for (let j = i - period + 1; j <= i; j += 1) {
      sum += closes[j]
    }
    points.push({ time: candles[i].time, value: sum / period })
  }

  return points
}
