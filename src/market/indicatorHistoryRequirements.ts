/**
 * Pure indicator history requirements for the BTC Perpetual chart.
 *
 * Maps the indicators/instances active on one panel to the history they need:
 * - required warmup bar count, and/or
 * - required earliest candle timestamp (seconds).
 *
 * The shared loader consumes the merged plan (max bars, min timestamp) so one
 * preload satisfies every active indicator instead of one request per indicator.
 */

import type { AnchoredVwapInstance } from './anchoredVwapInstances.ts'
import { candleIntervalDurationSeconds } from './candleIntervalDuration.ts'
import { EMA_100_PERIOD, EMA_200_PERIOD, EMA_PERIODS } from './ema.ts'
import {
  isIndicatorSupportedOnInterval,
  MARKET_INDICATOR_DEFINITIONS,
  type MarketIndicatorId,
  type VwapContextLevel,
} from './indicators.ts'
import {
  rollingVwapSettingsTimeframeCompatibility,
  type RollingVwapTimeframeCompatibility,
} from './rollingVwapMinimumTimeframe.ts'
import type { RollingVwapInstance } from './rollingVwapInstances.ts'
import type { CandleInterval, MarketCandle } from './types.ts'

/** EMA warmup target: 5x period for the short EMAs (13/21/35 -> 65/105/175). */
export const EMA_WARMUP_BAR_MULTIPLIER = 5

export const TRIPLE_EMA_WARMUP_BARS = Math.max(...EMA_PERIODS) * EMA_WARMUP_BAR_MULTIPLIER
export const DUAL_EMA_WARMUP_BARS = EMA_200_PERIOD * EMA_WARMUP_BAR_MULTIPLIER

export type IndicatorHistoryRequirementKind = 'ema' | 'anchored-vwap' | 'rolling-vwap' | 'time-vwap'

export type IndicatorHistoryRequirement = {
  /** Stable key: indicator id or chart-object instance id. */
  source: string
  kind: IndicatorHistoryRequirementKind
  label: string
  /** Target bars for a complete warmup. */
  warmupBars: number
  /** Bars below this mean the indicator cannot compute at all. */
  minimumBarsToCompute: number
  /** Oldest candle time (seconds) required; null when only bars matter. */
  earliestTime: number | null
}

export type IndicatorHistoryPlan = {
  warmupBars: number
  earliestTime: number | null
  requirements: IndicatorHistoryRequirement[]
}

export type ResolveIndicatorHistoryPlanParams = {
  interval: CandleInterval
  indicators: readonly MarketIndicatorId[]
  rollingVwapInstances?: readonly RollingVwapInstance[]
  anchoredVwapInstances?: readonly AnchoredVwapInstance[]
  /** Injected for deterministic tests; defaults to wall clock. */
  nowSeconds?: number
}

const SECONDS_PER_UTC_DAY = 86_400

/** Current UTC calendar period start (seconds) for a Time-Based VWAP level. */
export function vwapCalendarPeriodStartSeconds(
  level: VwapContextLevel,
  nowSeconds: number,
): number {
  const date = new Date(nowSeconds * 1000)
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const day = date.getUTCDate()

  switch (level) {
    case 'daily':
      return Math.floor(nowSeconds / SECONDS_PER_UTC_DAY) * SECONDS_PER_UTC_DAY
    case 'weekly': {
      const dow = date.getUTCDay()
      const daysFromMonday = dow === 0 ? 6 : dow - 1
      return Math.floor(Date.UTC(year, month, day - daysFromMonday) / 1000)
    }
    case 'monthly':
      return Math.floor(Date.UTC(year, month, 1) / 1000)
    case 'quarterly':
      return Math.floor(Date.UTC(year, Math.floor(month / 3) * 3, 1) / 1000)
    case 'yearly':
      return Math.floor(Date.UTC(year, 0, 1) / 1000)
    default: {
      const unreachable: never = level
      return unreachable
    }
  }
}

function emaRequirement(
  indicatorId: MarketIndicatorId,
  warmupBars: number,
  minimumBarsToCompute: number,
): IndicatorHistoryRequirement {
  return {
    source: indicatorId,
    kind: 'ema',
    label: MARKET_INDICATOR_DEFINITIONS[indicatorId].label,
    warmupBars,
    minimumBarsToCompute,
    earliestTime: null,
  }
}

