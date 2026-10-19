import type { UTCTimestamp } from 'lightweight-charts'

export type AnchoredVwapBandFillPoint = {
  time: number
  upper: number | null
  lower: number | null
}

export type AnchoredVwapBandFillPairGeometry = {
  points: readonly AnchoredVwapBandFillPoint[]
  fillStyle: string
}

export type AnchoredVwapBandFillDrawModel = {
  /** Bitmap-space polygon vertices (x, y pairs) for one simple contour. */
  polygon: number[]
  fillStyle: string
}

export type AnchoredVwapBandFillPriceRange = {
  minValue: number
  maxValue: number
}

export type BuildAnchoredVwapBandFillDrawModelsParams = {
  pairs: readonly AnchoredVwapBandFillPairGeometry[]
  barSpacing: number
  timeToCoordinate: (time: UTCTimestamp) => number | null
  priceToY: (price: number) => number | null
}

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
 * Splits each pair's points into contiguous runs of fully plottable samples and
 * returns one simple contour per run. A run breaks whenever an upper or lower
 * value is `null`/non-finite or a coordinate cannot be resolved, so there is no
 * fill across missing data. Points before the anchor are simply absent from the
 * anchor-sliced point arrays, so no polygon can appear before the anchor.
 */
export function buildAnchoredVwapBandFillDrawModels(
  params: BuildAnchoredVwapBandFillDrawModelsParams,
): AnchoredVwapBandFillDrawModel[] {
  const { pairs, barSpacing, timeToCoordinate, priceToY } = params
  const models: AnchoredVwapBandFillDrawModel[] = []

  for (const pair of pairs) {
    if (pair.points.length === 0) continue
    let run: PlottedBandPoint[] = []

    const flushRun = () => {
      if (run.length === 0) return
      models.push({ polygon: contourForRun(run, barSpacing), fillStyle: pair.fillStyle })
      run = []
    }

    for (const point of pair.points) {
      const plotted = plotBandPoint(point, timeToCoordinate, priceToY)
      if (!plotted) {
        flushRun()
        continue
      }
      run.push(plotted)
    }
    flushRun()
  }

  return models
}

function firstIndexAtOrAfter(points: readonly AnchoredVwapBandFillPoint[], time: number): number {
  let low = 0
  let high = points.length
  while (low < high) {
    const mid = (low + high) >> 1
    if (points[mid].time < time) low = mid + 1
    else high = mid
  }
  return low
}

function firstIndexAfter(points: readonly AnchoredVwapBandFillPoint[], time: number): number {
  let low = 0
  let high = points.length
  while (low < high) {
    const mid = (low + high) >> 1
    if (points[mid].time <= time) low = mid + 1
    else high = mid
  }
  return low
}

/**
 * Min/max of every fillable sample across the given pairs inside
 * `[fromTime, toTime]`. Points must be chronological, matching the line series
 * order. Samples missing either bound are omitted because they are not filled.
 */
export function anchoredVwapBandFillPriceRange(
  pairs: readonly AnchoredVwapBandFillPairGeometry[],
  fromTime: number,
  toTime: number,
): AnchoredVwapBandFillPriceRange | null {
  if (!Number.isFinite(fromTime) || !Number.isFinite(toTime) || fromTime > toTime) {
    return null
  }

  let minValue = Infinity
  let maxValue = -Infinity
  for (const pair of pairs) {
    const points = pair.points
    if (points.length === 0) continue
    const start = firstIndexAtOrAfter(points, fromTime)
    const end = firstIndexAfter(points, toTime)
    for (let index = start; index < end; index += 1) {
      const point = points[index]
      if (!isFiniteBandValue(point.upper) || !isFiniteBandValue(point.lower)) continue
      minValue = Math.min(minValue, point.upper, point.lower)
      maxValue = Math.max(maxValue, point.upper, point.lower)
    }
  }
  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) return null
  return { minValue, maxValue }
}
