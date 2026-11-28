/**
 * Rolling VWAP calculation core (TradingView Rolling VWAP / PineCoders ConditionalAverages).
 *
 * Time-window rolling sums mirror `totalForTimeWhen()` with `minBars` floor semantics.
 * Chart, UI, and indicator registry integration are out of scope for this module.
 */

import type { CandleInterval, MarketCandle } from './types.ts'

export const MS_IN_MIN = 60_000
export const MS_IN_HOUR = 60 * MS_IN_MIN
export const MS_IN_DAY = 24 * MS_IN_HOUR

export const SEC_IN_MIN = 60
export const SEC_IN_HOUR = 60 * SEC_IN_MIN
export const SEC_IN_DAY = 24 * SEC_IN_HOUR

/** Pine default minimum bars in the rolling window. */
export const DEFAULT_ROLLING_VWAP_MIN_BARS = 10

/** Pine default stdev band multipliers (bands hidden in chart when 0). */
export const DEFAULT_ROLLING_VWAP_STDEV_MULTIPLIERS = {
  multiplier1: 0,
  multiplier2: 0,
  multiplier3: 0,
} as const

export type RollingVwapStdevMultipliers = {
  multiplier1: number
  multiplier2: number
  multiplier3: number
}

/**
 * Band-offset definition of one Rolling VWAP instance.
 *
 * `stdev` keeps the Pine standard-deviation multipliers; `percentage` uses a
 * distance as a percentage of the instance's own VWAP (`upper = VWAP * (1 + p /
 * 100)`), never a percentage of candle price and unrelated to the chart's
 * Percentage / IndexedTo100 price-scale mode.
 */
export type RollingVwapBandType = 'stdev' | 'percentage'

export const ROLLING_VWAP_BAND_TYPES = ['stdev', 'percentage'] as const

/** Existing persisted instances have no band type and stay standard deviation. */
export const DEFAULT_ROLLING_VWAP_BAND_TYPE: RollingVwapBandType = 'stdev'

export type RollingVwapBandPercentages = {
  band1: number
  band2: number
  band3: number
}

/**
 * Percentage mode starts hidden: every distance is 0 so selecting Percentage
 * never enables bands on an instance that had none.
 */
export const DEFAULT_ROLLING_VWAP_BAND_PERCENTAGES = {
  band1: 0,
  band2: 0,
  band3: 0,
} as const

/**
 * Largest accepted percentage distance. `100` is the whole VWAP distance, so
 * the lower outline stays at or above zero; anything beyond it would describe a
 * negative price.
 */
export const MAX_ROLLING_VWAP_BAND_PERCENTAGE = 100

/** Pine "Time period" inputs (UI not wired in Stage 1). */
export type RollingVwapFixedTimePeriod = {
  useFixedTimePeriod: boolean
  days: number
  hours: number
  minutes: number
}

export const DEFAULT_ROLLING_VWAP_FIXED_TIME_PERIOD: RollingVwapFixedTimePeriod = {
  useFixedTimePeriod: false,
  days: 1,
  hours: 0,
  minutes: 0,
}

export type RollingVwapPoint = {
  time: number
  vwap: number | null
  stdev: number | null
  upper1: number | null
  lower1: number | null
  upper2: number | null
  lower2: number | null
  upper3: number | null
  lower3: number | null
}

export type RollingVwapComputeOptions = {
  minBars?: number
  multipliers?: RollingVwapStdevMultipliers
  /** Band offset definition; missing/invalid resolves to `stdev`. */
  bandType?: RollingVwapBandType
  /** Percentage-mode distances; ignored in `stdev` mode. */
  percentages?: RollingVwapBandPercentages
}

export class RollingVwapConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RollingVwapConfigError'
  }
}

function hlc3(candle: MarketCandle): number {
  return (candle.high + candle.low + candle.close) / 3
}

/**
 * Pine `timeStep()` for supported chart intervals (milliseconds).
 */
export function rollingVwapAutoWindowMs(interval: CandleInterval): number {
  const tfInMs = intervalToMs(interval)
  let step: number
  if (tfInMs <= MS_IN_MIN) {
    step = MS_IN_HOUR
  } else if (tfInMs <= MS_IN_MIN * 5) {
    step = MS_IN_HOUR * 4
  } else if (tfInMs <= MS_IN_HOUR) {
    step = MS_IN_DAY
  } else if (tfInMs <= MS_IN_HOUR * 4) {
    step = MS_IN_DAY * 3
  } else if (tfInMs <= MS_IN_HOUR * 12) {
    step = MS_IN_DAY * 7
  } else if (tfInMs <= MS_IN_DAY) {
    step = MS_IN_DAY * 30.4375
  } else if (tfInMs <= MS_IN_DAY * 7) {
    step = MS_IN_DAY * 90
  } else {
    step = MS_IN_DAY * 365
  }
  return Math.trunc(step)
}

