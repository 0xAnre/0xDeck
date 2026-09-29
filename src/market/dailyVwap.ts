/**
 * Daily VWAP calculation (UTC session).
 *
 * Ported from the daily branch of:
 * - Original indicator: Koalafied VWAP D/W/M/Q/Y
 * - Original copyright: © TJ_667
 * - License: Mozilla Public License 2.0
 * - Source: https://www.tradingview.com/script/Cnk6E8IO-Koalafied-VWAP-D-W-M-Q-Y/
 *
 * Weekly / monthly / quarterly / yearly sessions are not implemented yet.
 */

import type { MarketCandle } from './types.ts'

/** Standard deviation multiplier for band 1 (Pine default). */
export const DAILY_VWAP_BAND_1_MULT = 1.0

/** Standard deviation multiplier for band 2 (Pine default). */
export const DAILY_VWAP_BAND_2_MULT = 2.0

const SECONDS_PER_UTC_DAY = 86_400

export type DailyVwapBands = {
  vwap: number | null
  upper1: number | null
  lower1: number | null
  upper2: number | null
  lower2: number | null
}

export type DailyVwapPoint = DailyVwapBands & {
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

function utcDayIndex(epochSeconds: number): number {
  return Math.floor(epochSeconds / SECONDS_PER_UTC_DAY)
}

function hlc3(candle: MarketCandle): number {
  return (candle.high + candle.low + candle.close) / 3
}

/**
 * Collapse duplicate timestamps (last candle wins) and sort ascending by time.
 * Input need not be pre-sorted; output is strictly ascending unique times.
 */
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
): DailyVwapBands {
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
    upper1: vwap + DAILY_VWAP_BAND_1_MULT * stdev,
    lower1: vwap - DAILY_VWAP_BAND_1_MULT * stdev,
    upper2: vwap + DAILY_VWAP_BAND_2_MULT * stdev,
    lower2: vwap - DAILY_VWAP_BAND_2_MULT * stdev,
  }
}

function snapshotFromBands(bands: DailyVwapBands): BandSnapshot | null {
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

/**
 * Compute daily VWAP and ±1σ / ±2σ bands for each candle.
 *
 * - Candles should be in ascending time order; unsorted input is normalized.
 * - Duplicate timestamps use the last candle at that time (open-candle updates).
 * - Session resets at 00:00 UTC.
 * - Does not mutate the input array or candle objects.
 */
export function computeDailyVwap(candles: readonly MarketCandle[]): DailyVwapPoint[] {
  const normalized = normalizeCandles(candles)
  if (normalized.length === 0) return []

  const points: DailyVwapPoint[] = []

  let dayIndex: number | null = null
  let sumSrcVol = 0
  let sumVol = 0
  let sumSrcSrcVol = 0
  let previousDay: BandSnapshot | null = null
  let lastSnapshot: BandSnapshot | null = null

  for (const candle of normalized) {
    const candleDay = utcDayIndex(candle.time)

    if (dayIndex !== null && candleDay !== dayIndex) {
      previousDay = lastSnapshot
      sumSrcVol = 0
      sumVol = 0
      sumSrcSrcVol = 0
      lastSnapshot = null
    }

    dayIndex = candleDay

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
      ...previousFields(previousDay),
    })
  }

  return points
}
