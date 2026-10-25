/**
 * Rolling VWAP minimum chart timeframe table (approved mapping).
 *
 * The period bucket is derived from the *effective* rolling window:
 * - fixed period -> `fixedTimePeriodWindowMs(...)`
 * - Auto period  -> `rollingVwapAutoWindowMs(interval)`
 *
 * Pick the smallest table period whose duration is `>=` the effective window.
 * One documented duration set is used for every bucket; `1M` (and its multiples)
 * use the existing Pine/Auto value `MS_IN_DAY * 30.4375`, so Auto on `1d`
 * resolves to `1M` (30m chart minimum) instead of drifting into `3M`.
 */

import { isIndicatorSupportedOnInterval } from './indicators.ts'
import {
  MS_IN_DAY,
  resolveRollingVwapWindowMs,
  type RollingVwapFixedTimePeriod,
} from './rollingVwap.ts'
import type { CandleInterval } from './types.ts'
import { CANDLE_INTERVALS } from './types.ts'

export const ROLLING_VWAP_MONTH_MS = MS_IN_DAY * 30.4375

export const ROLLING_VWAP_PERIOD_BUCKETS = [
  { period: '1D', durationMs: MS_IN_DAY, minimumInterval: '1m' },
  { period: '1W', durationMs: MS_IN_DAY * 7, minimumInterval: '5m' },
  { period: '2W', durationMs: MS_IN_DAY * 14, minimumInterval: '15m' },
  { period: '1M', durationMs: ROLLING_VWAP_MONTH_MS, minimumInterval: '30m' },
  { period: '3M', durationMs: ROLLING_VWAP_MONTH_MS * 3, minimumInterval: '1h' },
  { period: '6M', durationMs: ROLLING_VWAP_MONTH_MS * 6, minimumInterval: '2h' },
  { period: '1Y', durationMs: MS_IN_DAY * 365, minimumInterval: '4h' },
] as const

export type RollingVwapPeriodLabel = (typeof ROLLING_VWAP_PERIOD_BUCKETS)[number]['period']

export type RollingVwapPeriodBucket = (typeof ROLLING_VWAP_PERIOD_BUCKETS)[number]

export type RollingVwapUnsupportedReason = 'interval-not-supported' | 'window-too-long' | 'interval-too-small'

export type RollingVwapTimeframeCompatibility =
  | {
      supported: true
      windowMs: number
      bucket: RollingVwapPeriodBucket
      minimumInterval: CandleInterval
    }
  | {
      supported: false
      reason: RollingVwapUnsupportedReason
      windowMs: number
      bucket: RollingVwapPeriodBucket | null
      minimumInterval: CandleInterval | null
    }

function intervalIndex(interval: CandleInterval): number {
  return CANDLE_INTERVALS.indexOf(interval)
}

/** Smallest table bucket whose duration covers `windowMs`, or null when the window is longer than `1Y`. */
export function rollingVwapPeriodBucketForWindowMs(windowMs: number): RollingVwapPeriodBucket | null {
  for (const bucket of ROLLING_VWAP_PERIOD_BUCKETS) {
    if (bucket.durationMs >= windowMs) return bucket
  }
  return null
}

export function rollingVwapSettingsTimeframeCompatibility(
  settings: Pick<RollingVwapFixedTimePeriod, 'useFixedTimePeriod' | 'days' | 'hours' | 'minutes'>,
  interval: CandleInterval,
): RollingVwapTimeframeCompatibility {
  const windowMs = resolveRollingVwapWindowMs(interval, settings)
  if (!isIndicatorSupportedOnInterval('rolling-vwap', interval)) {
    return {
      supported: false,
      reason: 'interval-not-supported',
      windowMs,
      bucket: null,
      minimumInterval: null,
    }
  }

  const bucket = rollingVwapPeriodBucketForWindowMs(windowMs)
  if (bucket === null) {
    return {
      supported: false,
      reason: 'window-too-long',
      windowMs,
      bucket: null,
      minimumInterval: null,
    }
  }

  if (intervalIndex(interval) < intervalIndex(bucket.minimumInterval)) {
    return {
      supported: false,
      reason: 'interval-too-small',
      windowMs,
      bucket,
      minimumInterval: bucket.minimumInterval,
    }
  }

  return {
    supported: true,
    windowMs,
    bucket,
    minimumInterval: bucket.minimumInterval,
  }
}

export function rollingVwapSettingsSupportedOnInterval(
  settings: Pick<RollingVwapFixedTimePeriod, 'useFixedTimePeriod' | 'days' | 'hours' | 'minutes'>,
  interval: CandleInterval,
): boolean {
  return rollingVwapSettingsTimeframeCompatibility(settings, interval).supported
}

/** Short menu/status reason for an unsupported configuration. */
export function rollingVwapTimeframeCompatibilityReason(
  compatibility: RollingVwapTimeframeCompatibility,
): string | null {
  if (compatibility.supported) return null
  switch (compatibility.reason) {
    case 'interval-not-supported':
      return 'not available on this chart interval'
    case 'window-too-long':
      return 'window longer than 1Y'
    case 'interval-too-small':
      return `needs ${compatibility.minimumInterval ?? 'a larger'} chart timeframe`
    default: {
      const unreachable: never = compatibility.reason
      return unreachable
    }
  }
}