function intervalToMs(interval: CandleInterval): number {
  switch (interval) {
    case '1m':
      return MS_IN_MIN
    case '5m':
      return MS_IN_MIN * 5
    case '15m':
      return MS_IN_MIN * 15
    case '30m':
      return MS_IN_MIN * 30
    case '1h':
      return MS_IN_HOUR
    case '2h':
      return MS_IN_HOUR * 2
    case '4h':
      return MS_IN_HOUR * 4
    case '1d':
      return MS_IN_DAY
    case '1w':
      return MS_IN_DAY * 7
    default: {
      const _exhaustive: never = interval
      return _exhaustive
    }
  }
}

export function isRollingVwapDays(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

export function isRollingVwapHours(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 23
}

export function isRollingVwapMinutes(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 59
}

export function isRollingVwapMinBars(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1
}

export function isRollingVwapStdevMultiplier(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

export function isRollingVwapBandType(value: unknown): value is RollingVwapBandType {
  return value === 'stdev' || value === 'percentage'
}

/**
 * Fractional percentages are supported; `0` hides that band pair. Non-numbers
 * (including numeric strings), NaN/Infinity, negatives and values above
 * `MAX_ROLLING_VWAP_BAND_PERCENTAGE` are invalid.
 */
export function isRollingVwapBandPercentage(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= MAX_ROLLING_VWAP_BAND_PERCENTAGE
  )
}

export function sanitizeRollingVwapFixedTimePeriod(
  value: unknown,
  defaults: RollingVwapFixedTimePeriod = DEFAULT_ROLLING_VWAP_FIXED_TIME_PERIOD,
): RollingVwapFixedTimePeriod {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return {
    useFixedTimePeriod:
      typeof record.useFixedTimePeriod === 'boolean'
        ? record.useFixedTimePeriod
        : defaults.useFixedTimePeriod,
    days: isRollingVwapDays(record.days) ? record.days : defaults.days,
    hours: isRollingVwapHours(record.hours) ? record.hours : defaults.hours,
    minutes: isRollingVwapMinutes(record.minutes) ? record.minutes : defaults.minutes,
  }
}

export function sanitizeRollingVwapStdevMultipliers(
  value: unknown,
  defaults: RollingVwapStdevMultipliers = { ...DEFAULT_ROLLING_VWAP_STDEV_MULTIPLIERS },
): RollingVwapStdevMultipliers {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return {
    multiplier1: isRollingVwapStdevMultiplier(record.multiplier1)
      ? record.multiplier1
      : defaults.multiplier1,
    multiplier2: isRollingVwapStdevMultiplier(record.multiplier2)
      ? record.multiplier2
      : defaults.multiplier2,
    multiplier3: isRollingVwapStdevMultiplier(record.multiplier3)
      ? record.multiplier3
      : defaults.multiplier3,
  }
}

export function sanitizeRollingVwapBandType(
  value: unknown,
  defaults: RollingVwapBandType = DEFAULT_ROLLING_VWAP_BAND_TYPE,
): RollingVwapBandType {
  return isRollingVwapBandType(value) ? value : defaults
}

export function sanitizeRollingVwapBandPercentages(
  value: unknown,
  defaults: RollingVwapBandPercentages = { ...DEFAULT_ROLLING_VWAP_BAND_PERCENTAGES },
): RollingVwapBandPercentages {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return {
    band1: isRollingVwapBandPercentage(record.band1) ? record.band1 : defaults.band1,
    band2: isRollingVwapBandPercentage(record.band2) ? record.band2 : defaults.band2,
    band3: isRollingVwapBandPercentage(record.band3) ? record.band3 : defaults.band3,
  }
}

export function validateRollingVwapFixedTimePeriod(period: RollingVwapFixedTimePeriod): void {
  if (!isRollingVwapDays(period.days)) {
    throw new RollingVwapConfigError('days must be an integer >= 0')
  }
  if (!isRollingVwapHours(period.hours)) {
    throw new RollingVwapConfigError('hours must be an integer from 0 to 23')
  }
  if (!isRollingVwapMinutes(period.minutes)) {
    throw new RollingVwapConfigError('minutes must be an integer from 0 to 59')
  }
}

export function validateRollingVwapStdevMultipliers(multipliers: RollingVwapStdevMultipliers): void {
  const keys: (keyof RollingVwapStdevMultipliers)[] = ['multiplier1', 'multiplier2', 'multiplier3']
  for (const key of keys) {
    if (!isRollingVwapStdevMultiplier(multipliers[key])) {
      throw new RollingVwapConfigError(`${key} must be a finite number >= 0`)
    }
  }
}

export function validateRollingVwapBandPercentages(percentages: RollingVwapBandPercentages): void {
  const keys: (keyof RollingVwapBandPercentages)[] = ['band1', 'band2', 'band3']
  for (const key of keys) {
    if (!isRollingVwapBandPercentage(percentages[key])) {
      throw new RollingVwapConfigError(
        `${key} must be a finite number from 0 to ${MAX_ROLLING_VWAP_BAND_PERCENTAGE}`,
      )
    }
  }
}

/** Total fixed window length in milliseconds (Pine: days + hours + minutes inputs). */
export function fixedTimePeriodWindowMs(period: RollingVwapFixedTimePeriod): number {
  return period.days * MS_IN_DAY + period.hours * MS_IN_HOUR + period.minutes * MS_IN_MIN
}

export function resolveRollingVwapWindowMs(
  interval: CandleInterval,
  period: RollingVwapFixedTimePeriod,
): number {
  validateRollingVwapFixedTimePeriod(period)
  if (period.useFixedTimePeriod) {
    return fixedTimePeriodWindowMs(period)
  }
  return rollingVwapAutoWindowMs(interval)
}

/**
 * Pine `tfString()` label for the Rolling VWAP window (instance period label).
 */
export function formatRollingVwapTimePeriodLabel(timeInMs: number): string {
  const s = Math.trunc(timeInMs / 1000)
  const m = Math.trunc(s / 60)
  const h = Math.trunc(m / 60)
  const tm = Math.floor(m % 60)
  const th = Math.floor(h % 24)
  const d = Math.floor(h / 24)

  if (d === 30 && th === 10 && tm === 30) {
    return '1M'
  }
  if (d === 7 && th === 0 && tm === 0) {
    return '1W'
  }

  const dStr = d > 0 ? `${d}D` : ''
  const hStr = th > 0 ? `${th}H` : ''
  const mStr = tm > 0 ? `${tm}min` : ''
  const hasHours = hStr !== ''
  const hasMins = mStr !== ''
  const gapAfterDays = hasHours || hasMins ? ' ' : ''
  const gapAfterHours = hasMins ? ' ' : ''
  return dStr + gapAfterDays + hStr + gapAfterHours + mStr
}

/**
 * Sort ascending by time; duplicate timestamps keep the last candle.
 * Does not mutate the input array.
 */
export function normalizeRollingVwapCandles(candles: readonly MarketCandle[]): MarketCandle[] {
  const byTime = new Map<number, MarketCandle>()
  for (const candle of candles) {
    byTime.set(candle.time, candle)
  }
  return [...byTime.entries()]
    .sort(([timeA], [timeB]) => timeA - timeB)
    .map(([, candle]) => candle)
}

type RollingTotals = {
  sumSrcVol: number
  sumVol: number
  sumSrcSrcVol: number
}

function emptyTotals(): RollingTotals {
  return { sumSrcVol: 0, sumVol: 0, sumSrcSrcVol: 0 }
}

function addCandleToTotals(totals: RollingTotals, candle: MarketCandle): void {
  const src = hlc3(candle)
  const vol = candle.volume
  totals.sumSrcVol += src * vol
  totals.sumVol += vol
  totals.sumSrcSrcVol += vol * src * src
}

function removeCandleFromTotals(totals: RollingTotals, candle: MarketCandle): void {
  const src = hlc3(candle)
  const vol = candle.volume
  totals.sumSrcVol -= src * vol
  totals.sumVol -= vol
  totals.sumSrcSrcVol -= vol * src * src
}

type RollingVwapBandValues = Pick<
  RollingVwapPoint,
  'upper1' | 'lower1' | 'upper2' | 'lower2' | 'upper3' | 'lower3'
>

/**
 * Band offsets around the unchanged VWAP centre. `stdev` keeps the Pine
 * `vwap +/- stdev * multiplier` math; `percentage` is
 * `vwap * (1 +/- p / 100)` using the instance's own VWAP.
 */
function bandValuesFromCenter(
  vwap: number,
  stdev: number,
  bandType: RollingVwapBandType,
  multipliers: RollingVwapStdevMultipliers,
  percentages: RollingVwapBandPercentages,
): RollingVwapBandValues {
  if (bandType === 'percentage') {
    const { band1, band2, band3 } = percentages
    return {
      upper1: vwap * (1 + band1 / 100),
      lower1: vwap * (1 - band1 / 100),
      upper2: vwap * (1 + band2 / 100),
      lower2: vwap * (1 - band2 / 100),
      upper3: vwap * (1 + band3 / 100),
      lower3: vwap * (1 - band3 / 100),
    }
  }

  const { multiplier1, multiplier2, multiplier3 } = multipliers
  return {
    upper1: vwap + stdev * multiplier1,
    lower1: vwap - stdev * multiplier1,
    upper2: vwap + stdev * multiplier2,
    lower2: vwap - stdev * multiplier2,
    upper3: vwap + stdev * multiplier3,
    lower3: vwap - stdev * multiplier3,
  }
}

function pointFromTotals(
  time: number,
  totals: RollingTotals,
  bandType: RollingVwapBandType,
  multipliers: RollingVwapStdevMultipliers,
  percentages: RollingVwapBandPercentages,
): RollingVwapPoint {
  const nullPoint: RollingVwapPoint = {
    time,
    vwap: null,
    stdev: null,
    upper1: null,
    lower1: null,
    upper2: null,
    lower2: null,
    upper3: null,
    lower3: null,
  }

  const { sumSrcVol, sumVol, sumSrcSrcVol } = totals
  if (sumVol <= 0 || !Number.isFinite(sumVol) || !Number.isFinite(sumSrcVol) || !Number.isFinite(sumSrcSrcVol)) {
    return nullPoint
  }

  const vwap = sumSrcVol / sumVol
  if (!Number.isFinite(vwap)) {
    return nullPoint
  }

  let variance = sumSrcSrcVol / sumVol - vwap * vwap
  variance = Math.max(variance, 0)
  const stdev = Math.sqrt(variance)
  if (!Number.isFinite(stdev)) {
    return nullPoint
  }

  return {
    time,
    vwap,
    stdev,
    ...bandValuesFromCenter(vwap, stdev, bandType, multipliers, percentages),
  }
}

/**
 * Rolling VWAP series for a resolved millisecond window (Pine `totalForTimeWhen` semantics).
 */
export function computeRollingVwap(
  candles: readonly MarketCandle[],
  windowMs: number,
  options: RollingVwapComputeOptions = {},
): RollingVwapPoint[] {
  if (!Number.isFinite(windowMs) || windowMs < 0) {
    throw new RollingVwapConfigError('windowMs must be a non-negative finite number')
  }

  const minBars = options.minBars ?? DEFAULT_ROLLING_VWAP_MIN_BARS
  if (!Number.isInteger(minBars) || minBars < 1) {
    throw new RollingVwapConfigError('minBars must be a positive integer')
  }

  const multipliers = options.multipliers ?? DEFAULT_ROLLING_VWAP_STDEV_MULTIPLIERS
  validateRollingVwapStdevMultipliers(multipliers)
  const bandType = options.bandType ?? DEFAULT_ROLLING_VWAP_BAND_TYPE
  if (!isRollingVwapBandType(bandType)) {
    throw new RollingVwapConfigError('bandType must be "stdev" or "percentage"')
  }
  const percentages = options.percentages ?? DEFAULT_ROLLING_VWAP_BAND_PERCENTAGES
  validateRollingVwapBandPercentages(percentages)
  const normalized = normalizeRollingVwapCandles(candles)
  if (normalized.length === 0) {
    return []
  }

  const windowSec = windowMs / 1000
  const points: RollingVwapPoint[] = []
  let head = 0
  let timeStart = 0
  const totals = emptyTotals()

  for (let i = 0; i < normalized.length; i++) {
    const candle = normalized[i]
    const oldestTime = candle.time - windowSec

    while (timeStart < i && normalized[timeStart].time < oldestTime) {
      timeStart++
    }

    const minStart = Math.max(0, i - minBars + 1)
    const start = Math.min(timeStart, minStart)

    while (head < start) {
      removeCandleFromTotals(totals, normalized[head])
      head++
    }

    addCandleToTotals(totals, candle)
    points.push(pointFromTotals(candle.time, totals, bandType, multipliers, percentages))
  }

  return points
}

export function computeRollingVwapForInterval(
  candles: readonly MarketCandle[],
  interval: CandleInterval,
  period: RollingVwapFixedTimePeriod = DEFAULT_ROLLING_VWAP_FIXED_TIME_PERIOD,
  options: RollingVwapComputeOptions = {},
): RollingVwapPoint[] {
  const windowMs = resolveRollingVwapWindowMs(interval, period)
  return computeRollingVwap(candles, windowMs, options)
}
