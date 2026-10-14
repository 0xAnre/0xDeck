import type { AnchoredVwapDrawingPoint } from './anchoredVwapDrawing.ts'
import { computeAnchoredVwapDrawingPointsForInstance } from './anchoredVwapDrawingChartSeries.ts'
import type { AnchoredVwapInstance } from './anchoredVwapInstances.ts'
import type { MarketCandle } from './types.ts'

type CacheEntry = {
  key: string
  points: AnchoredVwapDrawingPoint[]
}

const pointsCache = new Map<string, CacheEntry>()

function cacheKey(candles: readonly MarketCandle[], instance: AnchoredVwapInstance): string {
  const first = candles[0]
  const last = candles[candles.length - 1]
  const { settings } = instance
  return [
    instance.anchorTime,
    settings.calculationMode,
    settings.band1.multiplier,
    settings.band2.multiplier,
    settings.band3.multiplier,
    candles.length,
    first?.time ?? '',
    first?.close ?? '',
    last?.time ?? '',
    last?.close ?? '',
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
