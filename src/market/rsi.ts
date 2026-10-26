import type { MarketCandle } from './types.ts'

/**
 * Wilder RSI (Relative Strength Index) for the BTC Perpetual chart.
 *
 * Pure math + settings only: no chart, storage or network access. History and
 * live series updates both use `computeWilderRsi` so the value shown for a
 * candle is identical regardless of how it reached the chart.
 */

export const DEFAULT_RSI_PERIOD = 14

export const RSI_PERIOD_MIN = 2

export const RSI_PERIOD_MAX = 200

export const RSI_LEVEL_MIN = 0

export const RSI_LEVEL_MAX = 100

export const DEFAULT_RSI_OVERBOUGHT = 70

export const DEFAULT_RSI_OVERSOLD = 30

/** Neutral mid line drawn between the overbought/oversold levels. */
export const RSI_MID_LEVEL = 50

export type RsiPoint = {
  time: number
  value: number
}

export type RsiSettings = {
  period: number
  overbought: number
  oversold: number
}

export function createDefaultRsiSettings(): RsiSettings {
  return {
    period: DEFAULT_RSI_PERIOD,
    overbought: DEFAULT_RSI_OVERBOUGHT,
    oversold: DEFAULT_RSI_OVERSOLD,
  }
}

function clampInteger(value: number, min: number, max: number): number {
  const rounded = Math.round(value)
  if (rounded < min) return min
  if (rounded > max) return max
  return rounded
}

export function sanitizeRsiPeriod(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_RSI_PERIOD
  return clampInteger(value, RSI_PERIOD_MIN, RSI_PERIOD_MAX)
}

function sanitizeRsiLevel(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return clampInteger(value, RSI_LEVEL_MIN, RSI_LEVEL_MAX)
}

/**
 * Sanitize persisted settings. An invalid pair (overbought <= oversold) falls
 * back to the default 70/30 pair instead of rendering inverted bands.
 */
export function sanitizeRsiSettings(value: unknown): RsiSettings {
  const record =
    value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const period = sanitizeRsiPeriod(record.period)
  let overbought = sanitizeRsiLevel(record.overbought, DEFAULT_RSI_OVERBOUGHT)
  let oversold = sanitizeRsiLevel(record.oversold, DEFAULT_RSI_OVERSOLD)
  if (overbought <= oversold) {
    overbought = DEFAULT_RSI_OVERBOUGHT
    oversold = DEFAULT_RSI_OVERSOLD
  }
  return { period, overbought, oversold }
}

function rsiValueFromAverages(averageGain: number, averageLoss: number): number {
  const total = averageGain + averageLoss
  // A perfectly flat window has no gains and no losses; report neutral.
  if (total === 0) return RSI_MID_LEVEL
  return (100 * averageGain) / total
}

/**
 * Wilder RSI: the first value is seeded with the simple average gain/loss over
 * the first `period` changes, then each later value uses Wilder smoothing
 * (`avg = (prev * (period - 1) + current) / period`).
 */
export function computeWilderRsi(
  candles: readonly MarketCandle[],
  period: number,
): RsiPoint[] {
  const safePeriod = sanitizeRsiPeriod(period)
  if (candles.length <= safePeriod) return []

  let gainSum = 0
  let lossSum = 0
  for (let index = 1; index <= safePeriod; index += 1) {
    const change = candles[index].close - candles[index - 1].close
    if (change > 0) {
      gainSum += change
    } else {
      lossSum -= change
    }
  }

  let averageGain = gainSum / safePeriod
  let averageLoss = lossSum / safePeriod
  const points: RsiPoint[] = [
    {
      time: candles[safePeriod].time,
      value: rsiValueFromAverages(averageGain, averageLoss),
    },
  ]

  for (let index = safePeriod + 1; index < candles.length; index += 1) {
    const change = candles[index].close - candles[index - 1].close
    const gain = change > 0 ? change : 0
    const loss = change < 0 ? -change : 0
    averageGain = (averageGain * (safePeriod - 1) + gain) / safePeriod
    averageLoss = (averageLoss * (safePeriod - 1) + loss) / safePeriod
    points.push({
      time: candles[index].time,
      value: rsiValueFromAverages(averageGain, averageLoss),
    })
  }

  return points
}