function timeVwapRequirement(
  indicatorId: MarketIndicatorId,
  level: VwapContextLevel,
  nowSeconds: number,
): IndicatorHistoryRequirement {
  return {
    source: indicatorId,
    kind: 'time-vwap',
    label: MARKET_INDICATOR_DEFINITIONS[indicatorId].label,
    warmupBars: 1,
    minimumBarsToCompute: 1,
    earliestTime: vwapCalendarPeriodStartSeconds(level, nowSeconds),
  }
}

function anchoredVwapRequirement(instance: AnchoredVwapInstance): IndicatorHistoryRequirement {
  return {
    source: instance.id,
    kind: 'anchored-vwap',
    label: `Anchored VWAP ${instance.displaySequence}`,
    warmupBars: 2,
    minimumBarsToCompute: 2,
    earliestTime: instance.anchorTime,
  }
}

function rollingVwapRequirement(
  instance: RollingVwapInstance,
  interval: CandleInterval,
  compatibility: RollingVwapTimeframeCompatibility,
): IndicatorHistoryRequirement {
  const intervalMs = candleIntervalDurationSeconds(interval) * 1000
  const windowBars = Math.ceil(compatibility.windowMs / intervalMs)
  return {
    source: instance.id,
    kind: 'rolling-vwap',
    label: `Rolling VWAP ${instance.displaySequence}`,
    warmupBars: windowBars + Math.max(1, instance.settings.minBars),
    minimumBarsToCompute: 1,
    earliestTime: null,
  }
}

/** Per-indicator requirements for the panel; unsupported Rolling VWAP configs are skipped (they do not render). */
export function resolveIndicatorHistoryRequirements(
  params: ResolveIndicatorHistoryPlanParams,
): IndicatorHistoryRequirement[] {
  const {
    interval,
    indicators,
    rollingVwapInstances = [],
    anchoredVwapInstances = [],
    nowSeconds = Math.floor(Date.now() / 1000),
  } = params

  const requirements: IndicatorHistoryRequirement[] = []
  const seenIndicators = new Set<MarketIndicatorId>()

  for (const indicatorId of indicators) {
    if (seenIndicators.has(indicatorId)) continue
    seenIndicators.add(indicatorId)
    if (!isIndicatorSupportedOnInterval(indicatorId, interval)) continue

    switch (indicatorId) {
      case 'triple-ema':
        requirements.push(emaRequirement('triple-ema', TRIPLE_EMA_WARMUP_BARS, Math.max(...EMA_PERIODS)))
        break
      case 'dual-ema':
        requirements.push(
          emaRequirement(
            'dual-ema',
            DUAL_EMA_WARMUP_BARS,
            Math.max(EMA_100_PERIOD, EMA_200_PERIOD),
          ),
        )
        break
      case 'daily-vwap':
      case 'weekly-vwap':
      case 'monthly-vwap':
      case 'quarterly-vwap':
      case 'yearly-vwap': {
        const level = MARKET_INDICATOR_DEFINITIONS[indicatorId].contextLevel
        if (level) requirements.push(timeVwapRequirement(indicatorId, level, nowSeconds))
        break
      }
      case 'rolling-vwap':
        // Instance-level requirements are resolved below.
        break
      default: {
        const unreachable: never = indicatorId
        return unreachable
      }
    }
  }

  for (const instance of anchoredVwapInstances) {
    if (instance.hidden) continue
    requirements.push(anchoredVwapRequirement(instance))
  }

  for (const instance of rollingVwapInstances) {
    if (!instance.enabled) continue
    const compatibility = rollingVwapSettingsTimeframeCompatibility(
      instance.settings.fixedTimePeriod,
      interval,
    )
    if (!compatibility.supported) continue
    requirements.push(rollingVwapRequirement(instance, interval, compatibility))
  }

  return requirements
}

/**
 * Merge per-indicator requirements into one shared preload target.
 *
 * Time-Based VWAP is excluded from the target: its session window is already
 * fetched by the panel's VWAP-context request, so preloading it again would
 * duplicate the same `/klines` range. The requirement stays in the plan so the
 * panel can still report a meaningful status for the session VWAP.
 */
