import { marketStyleColorWithOpacity } from './marketStylePalette.ts'
import type { RollingVwapPoint } from './rollingVwap.ts'
import {
  resolveRollingVwapBandFillStyle,
  type RollingVwapBandColors,
  type RollingVwapBandLineStyles,
  type RollingVwapBandLineWidths,
  type RollingVwapBandOpacities,
  type RollingVwapLineStyle,
  type RollingVwapLineWidth,
} from './rollingVwapSettings.ts'

/**
 * Rendering model for one Rolling VWAP instance's six deviation-band outlines
 * and three band fills (#262).
 *
 * One series primitive draws the six outlines and the three fills that used to
 * be six native `LineSeries` plus three fill primitives:
 *
 * - visible window plus one chronological neighbour on each side, located by
 *   binary search (never a full-history scan);
 * - per-band colors, opacities, widths and `solid` / `dotted` styles;
 * - null points break a run instead of being bridged;
 * - fills between each band pair's upper/lower bounds;
 * - a per-band selection halo;
 * - autoscale contributions in the same space the price scale expects.
 *
 * No coordinates are cached between frames: the caller rebuilds models from the
 * current time/price transforms for every library update pass.
 */

export const ROLLING_VWAP_BAND_PAIR_KEYS = ['band1', 'band2', 'band3'] as const

export type RollingVwapBandPairKey = (typeof ROLLING_VWAP_BAND_PAIR_KEYS)[number]

export const ROLLING_VWAP_BAND_VALUE_KEYS = [
  'upper1',
  'lower1',
  'upper2',
  'lower2',
  'upper3',
  'lower3',
] as const

export type RollingVwapBandValueKey = (typeof ROLLING_VWAP_BAND_VALUE_KEYS)[number]

/**
 * A selected part of a Rolling VWAP instance. `all` is the pre-#262
 * whole-instance selection; chart hit testing resolves concrete band parts so
 * the halo strokes only the selected band pair.
 */
export type RollingVwapBandPart = 'center' | 'all' | RollingVwapBandPairKey

export const ROLLING_VWAP_BAND_PAIR_VALUE_KEYS: Record<
  RollingVwapBandPairKey,
  { upper: RollingVwapBandValueKey; lower: RollingVwapBandValueKey }
> = {
  band1: { upper: 'upper1', lower: 'lower1' },
  band2: { upper: 'upper2', lower: 'lower2' },
  band3: { upper: 'upper3', lower: 'lower3' },
}

export const ROLLING_VWAP_BAND_VALUE_KEY_PAIR: Record<
  RollingVwapBandValueKey,
  RollingVwapBandPairKey
> = {
  upper1: 'band1',
  lower1: 'band1',
  upper2: 'band2',
  lower2: 'band2',
  upper3: 'band3',
  lower3: 'band3',
}

/** Input style records, matching the persisted Rolling VWAP instance settings. */
export type RollingVwapBandStyle = {
  bandColors: RollingVwapBandColors
  bandOpacities: RollingVwapBandOpacities
  bandLineStyles: RollingVwapBandLineStyles
  bandLineWidths: RollingVwapBandLineWidths
  fillColor: string
  fillOpacity: number
}

/** Resolved style for one outline: color already carries its own opacity. */
export type RollingVwapBandOutlineStyle = {
  color: string
  widthPx: RollingVwapLineWidth
  lineStyle: RollingVwapLineStyle
}

export type RollingVwapBandPrimitiveStyle = {
  outlines: Record<RollingVwapBandValueKey, RollingVwapBandOutlineStyle>
  /** One shared band-pair fill color for bands 1–3, resolved with its opacity. */
  fillStyle: string
}

export function resolveRollingVwapBandOutlineStyle(
  bandStyle: RollingVwapBandStyle,
  key: RollingVwapBandValueKey,
): RollingVwapBandOutlineStyle {
  const pair = ROLLING_VWAP_BAND_VALUE_KEY_PAIR[key]
  return {
    color: marketStyleColorWithOpacity(
      bandStyle.bandColors[pair],
      bandStyle.bandOpacities[pair],
    ),
    widthPx: bandStyle.bandLineWidths[pair],
    lineStyle: bandStyle.bandLineStyles[pair],
  }
}

