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

function resolveAnchorIndexOnNormalized(
  normalized: readonly MarketCandle[],
  anchorTime: number,
): number {
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
  return anchorIndex
}

/** Cache invalidation key covering every HLC3/volume input from anchor through the latest bar. */
export function anchoredVwapCalculationInputsCacheKey(
  candles: readonly MarketCandle[],
  anchorTime: number,
): string {
  const normalized = normalizeCandles(candles)
  const anchorIndex = resolveAnchorIndexOnNormalized(normalized, anchorTime)
  if (anchorIndex < 0) return 'none'
  const parts: string[] = []
  for (let index = anchorIndex; index < normalized.length; index += 1) {
    const candle = normalized[index]
    parts.push(
      [candle.time, candle.high, candle.low, candle.close, candle.volume].join(','),
    )
  }
  return parts.join(';')
}

export type AnchoredVwapAccumulationTotals = {
  sumSrcVol: number
  sumVol: number
  sumSrcSrcVol: number
}

export const EMPTY_ANCHORED_VWAP_ACCUMULATION_TOTALS: AnchoredVwapAccumulationTotals = {
  sumSrcVol: 0,
  sumVol: 0,
  sumSrcSrcVol: 0,
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

/** Candles from the resolved anchor bar through the latest loaded bar. */
export function sliceAnchoredVwapCandlesFromAnchor(
  candles: readonly MarketCandle[],
  anchorTime: number,
): MarketCandle[] {
  const normalized = normalizeCandles(candles)
  if (normalized.length === 0) return []

  const anchorIndex = resolveAnchorIndexOnNormalized(normalized, anchorTime)
  if (anchorIndex < 0) return []
  return normalized.slice(anchorIndex)
}

export function anchoredVwapPointForCandle(
  totalsBefore: AnchoredVwapAccumulationTotals,
  candle: MarketCandle,
  multipliers: AnchoredVwapDrawingMultipliers,
): { point: AnchoredVwapDrawingPoint; totalsAfter: AnchoredVwapAccumulationTotals } {
  const volume = candle.volume
  if (!Number.isFinite(volume) || volume < 0) {
    return {
      point: {
        time: candle.time,
        vwap: null,
        upper1: null,
        lower1: null,
        upper2: null,
        lower2: null,
        upper3: null,
        lower3: null,
      },
      totalsAfter: totalsBefore,
    }
  }
  const src = hlc3(candle)
  const totalsAfter: AnchoredVwapAccumulationTotals = {
    sumSrcVol: totalsBefore.sumSrcVol + src * volume,
    sumVol: totalsBefore.sumVol + volume,
    sumSrcSrcVol: totalsBefore.sumSrcSrcVol + volume * src * src,
  }
  return {
    point: {
      time: candle.time,
      ...bandsFromTotals(
        totalsAfter.sumSrcVol,
        totalsAfter.sumVol,
        totalsAfter.sumSrcSrcVol,
        multipliers,
      ),
    },
    totalsAfter,
  }
}

export function anchoredVwapTotalsThroughSlicePrefix(
  slice: readonly MarketCandle[],
  candleCount: number,
): AnchoredVwapAccumulationTotals {
  let totals = EMPTY_ANCHORED_VWAP_ACCUMULATION_TOTALS
  const limit = Math.min(candleCount, slice.length)
  for (let index = 0; index < limit; index += 1) {
    const { totalsAfter } = anchoredVwapPointForCandle(
      totals,
      slice[index],
      DEFAULT_ANCHORED_VWAP_DRAWING_MULTIPLIERS,
    )
    totals = totalsAfter
  }
  return totals
}

/** User-anchored VWAP from `anchorTime` through the latest loaded candle (HLC3, volume-weighted stdev). */
export function computeAnchoredVwapDrawing(
  candles: readonly MarketCandle[],
  anchorTime: number,
  multipliers: AnchoredVwapDrawingMultipliers = DEFAULT_ANCHORED_VWAP_DRAWING_MULTIPLIERS,
): AnchoredVwapDrawingPoint[] {
  const slice = sliceAnchoredVwapCandlesFromAnchor(candles, anchorTime)
  if (slice.length === 0) return []

  const points: AnchoredVwapDrawingPoint[] = []
  let totals = EMPTY_ANCHORED_VWAP_ACCUMULATION_TOTALS

  for (const candle of slice) {
    const { point, totalsAfter } = anchoredVwapPointForCandle(totals, candle, multipliers)
    totals = totalsAfter
    points.push(point)
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
