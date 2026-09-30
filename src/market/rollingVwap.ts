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
    case '30m':
      return MS_IN_MIN * 30
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
 * Pine `tfString()` for info-box labels (Stage 2+ UI).
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

function pointFromTotals(
  time: number,
  totals: RollingTotals,
  multipliers: RollingVwapStdevMultipliers,
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

  const { multiplier1, multiplier2, multiplier3 } = multipliers
  return {
    time,
    vwap,
    stdev,
    upper1: vwap + stdev * multiplier1,
    lower1: vwap - stdev * multiplier1,
    upper2: vwap + stdev * multiplier2,
    lower2: vwap - stdev * multiplier2,
    upper3: vwap + stdev * multiplier3,
    lower3: vwap - stdev * multiplier3,
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
    points.push(pointFromTotals(candle.time, totals, multipliers))
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
