import type { MarketCandle } from '@/market/types'

export const EMA_PERIODS = [13, 21, 35] as const

export const EMA_200_PERIOD = 200

export type EmaPeriod = (typeof EMA_PERIODS)[number]

export type EmaPoint = {
  time: number
  value: number
}

/**
 * Standard EMA: multiplier = 2 / (period + 1); seed with SMA of first `period` closes.
 */
export function computeEmaLine(candles: MarketCandle[], period: number): EmaPoint[] {
  if (candles.length < period) return []

  const closes = candles.map((c) => c.close)
  const multiplier = 2 / (period + 1)
  const points: EmaPoint[] = []

  let sum = 0
  for (let i = 0; i < period; i += 1) {
    sum += closes[i]
  }
  let ema = sum / period
  points.push({ time: candles[period - 1].time, value: ema })

  for (let i = period; i < candles.length; i += 1) {
    ema = closes[i] * multiplier + ema * (1 - multiplier)
    points.push({ time: candles[i].time, value: ema })
  }

  return points
}
