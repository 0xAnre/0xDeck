import type { MarketCandle } from './types.ts'

export const ANCHORED_VWAP_BAND_1_MULT = 1.0
export const ANCHORED_VWAP_BAND_2_MULT = 2.0

export type AnchoredVwapBands = {
  vwap: number | null
  upper1: number | null
  lower1: number | null
  upper2: number | null
  lower2: number | null
}

export type AnchoredVwapPoint = AnchoredVwapBands & {
  time: number
  previousVwap: number | null
  previousUpper1: number | null
  previousLower1: number | null
  previousUpper2: number | null
  previousLower2: number | null
}

type BandSnapshot = {
  vwap: number
  upper1: number
  lower1: number
  upper2: number
  lower2: number
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
): AnchoredVwapBands {
  if (sumVol <= 0 || !Number.isFinite(sumVol)) {
    return {
      vwap: null,
      upper1: null,
      lower1: null,
      upper2: null,
      lower2: null,
    }
  }

  const vwap = sumSrcVol / sumVol
  let variance = sumSrcSrcVol / sumVol - vwap * vwap
  variance = Math.max(variance, 0)
  const stdev = Math.sqrt(variance)

  return {
    vwap,
    upper1: vwap + ANCHORED_VWAP_BAND_1_MULT * stdev,
    lower1: vwap - ANCHORED_VWAP_BAND_1_MULT * stdev,
    upper2: vwap + ANCHORED_VWAP_BAND_2_MULT * stdev,
    lower2: vwap - ANCHORED_VWAP_BAND_2_MULT * stdev,
  }
}

function snapshotFromBands(bands: AnchoredVwapBands): BandSnapshot | null {
  if (
    bands.vwap === null ||
    bands.upper1 === null ||
    bands.lower1 === null ||
    bands.upper2 === null ||
    bands.lower2 === null
  ) {
    return null
  }
  return {
    vwap: bands.vwap,
    upper1: bands.upper1,
    lower1: bands.lower1,
    upper2: bands.upper2,
    lower2: bands.lower2,
  }
}

function previousFields(previous: BandSnapshot | null) {
  return {
    previousVwap: previous?.vwap ?? null,
    previousUpper1: previous?.upper1 ?? null,
    previousLower1: previous?.lower1 ?? null,
    previousUpper2: previous?.upper2 ?? null,
    previousLower2: previous?.lower2 ?? null,
  }
}

/** Shared Koalafied-style anchored VWAP with HLC3 source and volume-weighted variance. */
export function computeAnchoredVwap(
  candles: readonly MarketCandle[],
  periodKey: (epochSeconds: number) => string,
): AnchoredVwapPoint[] {
  const normalized = normalizeCandles(candles)
  if (normalized.length === 0) return []

  const points: AnchoredVwapPoint[] = []

  let activeKey: string | null = null
  let sumSrcVol = 0
  let sumVol = 0
  let sumSrcSrcVol = 0
  let previousPeriod: BandSnapshot | null = null
  let lastSnapshot: BandSnapshot | null = null

  for (const candle of normalized) {
    const candleKey = periodKey(candle.time)

    if (activeKey !== null && candleKey !== activeKey) {
      previousPeriod = lastSnapshot
      sumSrcVol = 0
      sumVol = 0
      sumSrcSrcVol = 0
      lastSnapshot = null
    }

    activeKey = candleKey

    const src = hlc3(candle)
    sumSrcVol += src * candle.volume
    sumVol += candle.volume
    sumSrcSrcVol += candle.volume * src * src

    const bands = bandsFromTotals(sumSrcVol, sumVol, sumSrcSrcVol)
    const snapshot = snapshotFromBands(bands)
    if (snapshot) {
      lastSnapshot = snapshot
    }

    points.push({
      time: candle.time,
      ...bands,
      ...previousFields(previousPeriod),
    })
  }

  return points
}
