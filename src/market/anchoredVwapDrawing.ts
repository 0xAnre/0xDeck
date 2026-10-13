import type { MarketCandle } from './types.ts'

export const DEFAULT_ANCHORED_VWAP_DRAWING_MULTIPLIERS = {
  multiplier1: 1,
  multiplier2: 2,
  multiplier3: 3,
} as const

export type AnchoredVwapDrawingMultipliers = {
  multiplier1: number
  multiplier2: number
  multiplier3: number
}

export type AnchoredVwapDrawingBands = {
  vwap: number | null
  upper1: number | null
  lower1: number | null
  upper2: number | null
  lower2: number | null
  upper3: number | null
  lower3: number | null
}

export type AnchoredVwapDrawingPoint = AnchoredVwapDrawingBands & {
  time: number
}

function hlc3(candle: MarketCandle): number {
  return (candle.high + candle.low + candle.close) / 3
}

function normalizeCandles(candles: readonly MarketCandle[]): MarketCandle[] {
  const byTime = new Map<number, MarketCandle>()
  for (const candle of candles) {
    byTime.set(candle.time, candle)
  }
  return [...byTime.entries()]
    .sort(([timeA], [timeB]) => timeA - timeB)
    .map(([, candle]) => candle)
}

function bandsFromTotals(
  sumSrcVol: number,
  sumVol: number,
  sumSrcSrcVol: number,
  multipliers: AnchoredVwapDrawingMultipliers,
): AnchoredVwapDrawingBands {
  if (sumVol <= 0 || !Number.isFinite(sumVol)) {
    return {
      vwap: null,
      upper1: null,
      lower1: null,
      upper2: null,
      lower2: null,
      upper3: null,
      lower3: null,
    }
  }

  const vwap = sumSrcVol / sumVol
  let variance = sumSrcSrcVol / sumVol - vwap * vwap
  variance = Math.max(variance, 0)
  const stdev = Math.sqrt(variance)

  const upperLower = (mult: number) => ({
    upper: vwap + mult * stdev,
    lower: vwap - mult * stdev,
  })

  const b1 = upperLower(multipliers.multiplier1)
  const b2 = upperLower(multipliers.multiplier2)
  const b3 = upperLower(multipliers.multiplier3)

  return {
    vwap,
    upper1: b1.upper,
    lower1: b1.lower,
    upper2: b2.upper,
    lower2: b2.lower,
    upper3: b3.upper,
    lower3: b3.lower,
  }
}

/** User-anchored VWAP from `anchorTime` through the latest loaded candle (HLC3, volume-weighted stdev). */
export function computeAnchoredVwapDrawing(
  candles: readonly MarketCandle[],
  anchorTime: number,
  multipliers: AnchoredVwapDrawingMultipliers = DEFAULT_ANCHORED_VWAP_DRAWING_MULTIPLIERS,
): AnchoredVwapDrawingPoint[] {
  const normalized = normalizeCandles(candles)
  if (normalized.length === 0) return []

  const anchor = Math.trunc(anchorTime)
  let anchorIndex = -1
  for (let index = 0; index < normalized.length; index += 1) {
    if (normalized[index].time === anchor) {
      anchorIndex = index
      break
    }
    if (normalized[index].time > anchor) {
      break
    }
    anchorIndex = index
  }
  if (anchorIndex < 0) return []

  const slice = normalized.slice(anchorIndex)
  const points: AnchoredVwapDrawingPoint[] = []
  let sumSrcVol = 0
  let sumVol = 0
  let sumSrcSrcVol = 0

  for (const candle of slice) {
    const src = hlc3(candle)
    const volume = candle.volume
    if (!Number.isFinite(volume) || volume < 0) {
      points.push({
        time: candle.time,
        vwap: null,
        upper1: null,
        lower1: null,
        upper2: null,
        lower2: null,
        upper3: null,
        lower3: null,
      })
      continue
    }
    sumSrcVol += src * volume
    sumVol += volume
    sumSrcSrcVol += volume * src * src
    points.push({
      time: candle.time,
      ...bandsFromTotals(sumSrcVol, sumVol, sumSrcSrcVol, multipliers),
    })
  }

  return points
}

/** Resolves pointer time to an anchor candle open time present in loaded history. */
export function resolveAnchoredVwapAnchorTimeFromPointer(
  candles: readonly MarketCandle[],
  pointerTime: number,
): number | null {
  const normalized = normalizeCandles(candles)
  if (normalized.length === 0 || !Number.isFinite(pointerTime)) return null
  const target = Math.trunc(pointerTime)
  let resolved: number | null = null
  for (const candle of normalized) {
    if (candle.time > target) break
    resolved = candle.time
  }
  return resolved
}