export function resolveRollingVwapBandPrimitiveStyle(
  bandStyle: RollingVwapBandStyle,
): RollingVwapBandPrimitiveStyle {
  const outlines = {} as Record<RollingVwapBandValueKey, RollingVwapBandOutlineStyle>
  for (const key of ROLLING_VWAP_BAND_VALUE_KEYS) {
    outlines[key] = resolveRollingVwapBandOutlineStyle(bandStyle, key)
  }
  return { outlines, fillStyle: resolveRollingVwapBandFillStyle(bandStyle) }
}

/**
 * Price-scale modes the projection has to reproduce. The native six band
 * series were six separate price-scale sources, so in Percentage /
 * IndexedTo100 each outline was converted with its OWN first visible value.
 * One consolidated source must project every outline through the centre base
 * to keep those coordinates.
 */
export type RollingVwapBandPriceMode = 'absolute' | 'percentage' | 'indexed-to-100'

export type RollingVwapBandProjection = {
  mode: RollingVwapBandPriceMode
  /** First visible centre value; the hosting series' conversion base. */
  centerBase: number | null
  /** First visible value for each outline, matching the six native sources. */
  bases: Record<RollingVwapBandValueKey, number | null>
}

export type RollingVwapBandVisibleWindow = {
  fromTime: number
  toTime: number
}

export type RollingVwapBandSampleWindow = {
  /** First source sample included; may be the predecessor outside the visible window. */
  startIndex: number
  /** Exclusive end index; may include one successor outside the visible window. */
  endIndex: number
}

export type RollingVwapBandPoint = {
  x: number
  y: number
}

export type RollingVwapBandOutlineRun = {
  band: RollingVwapBandPairKey
  key: RollingVwapBandValueKey
  points: readonly RollingVwapBandPoint[]
  style: RollingVwapBandOutlineStyle
}

export type RollingVwapBandFillContour = {
  band: RollingVwapBandPairKey
  /** Bitmap vertex pairs (x, y) for one simple upper/lower contour. */
  polygon: number[]
  fillStyle: string
}

export type RollingVwapBandHaloStroke = {
  band: RollingVwapBandPairKey
  points: readonly RollingVwapBandPoint[]
  color: string
  widthPx: number
}

export type RollingVwapBandDrawModels = {
  outlines: RollingVwapBandOutlineRun[]
  fills: RollingVwapBandFillContour[]
  halo: RollingVwapBandHaloStroke[]
  /** Source samples examined while building this pass (visible-bounded). */
  visitedPoints: number
}

export function emptyRollingVwapBandDrawModels(): RollingVwapBandDrawModels {
  return { outlines: [], fills: [], halo: [], visitedPoints: 0 }
}

