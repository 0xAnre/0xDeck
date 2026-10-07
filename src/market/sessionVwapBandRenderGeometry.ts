import type { UTCTimestamp } from 'lightweight-charts'

export type SessionVwapBandPoint = {
  time: number
  upper1: number | null
  lower1: number | null
}

export type SessionVwapBandDrawModel = {
  /** Bitmap-space polygon vertices (x, y pairs) for one simple contour. */
  polygon: number[]
  fillStyle: string
}

export type SessionVwapBandPriceRange = {
  minValue: number
  maxValue: number
}

export type BuildSessionVwapBandDrawModelsParams = {
  points: readonly SessionVwapBandPoint[]
  barSpacing: number
  fillStyle: string
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
  point: SessionVwapBandPoint,
  timeToCoordinate: (time: UTCTimestamp) => number | null,
  priceToY: (price: number) => number | null,
): PlottedBandPoint | null {
  if (!isFiniteBandValue(point.upper1) || !isFiniteBandValue(point.lower1)) return null
  const x = timeToCoordinate(point.time as UTCTimestamp)
  const yUpper = priceToY(point.upper1)
  const yLower = priceToY(point.lower1)
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

export function buildSessionVwapBandDrawModels(
  params: BuildSessionVwapBandDrawModelsParams,
): SessionVwapBandDrawModel[] {
  const { points, barSpacing, fillStyle, timeToCoordinate, priceToY } = params
  if (points.length === 0) return []

  const models: SessionVwapBandDrawModel[] = []
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

function firstIndexAtOrAfter(points: readonly SessionVwapBandPoint[], time: number): number {
  let low = 0
  let high = points.length
  while (low < high) {
    const mid = (low + high) >> 1
    if (points[mid].time < time) low = mid + 1
    else high = mid
  }
  return low
}

function firstIndexAfter(points: readonly SessionVwapBandPoint[], time: number): number {
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
 * Min/max of current ±1σ samples inside [fromTime, toTime].
 * Points must be chronological, matching the line series order.
 * Samples missing either bound are omitted because they are not filled.
 */
export function sessionVwapBandPriceRange(
  points: readonly SessionVwapBandPoint[],
  fromTime: number,
  toTime: number,
): SessionVwapBandPriceRange | null {
  if (
    points.length === 0 ||
    !Number.isFinite(fromTime) ||
    !Number.isFinite(toTime) ||
    fromTime > toTime
  ) {
    return null
  }

  const start = firstIndexAtOrAfter(points, fromTime)
  const end = firstIndexAfter(points, toTime)
  let minValue = Infinity
  let maxValue = -Infinity
  for (let index = start; index < end; index += 1) {
    const point = points[index]
    if (!isFiniteBandValue(point.upper1) || !isFiniteBandValue(point.lower1)) continue
    minValue = Math.min(minValue, point.upper1, point.lower1)
    maxValue = Math.max(maxValue, point.upper1, point.lower1)
  }
  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) return null
  return { minValue, maxValue }
}

export function sessionVwapPointsToBandPoints<
  Point extends { time: number; upper1: number | null; lower1: number | null },
>(points: readonly Point[]): SessionVwapBandPoint[] {
  return points.map((point) => ({
    time: point.time,
    upper1: point.upper1,
    lower1: point.lower1,
  }))
}
