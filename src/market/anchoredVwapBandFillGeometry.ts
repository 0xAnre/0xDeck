import type { UTCTimestamp } from 'lightweight-charts'
import type { AnchoredVwapDrawingPoint } from './anchoredVwapDrawing.ts'

export type AnchoredVwapBandFillPoint = {
  time: number
  upper: number | null
  lower: number | null
}

export type AnchoredVwapBandFillDrawModel = {
  /** Bitmap-space polygon vertices (x, y pairs) for one simple contour. */
  polygon: number[]
  fillStyle: string
}

export type BuildAnchoredVwapBandFillDrawModelsParams = {
  points: readonly AnchoredVwapBandFillPoint[]
  barSpacing: number
  fillStyle: string
  timeToCoordinate: (time: UTCTimestamp) => number | null
  priceToY: (price: number) => number | null
}

export type AnchoredVwapBandFillUpperKey = 'upper1' | 'upper2' | 'upper3'

export type AnchoredVwapBandFillLowerKey = 'lower1' | 'lower2' | 'lower3'

type PlottedBandPoint = {
  x: number
  yUpper: number
  yLower: number
}

function isFiniteBandValue(value: number | null): value is number {
  return value !== null && Number.isFinite(value)
}

function plotBandPoint(
  point: AnchoredVwapBandFillPoint,
  timeToCoordinate: (time: UTCTimestamp) => number | null,
  priceToY: (price: number) => number | null,
): PlottedBandPoint | null {
  if (!isFiniteBandValue(point.upper) || !isFiniteBandValue(point.lower)) return null
  const x = timeToCoordinate(point.time as UTCTimestamp)
  const yUpper = priceToY(point.upper)
  const yLower = priceToY(point.lower)
  if (x === null || yUpper === null || yLower === null) return null
  return { x, yUpper, yLower }
}

/** Upper edge left-to-right, then lower edge right-to-left, so the path does not self-intersect. */
function contourForRun(run: readonly PlottedBandPoint[], barSpacing: number): number[] {
  if (run.length === 1) {
    const point = run[0]
    const half = barSpacing / 2
    return [
      point.x - half,
      point.yUpper,
      point.x + half,
      point.yUpper,
      point.x + half,
      point.yLower,
      point.x - half,
      point.yLower,
    ]
  }

  const polygon: number[] = []
  for (const point of run) {
    polygon.push(point.x, point.yUpper)
  }
  for (let index = run.length - 1; index >= 0; index -= 1) {
    const point = run[index]
    polygon.push(point.x, point.yLower)
  }
  return polygon
}

/**
 * Builds one bitmap-space polygon per contiguous run of fillable samples.
 * Null upper/lower values or unresolvable coordinates split the run; a
 * single-point run becomes a half-bar-spacing rectangle.
 */
export function buildAnchoredVwapBandFillDrawModels(
  params: BuildAnchoredVwapBandFillDrawModelsParams,
): AnchoredVwapBandFillDrawModel[] {
  const { points, barSpacing, fillStyle, timeToCoordinate, priceToY } = params
  if (points.length === 0) return []

  const models: AnchoredVwapBandFillDrawModel[] = []
  let run: PlottedBandPoint[] = []

  const flushRun = () => {
    if (run.length === 0) return
    models.push({ polygon: contourForRun(run, barSpacing), fillStyle })
    run = []
  }

  for (const point of points) {
    const plotted = plotBandPoint(point, timeToCoordinate, priceToY)
    if (!plotted) {
      flushRun()
      continue
    }
    run.push(plotted)
  }
  flushRun()
  return models
}

export function anchoredVwapDrawingPointsToBandFillPoints(
  points: readonly AnchoredVwapDrawingPoint[],
  upperKey: AnchoredVwapBandFillUpperKey,
  lowerKey: AnchoredVwapBandFillLowerKey,
): AnchoredVwapBandFillPoint[] {
  return points.map((point) => ({
    time: point.time,
    upper: point[upperKey],
    lower: point[lowerKey],
  }))
}