export function mergeIndicatorHistoryRequirements(
  requirements: readonly IndicatorHistoryRequirement[],
): IndicatorHistoryPlan {
  let warmupBars = 0
  let earliestTime: number | null = null
  for (const requirement of requirements) {
    if (requirement.kind === 'time-vwap') continue
    warmupBars = Math.max(warmupBars, requirement.warmupBars)
    if (requirement.earliestTime === null) continue
    earliestTime =
      earliestTime === null
        ? requirement.earliestTime
        : Math.min(earliestTime, requirement.earliestTime)
  }
  return { warmupBars, earliestTime, requirements: [...requirements] }
}

export function resolveIndicatorHistoryPlan(
  params: ResolveIndicatorHistoryPlanParams,
): IndicatorHistoryPlan {
  return mergeIndicatorHistoryRequirements(resolveIndicatorHistoryRequirements(params))
}

export type IndicatorHistoryStatus = 'ready' | 'partial-warmup' | 'cannot-compute'

export type IndicatorHistoryStatusEntry = {
  requirement: IndicatorHistoryRequirement
  status: IndicatorHistoryStatus
  availableBars: number
  oldestCandleTime: number | null
}

export function evaluateIndicatorHistoryRequirement(
  requirement: IndicatorHistoryRequirement,
  candles: readonly MarketCandle[],
): IndicatorHistoryStatusEntry {
  const availableBars = candles.length
  const oldestCandleTime = availableBars > 0 ? candles[0].time : null

  if (availableBars === 0) {
    return { requirement, status: 'cannot-compute', availableBars, oldestCandleTime }
  }

  const earliestUnmet =
    requirement.earliestTime !== null && oldestCandleTime !== null
      ? oldestCandleTime > requirement.earliestTime
      : false

  if (requirement.kind === 'anchored-vwap' && earliestUnmet) {
    return { requirement, status: 'cannot-compute', availableBars, oldestCandleTime }
  }

  if (availableBars < requirement.minimumBarsToCompute) {
    return { requirement, status: 'cannot-compute', availableBars, oldestCandleTime }
  }

  if (earliestUnmet || availableBars < requirement.warmupBars) {
    return { requirement, status: 'partial-warmup', availableBars, oldestCandleTime }
  }

  return { requirement, status: 'ready', availableBars, oldestCandleTime }
}

export function evaluateIndicatorHistoryPlan(
  plan: IndicatorHistoryPlan,
  candles: readonly MarketCandle[],
): IndicatorHistoryStatusEntry[] {
  return plan.requirements.map((requirement) =>
    evaluateIndicatorHistoryRequirement(requirement, candles),
  )
}

export const INDICATOR_HISTORY_LIMIT_NOTICE =
  'preload limit reached — switch to a larger timeframe'

export type DescribeIndicatorHistoryStatusOptions = {
  /**
   * True when the shared preload stopped at its page cap instead of exhausting
   * available history, so "older than available history" would be misleading.
   */
  preloadLimitReached?: boolean
}

export function describeIndicatorHistoryStatus(
  entry: IndicatorHistoryStatusEntry,
  options: DescribeIndicatorHistoryStatusOptions = {},
): string | null {
  if (entry.status === 'ready') return null
  const { requirement, availableBars, oldestCandleTime } = entry

  if (entry.status === 'partial-warmup' && requirement.kind === 'time-vwap') {
    // Bar counts are meaningless for session VWAP (warmupBars is 1); what
    // matters is whether the buffer reaches the current session open.
    return `${requirement.label}: history does not cover the current session yet`
  }

  if (entry.status === 'cannot-compute') {
    if (
      requirement.kind === 'anchored-vwap' &&
      requirement.earliestTime !== null &&
      oldestCandleTime !== null &&
      oldestCandleTime > requirement.earliestTime
    ) {
      return options.preloadLimitReached
        ? `${requirement.label}: ${INDICATOR_HISTORY_LIMIT_NOTICE}`
        : `${requirement.label}: anchor is older than available history`
    }
    return `${requirement.label}: not enough history (${availableBars}/${requirement.minimumBarsToCompute} bars to compute)`
  }

  return `${requirement.label}: partial warmup (${availableBars}/${requirement.warmupBars} bars)`
}
