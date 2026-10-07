import type { UTCTimestamp } from 'lightweight-charts'

export type SessionVwapBandPoint = {
  time: number
  upper1: number | null
  lower1: number | null
}

export type SessionVwapBandDrawModel = {
  /** Bitmap-space polygon vertices (x, y pairs). */
  polygon: number[]
  fillStyle: string
}

export type BuildSessionVwapBandDrawModelsParams = {
  points: readonly SessionVwapBandPoint[]
  barSpacing: number
  fillStyle: string
  timeToCoordinate: (time: UTCTimestamp) => number | null
  priceToY: (price: number) => number | null
}

function isFiniteBandValue(value: number | null): value is number {
  return value !== null && Number.isFinite(value)
}

function appendQuad(
  polygon: number[],
  x1: number,
  yUpper1: number,
  yLower1: number,
  x2: number,
  yUpper2: number,
  yLower2: number,
): void {
  polygon.push(x1, yUpper1, x2, yUpper2, x2, yLower2, x1, yLower1)
}

function appendSingleBarQuad(
  polygon: number[],
  xCenter: number,
  barSpacing: number,
  yUpper: number,
  yLower: number,
): void {
  const half = barSpacing / 2
  appendQuad(polygon, xCenter - half, yUpper, yLower, xCenter + half, yUpper, yLower)
}

export function buildSessionVwapBandDrawModels(
  params: BuildSessionVwapBandDrawModelsParams,
): SessionVwapBandDrawModel[] {
  const { points, barSpacing, fillStyle, timeToCoordinate, priceToY } = params
  if (points.length === 0) return []

  const polygon: number[] = []
  let runStart = -1

  const flushRun = (runEnd: number) => {
    if (runStart < 0) return
    const runLength = runEnd - runStart + 1
    if (runLength === 1) {
      const point = points[runStart]
      if (!isFiniteBandValue(point.upper1) || !isFiniteBandValue(point.lower1)) {
        runStart = -1
        return
      }
      const x = timeToCoordinate(point.time as UTCTimestamp)
      const yUpper = priceToY(point.upper1)
      const yLower = priceToY(point.lower1)
      if (x === null || yUpper === null || yLower === null) {
        runStart = -1
        return
      }
      appendSingleBarQuad(polygon, x, barSpacing, yUpper, yLower)
      runStart = -1
      return
    }

    for (let index = runStart; index < runEnd; index += 1) {
      const left = points[index]
      const right = points[index + 1]
      if (
        !isFiniteBandValue(left.upper1) ||
        !isFiniteBandValue(left.lower1) ||
        !isFiniteBandValue(right.upper1) ||
        !isFiniteBandValue(right.lower1)
      ) {
        continue
      }
      const x1 = timeToCoordinate(left.time as UTCTimestamp)
      const x2 = timeToCoordinate(right.time as UTCTimestamp)
      const yUpper1 = priceToY(left.upper1)
      const yLower1 = priceToY(left.lower1)
      const yUpper2 = priceToY(right.upper1)
      const yLower2 = priceToY(right.lower1)
      if (
        x1 === null ||
        x2 === null ||
        yUpper1 === null ||
        yLower1 === null ||
        yUpper2 === null ||
        yLower2 === null
      ) {
        continue
      }
      appendQuad(polygon, x1, yUpper1, yLower1, x2, yUpper2, yLower2)
    }
    runStart = -1
  }

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]
    const valid =
      isFiniteBandValue(point.upper1) && isFiniteBandValue(point.lower1)
    if (valid) {
      if (runStart < 0) runStart = index
      continue
    }
    if (runStart >= 0) {
      flushRun(index - 1)
    }
  }
  if (runStart >= 0) {
    flushRun(points.length - 1)
  }

  if (polygon.length === 0) return []
  return [{ polygon, fillStyle }]
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
