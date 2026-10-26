import {
  LIQUIDATION_BAR_WIDTH_FRACTION,
} from './aggregatedLiquidationsColors.ts'
import type { AggregatedLiquidationBucket } from './aggregatedLiquidations.ts'

export type LiquidationBarRect = {
  x: number
  width: number
  top: number
  bottom: number
}

export type AggregatedLiquidationBarModel = {
  time: number
  long: LiquidationBarRect | null
  short: LiquidationBarRect | null
}

type BuildParams = {
  buckets: readonly AggregatedLiquidationBucket[]
  barSpacing: number
  timeToCoordinate: (time: number) => number | null
  valueToCoordinate: (value: number) => number | null
}

/**
 * Split one candle's bar slot into two side-by-side halves so a bucket that
 * contains both long and short liquidations renders both, never one on top of
 * the other.
 */
export function liquidationSideWidths(barSpacing: number): {
  totalWidth: number
  sideWidth: number
  gap: number
} {
  const safeSpacing = Number.isFinite(barSpacing) ? barSpacing : 0
  const totalWidth = Math.max(2, Math.min(safeSpacing * LIQUIDATION_BAR_WIDTH_FRACTION, 64))
  const gap = totalWidth >= 6 ? 1 : 0
  const sideWidth = Math.max(1, (totalWidth - gap) / 2)
  return { totalWidth, sideWidth, gap }
}

function verticalRect(
  x: number,
  width: number,
  baselineY: number,
  valueY: number,
): LiquidationBarRect | null {
  const top = Math.min(baselineY, valueY)
  const bottom = Math.max(baselineY, valueY)
  if (!Number.isFinite(top) || !Number.isFinite(bottom) || bottom - top <= 0) {
    return null
  }
  return { x, width, top, bottom }
}

export function buildAggregatedLiquidationBarModels({
  buckets,
  barSpacing,
  timeToCoordinate,
  valueToCoordinate,
}: BuildParams): AggregatedLiquidationBarModel[] {
  const baselineY = valueToCoordinate(0)
  if (baselineY === null) return []

  const { sideWidth, gap } = liquidationSideWidths(barSpacing)
  const models: AggregatedLiquidationBarModel[] = []

  for (const bucket of buckets) {
    const centerX = timeToCoordinate(bucket.time)
    if (centerX === null) continue

    const longX = centerX - gap / 2 - sideWidth
    const shortX = centerX + gap / 2
    const longY = bucket.long > 0 ? valueToCoordinate(bucket.long) : null
    const shortY = bucket.short > 0 ? valueToCoordinate(bucket.short) : null

    const long = longY === null ? null : verticalRect(longX, sideWidth, baselineY, longY)
    const short =
      shortY === null ? null : verticalRect(shortX, sideWidth, baselineY, shortY)
    if (long === null && short === null) continue

    models.push({ time: bucket.time, long, short })
  }

  return models
}
