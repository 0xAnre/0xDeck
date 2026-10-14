import type { AnchoredVwapDrawingPoint } from './anchoredVwapDrawing.ts'
import { anchoredVwapCalculationInputsCacheKey } from './anchoredVwapDrawing.ts'
import { computeAnchoredVwapDrawingPointsForInstance } from './anchoredVwapDrawingChartSeries.ts'
import type { AnchoredVwapInstance } from './anchoredVwapInstances.ts'
import type { MarketCandle } from './types.ts'

type CacheEntry = {
  key: string
  points: AnchoredVwapDrawingPoint[]
}

const pointsCache = new Map<string, CacheEntry>()

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
  const points = computeAnchoredVwapDrawingPointsForInstance(candles, instance)
  pointsCache.set(instance.id, { key, points })
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
