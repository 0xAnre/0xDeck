import {
  anchoredVwapCalculationInputsCacheKey,
  anchoredVwapPointForCandle,
  anchoredVwapTotalsThroughSlicePrefix,
  EMPTY_ANCHORED_VWAP_ACCUMULATION_TOTALS,
  sliceAnchoredVwapCandlesFromAnchor,
  type AnchoredVwapAccumulationTotals,
  type AnchoredVwapDrawingPoint,
} from './anchoredVwapDrawing.ts'
import { computeAnchoredVwapDrawingPointsForInstance } from './anchoredVwapDrawingChartSeries.ts'
import { anchoredVwapDrawingMultipliersFromSettings } from './anchoredVwapDrawingSettings.ts'
import type { AnchoredVwapInstance } from './anchoredVwapInstances.ts'
import type { MarketCandle } from './types.ts'

type CacheEntry = {
  key: string
  candleCount: number
  firstCandleSignature: string
  lastCandleSignature: string
  sliceLength: number
  points: AnchoredVwapDrawingPoint[]
  totalsBeforeLast: AnchoredVwapAccumulationTotals
  totalsAfterLast: AnchoredVwapAccumulationTotals
}

const pointsCache = new Map<string, CacheEntry>()

function candleSignature(candle: MarketCandle | undefined): string {
  if (!candle) return ''
  return [
    candle.time,
    candle.open,
    candle.high,
    candle.low,
    candle.close,
    candle.volume,
  ].join('|')
}

function cacheKey(candles: readonly MarketCandle[], instance: AnchoredVwapInstance): string {
  const { settings } = instance
  return [
    instance.anchorTime,
    settings.calculationMode,
    settings.band1.multiplier,
    settings.band2.multiplier,
    settings.band3.multiplier,
    anchoredVwapCalculationInputsCacheKey(candles, instance.anchorTime),
  ].join('|')
}

function buildCacheEntry(
  candles: readonly MarketCandle[],
  instance: AnchoredVwapInstance,
  points: AnchoredVwapDrawingPoint[],
): CacheEntry {
  const slice = sliceAnchoredVwapCandlesFromAnchor(candles, instance.anchorTime)
  const totalsBeforeLast =
    slice.length > 1
      ? anchoredVwapTotalsThroughSlicePrefix(slice, slice.length - 1)
      : EMPTY_ANCHORED_VWAP_ACCUMULATION_TOTALS
  const totalsAfterLast = anchoredVwapTotalsThroughSlicePrefix(slice, slice.length)
  const first = candles[0]
  const last = candles[candles.length - 1]
  return {
    key: cacheKey(candles, instance),
    candleCount: candles.length,
    firstCandleSignature: candleSignature(first),
    lastCandleSignature: candleSignature(last),
    sliceLength: slice.length,
    points,
    totalsBeforeLast,
    totalsAfterLast,
  }
}

function tryIncrementalUpdate(
  existing: CacheEntry,
  candles: readonly MarketCandle[],
  instance: AnchoredVwapInstance,
): AnchoredVwapDrawingPoint[] | null {
  const first = candles[0]
  const last = candles[candles.length - 1]
  const firstSignature = candleSignature(first)
  const lastSignature = candleSignature(last)
  if (existing.firstCandleSignature !== firstSignature) return null

  const slice = sliceAnchoredVwapCandlesFromAnchor(candles, instance.anchorTime)
  if (slice.length === 0) return null

  const multipliers = anchoredVwapDrawingMultipliersFromSettings(instance.settings)

  if (
    existing.candleCount === candles.length &&
    existing.sliceLength === slice.length &&
    existing.lastCandleSignature !== lastSignature
  ) {
    const lastCandle = slice[slice.length - 1]
    const { point } = anchoredVwapPointForCandle(
      existing.totalsBeforeLast,
      lastCandle,
      multipliers,
    )
    const points =
      existing.points.length > 0
        ? [...existing.points.slice(0, -1), point]
        : [point]
    return points
  }

  if (
    existing.candleCount + 1 === candles.length &&
    existing.sliceLength + 1 === slice.length &&
    existing.lastCandleSignature === candleSignature(candles[candles.length - 2])
  ) {
    const lastCandle = slice[slice.length - 1]
    const { point } = anchoredVwapPointForCandle(
      existing.totalsAfterLast,
      lastCandle,
      multipliers,
    )
    return [...existing.points, point]
  }

  return null
}

/** Reuses per-instance VWAP point arrays until candles or instance inputs change. */
export function getCachedAnchoredVwapDrawingPointsForInstance(
  candles: readonly MarketCandle[],
  instance: AnchoredVwapInstance,
): readonly AnchoredVwapDrawingPoint[] {
  const key = cacheKey(candles, instance)
  const existing = pointsCache.get(instance.id)
  if (existing?.key === key) {
    return existing.points
  }

  if (existing) {
    const incremental = tryIncrementalUpdate(existing, candles, instance)
    if (incremental) {
      const entry = buildCacheEntry(candles, instance, incremental)
      pointsCache.set(instance.id, entry)
      return entry.points
    }
  }

  const points = computeAnchoredVwapDrawingPointsForInstance(candles, instance)
  pointsCache.set(instance.id, buildCacheEntry(candles, instance, points))
  return points
}

/** Drops cached point arrays for one instance (e.g. after delete or chart teardown). */
export function evictCachedAnchoredVwapDrawingPointsForInstance(instanceId: string): void {
  pointsCache.delete(instanceId)
}

/** Removes cache entries whose instance ids are not in `activeInstanceIds`. */
export function syncAnchoredVwapDrawingPointsCache(activeInstanceIds: ReadonlySet<string>): void {
  for (const id of pointsCache.keys()) {
    if (!activeInstanceIds.has(id)) {
      pointsCache.delete(id)
    }
  }
}

/** Test-only visibility into whether an instance id still has a cache entry. */
export function hasCachedAnchoredVwapDrawingPointsForInstance(instanceId: string): boolean {
  return pointsCache.has(instanceId)
}
