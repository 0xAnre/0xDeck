import type { UTCTimestamp } from 'lightweight-charts'

/**
 * Pure geometry for the RSI threshold fill.
 *
 * The fill is drawn only while the RSI is outside a threshold, so each
 * contiguous run of out-of-threshold samples becomes its own polygon between
 * the RSI line and that threshold. Inside-threshold samples break the run, which
 * is what keeps one polygon from spanning a stretch that must stay empty.
 */

export type RsiThresholdFillPoint = {
  time: number
  value: number
}

export type RsiThresholdFillThresholds = {
  overbought: number
  oversold: number
}

export type RsiThresholdFillSide = 'overbought' | 'oversold'

export type RsiThresholdFillDrawModel = {
  /** Bitmap-space polygon vertices (x, y pairs) for one simple contour. */
  polygon: number[]
  fillStyle: string
}

export type BuildRsiThresholdFillDrawModelsParams = {
  points: readonly RsiThresholdFillPoint[]
  thresholds: RsiThresholdFillThresholds
  overboughtFillStyle: string
  oversoldFillStyle: string
  barSpacing: number
  timeToCoordinate: (time: UTCTimestamp) => number | null
  priceToY: (price: number) => number | null
}

type PlottedThresholdFillPoint = {
  x: number
  yValue: number
  yThreshold: number
}

function isFiniteNumber(value: number | null): value is number {
  return value !== null && Number.isFinite(value)
}

/**
 * Side of the threshold band a value is on, or `null` between the thresholds.
 * Strict comparisons mean a value exactly at a threshold counts as inside the
 * band, matching "outside the thresholds only" (and the RSI line color rule).
 */
export function rsiThresholdFillSide(
  value: number,
  thresholds: RsiThresholdFillThresholds,
): RsiThresholdFillSide | null {
  if (value > thresholds.overbought) return 'overbought'
  if (value < thresholds.oversold) return 'oversold'
  return null
}

/** Line edge left-to-right, then the threshold edge right-to-left. */
function contourForRun(
  run: readonly PlottedThresholdFillPoint[],
  halfBarSpacing: number,
): number[] {
  if (run.length === 1) {
    const point = run[0]
    return [
      point.x - halfBarSpacing,
      point.yValue,
      point.x + halfBarSpacing,
      point.yValue,
      point.x + halfBarSpacing,
      point.yThreshold,
      point.x - halfBarSpacing,
      point.yThreshold,
    ]
  }

  const polygon: number[] = []
  for (const point of run) {
    polygon.push(point.x, point.yValue)
  }
  for (let index = run.length - 1; index >= 0; index -= 1) {
    const point = run[index]
    polygon.push(point.x, point.yThreshold)
  }
  return polygon
}

/**
 * One polygon per contiguous run of samples outside a threshold. A run also
 * breaks when a coordinate cannot be resolved, so no polygon is drawn across
 * missing or off-screen data. Each polygon closes at the threshold (vertical
 * edge at the run boundary) instead of continuing through inside-threshold bars.
 */
export function buildRsiThresholdFillDrawModels(
  params: BuildRsiThresholdFillDrawModelsParams,
): RsiThresholdFillDrawModel[] {
  const {
    points,
    thresholds,
    overboughtFillStyle,
    oversoldFillStyle,
    barSpacing,
    timeToCoordinate,
    priceToY,
  } = params
  if (points.length === 0) return []

  const yOverbought = priceToY(thresholds.overbought)
  const yOversold = priceToY(thresholds.oversold)
  if (yOverbought === null && yOversold === null) return []

  const halfBarSpacing = Math.max(0, barSpacing) / 2
  const models: RsiThresholdFillDrawModel[] = []
  let run: PlottedThresholdFillPoint[] = []
  let runSide: RsiThresholdFillSide | null = null

  const flushRun = () => {
    if (runSide !== null && run.length > 0) {
      models.push({
        polygon: contourForRun(run, halfBarSpacing),
        fillStyle: runSide === 'overbought' ? overboughtFillStyle : oversoldFillStyle,
      })
    }
    run = []
    runSide = null
  }

  for (const point of points) {
    const side = rsiThresholdFillSide(point.value, thresholds)
    const yThreshold =
      side === 'overbought' ? yOverbought : side === 'oversold' ? yOversold : null
    const x = timeToCoordinate(point.time as UTCTimestamp)
    const yValue = priceToY(point.value)

    if (
      side === null ||
      !isFiniteNumber(yThreshold) ||
      !isFiniteNumber(x) ||
      !isFiniteNumber(yValue)
    ) {
      flushRun()
      continue
    }

    if (runSide !== null && runSide !== side) flushRun()
    runSide = side
    run.push({ x, yValue, yThreshold })
  }
  flushRun()
  return models
}
