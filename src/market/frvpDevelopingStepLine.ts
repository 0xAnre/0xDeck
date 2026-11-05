/**
 * Step (staircase) geometry for the developing value area / POC series.
 *
 * A developing level holds until it changes: the sample at bar `i` applies from
 * that bar's x to the next bar's x, so a run is drawn as
 * `(x0, y0) → (x1, y0) → (x1, y1) → (x2, y1) → …` and the final value extends to
 * the right edge of the FRVP range. That makes the last step end on the
 * full-range level: at the range end the developing series and the flat
 * full-range line share the same y.
 *
 * Pure helpers only — no canvas, no chart API. The render path supplies the
 * coordinate mappers; `visibleTimeRange` bounds the walk to the bars the user
 * can actually see so a long range never maps every sample per frame.
 */
import type { FixedRangeVolumeProfileDevelopingSample } from './fixedRangeVolumeProfile.ts'

export const FRVP_DEVELOPING_LEVELS = ['poc', 'vah', 'val'] as const

export type FrvpDevelopingLevel = (typeof FRVP_DEVELOPING_LEVELS)[number]

export type FrvpDevelopingStepPoint = { x: number; y: number }

/** One contiguous staircase (a run is split when a level is unavailable). */
export type FrvpDevelopingStepRun = { points: FrvpDevelopingStepPoint[] }

export type FrvpDevelopingVisibleTimeRange = { fromTime: number; toTime: number }

/** Last index whose time is `<= time`, or `0` when every time is later. */
function lastIndexAtOrBefore(
  samples: readonly { time: number }[],
  time: number,
): number {
  let low = 0
  let high = samples.length - 1
  let result = 0
  while (low <= high) {
    const mid = (low + high) >> 1
    if (samples[mid].time <= time) {
      result = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return result
}

/** First index whose time is `>= time`, or the last index when every time is earlier. */
function firstIndexAtOrAfter(
  samples: readonly { time: number }[],
  time: number,
): number {
  let low = 0
  let high = samples.length - 1
  let result = high
  while (low <= high) {
    const mid = (low + high) >> 1
    if (samples[mid].time >= time) {
      result = mid
      high = mid - 1
    } else {
      low = mid + 1
    }
  }
  return result
}

/**
 * Inclusive sample window that covers the visible time range. The window always
 * keeps the sample whose step spans the left edge and the sample whose step
 * spans the right edge, so the sliced geometry equals the full geometry inside
 * the viewport. `null`/absent range returns every sample.
 */
export function resolveFrvpDevelopingSampleWindow(
  samples: readonly { time: number }[],
  visibleTimeRange: FrvpDevelopingVisibleTimeRange | null | undefined,
): { startIndex: number; endIndex: number } {
  const lastIndex = samples.length - 1
  if (lastIndex < 0) return { startIndex: 0, endIndex: -1 }
  if (!visibleTimeRange) return { startIndex: 0, endIndex: lastIndex }
  const fromTime = Math.min(visibleTimeRange.fromTime, visibleTimeRange.toTime)
  const toTime = Math.max(visibleTimeRange.fromTime, visibleTimeRange.toTime)
  if (!Number.isFinite(fromTime) || !Number.isFinite(toTime)) {
    return { startIndex: 0, endIndex: lastIndex }
  }
  return {
    startIndex: lastIndexAtOrBefore(samples, fromTime),
    endIndex: firstIndexAtOrAfter(samples, toTime),
  }
}

function isFinitePoint(x: number | null, y: number | null): boolean {
  return x !== null && y !== null && Number.isFinite(x) && Number.isFinite(y)
}

/**
 * Staircase runs for one level (see module docs).
 *
 * `rangeStartX`/`rangeEndX` are the FRVP range bounds: the first sample applies
 * from the range's left edge and the last sample applies up to its right edge
 * (which is the Extend Right effective boundary when that option is on), so the
 * developing series covers exactly the profile's span.
 */
export function buildFrvpDevelopingStepRuns(params: {
  samples: readonly FixedRangeVolumeProfileDevelopingSample[]
  level: FrvpDevelopingLevel
  rangeStartX: number
  rangeEndX: number
  timeToX: (time: number) => number | null
  priceToY: (price: number) => number | null
  visibleTimeRange?: FrvpDevelopingVisibleTimeRange | null
}): FrvpDevelopingStepRun[] {
  const { samples, level, rangeStartX, rangeEndX } = params
  if (samples.length === 0) return []
  if (!Number.isFinite(rangeStartX) || !Number.isFinite(rangeEndX)) return []

  const { startIndex, endIndex } = resolveFrvpDevelopingSampleWindow(
    samples,
    params.visibleTimeRange,
  )
  if (endIndex < startIndex) return []

  const xForTime = (time: number): number | null => {
    const x = params.timeToX(time)
    return x !== null && Number.isFinite(x) ? x : null
  }

  const runs: FrvpDevelopingStepRun[] = []
  let run: FrvpDevelopingStepRun | null = null
  let runValueY: number | null = null
  /** Whether the run's last point already marks a segment end (vs. its start). */
  let runHasPlateauEnd = false

  const closeRun = () => {
    if (run && run.points.length > 0) runs.push(run)
    run = null
    runValueY = null
    runHasPlateauEnd = false
  }

  for (let index = startIndex; index <= endIndex; index += 1) {
    const sample = samples[index]
    const value = level === 'poc' ? sample.pocPrice : level === 'vah' ? sample.vah : sample.val
    const y = value === null ? null : params.priceToY(value)
    // Segment i runs from x(i) to x(i + 1); the first segment starts at the
    // range edge and the last one ends there, so the step series covers the
    // whole profile span.
    const xStart = index === 0 ? rangeStartX : xForTime(sample.time)
    const nextSample = samples[index + 1]
    const xEnd =
      nextSample === undefined ? rangeEndX : xForTime(nextSample.time)

    if (!isFinitePoint(xStart, y) || xEnd === null) {
      closeRun()
      continue
    }

    const startX = xStart as number
    const valueY = y as number
    const endX = xEnd

    if (run === null) {
      run = { points: [{ x: startX, y: valueY }] }
      runValueY = valueY
      runHasPlateauEnd = false
    } else if (runValueY !== valueY) {
      // Hold the previous level up to the transition, then rise/fall to the new one.
      const lastPoint = run.points[run.points.length - 1]
      if (lastPoint.x !== startX) {
        run.points.push({ x: startX, y: runValueY as number })
      }
      run.points.push({ x: startX, y: valueY })
      runValueY = valueY
      runHasPlateauEnd = false
    }
    // Extend the current level's plateau to this segment's end. Consecutive
    // segments with an unchanged level collapse into one horizontal point run.
    if (!runHasPlateauEnd) {
      if (endX !== startX) run.points.push({ x: endX, y: runValueY as number })
      runHasPlateauEnd = true
    } else {
      const lastPoint = run.points[run.points.length - 1]
      if (lastPoint.x !== endX) lastPoint.x = endX
    }
  }

  closeRun()
  return runs
}