function isFiniteBandValue(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** First index whose time is at or after `time`. */
export function rollingVwapBandFirstIndexAtOrAfter(
  points: readonly RollingVwapPoint[],
  time: number,
): number {
  let low = 0
  let high = points.length
  while (low < high) {
    const mid = (low + high) >> 1
    if (points[mid].time < time) low = mid + 1
    else high = mid
  }
  return low
}

/** First index whose time is strictly after `time`. */
export function rollingVwapBandFirstIndexAfter(
  points: readonly RollingVwapPoint[],
  time: number,
): number {
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
 * Visible samples plus at most one predecessor and one successor. Runtime is
 * O(log history + visible samples), never an O(history) scan. Samples must be
 * chronological, matching the centre line series order.
 */
export function rollingVwapBandSampleWindow(
  points: readonly RollingVwapPoint[],
  visibleWindow: RollingVwapBandVisibleWindow | null,
): RollingVwapBandSampleWindow {
  if (points.length === 0 || visibleWindow === null) {
    return { startIndex: 0, endIndex: 0 }
  }
  const { fromTime, toTime } = visibleWindow
  if (!Number.isFinite(fromTime) || !Number.isFinite(toTime) || fromTime > toTime) {
    return { startIndex: 0, endIndex: 0 }
  }
  const firstAtOrAfter = rollingVwapBandFirstIndexAtOrAfter(points, fromTime)
  const startIndex = Math.max(0, firstAtOrAfter - 1)
  const firstAfter = rollingVwapBandFirstIndexAfter(points, toTime)
  const endIndex = Math.min(points.length, firstAfter + 1)
  return { startIndex, endIndex }
}

function firstFiniteValueFrom(
  points: readonly RollingVwapPoint[],
  startIndex: number,
  key: keyof RollingVwapPoint,
): number | null {
  for (let index = startIndex; index < points.length; index += 1) {
    const value = points[index][key]
    if (isFiniteBandValue(value)) return value
  }
  return null
}

/**
 * First visible conversion bases, matching `Series._internal_firstValue()`:
 * the first *fulfilled* row at or after the visible-range start (whitespace
 * rows are not series rows), resolved per native source.
 */
export function resolveRollingVwapBandProjection(params: {
  mode: RollingVwapBandPriceMode
  points: readonly RollingVwapPoint[]
  fromTime: number
}): RollingVwapBandProjection {
  const start = rollingVwapBandFirstIndexAtOrAfter(params.points, params.fromTime)
  const bases = {} as Record<RollingVwapBandValueKey, number | null>
  for (const key of ROLLING_VWAP_BAND_VALUE_KEYS) {
    bases[key] = firstFiniteValueFrom(params.points, start, key)
  }
  return {
    mode: params.mode,
    centerBase: firstFiniteValueFrom(params.points, start, 'vwap'),
    bases,
  }
}

/**
 * Raw value whose price-scale conversion (through the centre base) equals the
 * native outline's conversion through its own first visible base. Percentage
 * and IndexedTo100 are both linear in `value / base`, so the same ratio works
 * for both. Returns null when a base is missing or zero: the native series had
 * no conversion base or divided by zero, so it drew nothing either.
 */
export function projectRollingVwapBandOutlineValue(
  projection: RollingVwapBandProjection,
  key: RollingVwapBandValueKey,
  value: number | null,
): number | null {
  if (!isFiniteBandValue(value)) return null
  if (projection.mode === 'absolute') return value
  const base = projection.bases[key]
  const centerBase = projection.centerBase
  if (
    !isFiniteBandValue(base) ||
    base === 0 ||
    !isFiniteBandValue(centerBase) ||
    centerBase === 0
  ) {
    return null
  }
  return (value * centerBase) / base
}

export type BuildRollingVwapBandDrawModelsParams = {
  points: readonly RollingVwapPoint[]
  visibleWindow: RollingVwapBandVisibleWindow | null
  /** `false` skips every outline, fill and halo (disabled/unsupported instance). */
  visible: boolean
  /** Per band-pair visibility from the instance multipliers. */
  bandVisible: Record<RollingVwapBandPairKey, boolean>
  style: RollingVwapBandPrimitiveStyle
  /** `null` draws no halo; `all` strokes every visible band pair. */
  haloPart: RollingVwapBandPairKey | 'all' | null
  barSpacing: number
  timeToX: (time: number) => number | null
  outlinePriceToY: (key: RollingVwapBandValueKey, value: number) => number | null
  fillPriceToY: (value: number) => number | null
  projection: RollingVwapBandProjection
}

function plotOutlineRun(
  band: RollingVwapBandPairKey,
  key: RollingVwapBandValueKey,
  runs: RollingVwapBandOutlineRun[],
  run: RollingVwapBandPoint[],
  fulfilledCount: number,
  style: RollingVwapBandOutlineStyle,
  barSpacing: number,
): void {
  if (run.length >= 2) {
    runs.push({ band, key, points: run, style })
    return
  }
  if (run.length !== 1 || fulfilledCount !== 1) return
  // Native line rendering draws a half-bar horizontal segment when the
  // visible range holds exactly one item.
  const [point] = run
  const half = barSpacing / 2
  runs.push({
    band,
    key,
    points: [
      { x: point.x - half, y: point.y },
      { x: point.x + half, y: point.y },
    ],
    style,
  })
}

function contourForRun(
  run: ReadonlyArray<{ x: number; yUpper: number; yLower: number }>,
  barSpacing: number,
): number[] {
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
    polygon.push(run[index].x, run[index].yLower)
  }
  return polygon
}

export function buildRollingVwapBandDrawModels(
  params: BuildRollingVwapBandDrawModelsParams,
): RollingVwapBandDrawModels {
  const models = emptyRollingVwapBandDrawModels()
  const { points, visibleWindow, bandVisible, style, projection } = params
  if (!params.visible || points.length === 0) return models

  const { startIndex, endIndex } = rollingVwapBandSampleWindow(points, visibleWindow)
  if (startIndex >= endIndex) return models

  models.visitedPoints = endIndex - startIndex

  const plottedX = new Map<number, number | null>()
  const xOf = (time: number): number | null => {
    if (plottedX.has(time)) return plottedX.get(time) ?? null
    const x = params.timeToX(time)
    const resolved = x !== null && Number.isFinite(x) ? x : null
    plottedX.set(time, resolved)
    return resolved
  }

  for (const band of ROLLING_VWAP_BAND_PAIR_KEYS) {
    if (!bandVisible[band]) continue
    const keys = ROLLING_VWAP_BAND_PAIR_VALUE_KEYS[band]
    let fillRun: Array<{ x: number; yUpper: number; yLower: number }> = []
    const flushFill = () => {
      if (fillRun.length === 0) return
      models.fills.push({
        band,
        polygon: contourForRun(fillRun, params.barSpacing),
        fillStyle: style.fillStyle,
      })
      fillRun = []
    }
    const halosThisBand =
      params.haloPart === 'all' || params.haloPart === band
        ? ([] as RollingVwapBandHaloStroke[])
        : null

    for (const key of [keys.upper, keys.lower] as const) {
      const outlineStyle = style.outlines[key]
      let run: RollingVwapBandPoint[] = []
      let fulfilledCount = 0
      const flush = () => {
        plotOutlineRun(
          band,
          key,
          models.outlines,
          run,
          fulfilledCount,
          outlineStyle,
          params.barSpacing,
        )
        if (halosThisBand !== null && run.length >= 2) {
          halosThisBand.push({
            band,
            points: run,
            color: outlineStyle.color,
            widthPx: outlineStyle.widthPx,
          })
        }
        run = []
      }

      for (let index = startIndex; index < endIndex; index += 1) {
        const point = points[index]
        const x = xOf(point.time)
        const projected = projectRollingVwapBandOutlineValue(projection, key, point[key])
        const y =
          x === null || projected === null
            ? null
            : params.outlinePriceToY(key, projected)
        if (x === null || y === null || !Number.isFinite(y)) {
          flush()
          // The fill needs both bounds at this sample: a missing upper outline
          // point breaks the band-pair fill contour too.
          if (key === keys.upper) flushFill()
          continue
        }
        fulfilledCount += 1
        run.push({ x, y })
        if (key === keys.upper) {
          const upperValue = point[keys.upper]
          const lowerValue = point[keys.lower]
          const yUpper =
            isFiniteBandValue(upperValue) ? params.fillPriceToY(upperValue) : null
          const yLower =
            isFiniteBandValue(lowerValue) ? params.fillPriceToY(lowerValue) : null
          if (
            yUpper === null ||
            yLower === null ||
            !Number.isFinite(yUpper) ||
            !Number.isFinite(yLower)
          ) {
            flushFill()
          } else {
            fillRun.push({ x, yUpper, yLower })
          }
        }
      }
      flush()
    }
    flushFill()
    if (halosThisBand !== null) models.halo.push(...halosThisBand)
  }

  return models
}

/**
 * Price range for the merged band sources, in the space `PriceScale` expects.
 *
 * Absolute mode returns the union of every visible outline value. Percentage /
 * IndexedTo100 mode merges the *ratio* ranges (`value / base`) exactly like the
 * native per-source conversions, then projects the merged ratio back through
 * the centre base. Fill range uses the centre base, matching the pre-#262 fill
 * primitives that were attached to the centre series.
 */
export function rollingVwapBandAutoscaleRange(params: {
  points: readonly RollingVwapPoint[]
  visibleWindow: RollingVwapBandVisibleWindow
  bandVisible: Record<RollingVwapBandPairKey, boolean>
  projection: RollingVwapBandProjection
}): { minValue: number; maxValue: number } | null {
  const { points, visibleWindow, bandVisible, projection } = params
  const { fromTime, toTime } = visibleWindow
  if (!Number.isFinite(fromTime) || !Number.isFinite(toTime) || fromTime > toTime) {
    return null
  }
  const start = rollingVwapBandFirstIndexAtOrAfter(points, fromTime)
  const end = rollingVwapBandFirstIndexAfter(points, toTime)
  if (start >= end) return null

  let min = Infinity
  let max = -Infinity
  const scaled = projection.mode !== 'absolute'
  const centerBase = projection.centerBase
  if (scaled && (!isFiniteBandValue(centerBase) || centerBase === 0)) return null

  const addValue = (value: number | null, base: number | null): void => {
    if (!isFiniteBandValue(value)) return
    let contribution = value
    if (scaled) {
      if (!isFiniteBandValue(base) || base === 0) return
      contribution = value / base
    }
    if (contribution < min) min = contribution
    if (contribution > max) max = contribution
  }

  for (const band of ROLLING_VWAP_BAND_PAIR_KEYS) {
    if (!bandVisible[band]) continue
    const keys = ROLLING_VWAP_BAND_PAIR_VALUE_KEYS[band]
    for (let index = start; index < end; index += 1) {
      const point = points[index]
      addValue(point[keys.upper], projection.bases[keys.upper])
      addValue(point[keys.lower], projection.bases[keys.lower])
      if (scaled) {
        addValue(point[keys.upper], centerBase)
        addValue(point[keys.lower], centerBase)
      }
    }
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) return null
  if (!scaled) return { minValue: min, maxValue: max }
  return { minValue: min * (centerBase as number), maxValue: max * (centerBase as number) }
}

function distanceSq(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x1 - x2
  const dy = y1 - y2
  return dx * dx + dy * dy
}

function segmentDistanceSq(
  x: number,
  y: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const lengthSq = dx * dx + dy * dy
  if (lengthSq === 0) return distanceSq(x, y, x1, y1)
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lengthSq))
  return distanceSq(x, y, x1 + t * dx, y1 + t * dy)
}

/**
 * Nearest visible band outline under the pointer, using the same geometry the
 * renderer draws. Returns the band pair key (never the centre) and its distance
 * so callers can honour the shared 6 px hit radius.
 */
export function hitTestRollingVwapBandOutlineModels(
  models: RollingVwapBandDrawModels,
  paneX: number,
  paneY: number,
  tolerancePx = 6,
): { band: RollingVwapBandPairKey; distance: number } | null {
  const toleranceSq = tolerancePx * tolerancePx
  let best: { band: RollingVwapBandPairKey; distance: number } | null = null
  for (const run of models.outlines) {
    const { points } = run
    for (let index = 1; index < points.length; index += 1) {
      const distance = segmentDistanceSq(
        paneX,
        paneY,
        points[index - 1].x,
        points[index - 1].y,
        points[index].x,
        points[index].y,
      )
      if (distance > toleranceSq) continue
      if (best === null || distance < best.distance) {
        best = { band: run.band, distance }
      }
    }
  }
  return best === null ? null : { band: best.band, distance: Math.sqrt(best.distance) }
}
