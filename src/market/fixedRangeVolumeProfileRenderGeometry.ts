import type { FixedRangeVolumeProfileResult, FixedRangeVolumeProfileRow } from './fixedRangeVolumeProfile.ts'
import { resolveFixedRangeVolumeProfileEffectiveToTime } from './fixedRangeVolumeProfileRequestBounds.ts'
import {
  FRVP_HISTOGRAM_DEFAULT_BAR_HEIGHT_PERCENT,
  FRVP_HISTOGRAM_DEFAULT_WIDTH_PERCENT,
  FRVP_HISTOGRAM_MAX_WIDTH_FRACTION_OF_RANGE,
  frvpHistogramStyleDefaults,
  isFrvpHistogramBarHeightPercent,
  isFrvpHistogramWidthPercent,
  type FixedRangeVolumeProfileHistogramStyleInput,
} from './frvpHistogramStyles.ts'
import {
  clampMarketStyleOpacityPercent,
  marketStyleColorWithOpacity,
} from './marketStylePalette.ts'

/**
 * Legacy maximum histogram width (1/6 of the selected range). Re-exported here
 * for the existing render-geometry call sites and tests; the source of truth is
 * `frvpHistogramStyles.ts` next to the editable percentage.
 */
export { FRVP_HISTOGRAM_MAX_WIDTH_FRACTION_OF_RANGE }

/**
 * Value-Area rows keep the strongest histogram alpha; outside rows stay at the
 * `25:55` fraction of it at every configured opacity.
 */
export const FRVP_VALUE_AREA_ROW_OPACITY_PERCENT = 55
export const FRVP_OUTSIDE_VALUE_AREA_ROW_OPACITY_PERCENT = 25
export const FRVP_VALUE_AREA_ROW_OPACITY = FRVP_VALUE_AREA_ROW_OPACITY_PERCENT / 100
export const FRVP_OUTSIDE_VALUE_AREA_ROW_OPACITY =
  FRVP_OUTSIDE_VALUE_AREA_ROW_OPACITY_PERCENT / 100

/**
 * Effective alpha percentage for one row: the configured 0–100% opacity scaled
 * by the Value-Area share (55 inside, 25 outside), so at 100% configured opacity
 * the alphas are 0.55 / 0.25 and at the 50% default they are 0.275 / 0.125.
 */
export function fixedRangeVolumeProfileRowOpacityPercent(
  configuredOpacityPercent: number,
  inValueArea: boolean,
): number {
  const share = inValueArea
    ? FRVP_VALUE_AREA_ROW_OPACITY_PERCENT
    : FRVP_OUTSIDE_VALUE_AREA_ROW_OPACITY_PERCENT
  return (clampMarketStyleOpacityPercent(configuredOpacityPercent) * share) / 100
}

export type FixedRangeVolumeProfileHistogramGeometryStyleInput = {
  /** Maximum bar width as a percentage of the selected range (1–100). */
  histogramWidthPercent?: number
  /** Vertical fill of each row as a percentage of the bin height (1–100). */
  histogramBarHeightPercent?: number
}

export type FixedRangeVolumeProfileRowBarGeometry = {
  top: number
  bottom: number
  left: number
  upWidth: number
  downWidth: number
  totalWidth: number
  upColor: string
  downColor: string
}

export type FixedRangeVolumeProfileLevelLineGeometry = {
  kind: 'poc' | 'vah' | 'val'
  y: number
  x1: number
  x2: number
  strokeStyle: string
  lineDash: readonly number[]
  lineWidthCssPx: number
}

export type FixedRangeVolumeProfileEndpointHandlesGeometry = {
  startX: number
  endX: number
  y: number
}

export type FixedRangeVolumeProfileInstanceDrawModel = {
  instanceId: string
  rangeLeft: number
  rangeRight: number
  rangeWidth: number
  rows: FixedRangeVolumeProfileRowBarGeometry[]
  lines: FixedRangeVolumeProfileLevelLineGeometry[]
  endpointHandles: FixedRangeVolumeProfileEndpointHandlesGeometry | null
}

export function computeSelectionRangeHorizontalBounds(params: {
  fromTime: number
  toTime: number
  fromTimeToCoordinate: (time: number) => number | null
  toTimeToCoordinate: (time: number) => number | null
  barSpacing: number
}): { left: number; right: number; width: number } | null {
  const xFrom = params.fromTimeToCoordinate(params.fromTime)
  const xTo = params.toTimeToCoordinate(params.toTime)
  if (xFrom === null || xTo === null) return null
  if (!Number.isFinite(xFrom) || !Number.isFinite(xTo)) return null

  const half = params.barSpacing / 2
  const left = Math.min(xFrom, xTo) - half
  const right = Math.max(xFrom, xTo) + half
  const width = right - left
  if (!Number.isFinite(width) || width <= 0) return null
  return { left, right, width }
}

export function computeMaxRowVolume(rows: readonly FixedRangeVolumeProfileRow[]): number {
  let max = 0
  for (const row of rows) {
    if (!Number.isFinite(row.totalVolume) || row.totalVolume <= 0) continue
    max = Math.max(max, row.totalVolume)
  }
  return max
}

export function buildFixedRangeVolumeProfileRowBarGeometry(params: {
  row: FixedRangeVolumeProfileRow
  rangeLeft: number
  rangeWidth: number
  maxRowVolume: number
  top: number
  bottom: number
  inValueArea: boolean
} & Partial<FixedRangeVolumeProfileHistogramStyleInput> &
  FixedRangeVolumeProfileHistogramGeometryStyleInput): FixedRangeVolumeProfileRowBarGeometry | null {
  const { row, rangeLeft, rangeWidth, maxRowVolume, top, bottom } = params
  if (!Number.isFinite(rangeLeft) || !Number.isFinite(rangeWidth) || rangeWidth <= 0) return null
  if (!Number.isFinite(maxRowVolume) || maxRowVolume <= 0) return null
  if (!Number.isFinite(row.totalVolume) || row.totalVolume <= 0) return null

  const height = bottom - top
  if (!Number.isFinite(height) || height <= 0) return null

  const widthPercent =
    params.histogramWidthPercent !== undefined &&
    isFrvpHistogramWidthPercent(params.histogramWidthPercent)
      ? params.histogramWidthPercent
      : FRVP_HISTOGRAM_DEFAULT_WIDTH_PERCENT
  const barHeightPercent =
    params.histogramBarHeightPercent !== undefined &&
    isFrvpHistogramBarHeightPercent(params.histogramBarHeightPercent)
      ? params.histogramBarHeightPercent
      : FRVP_HISTOGRAM_DEFAULT_BAR_HEIGHT_PERCENT

  const histogramMaxWidth =
    widthPercent === FRVP_HISTOGRAM_DEFAULT_WIDTH_PERCENT
      ? rangeWidth * FRVP_HISTOGRAM_MAX_WIDTH_FRACTION_OF_RANGE
      : (rangeWidth * widthPercent) / 100
  if (!Number.isFinite(histogramMaxWidth) || histogramMaxWidth < 0) {
    return null
  }
  // Validated percentages are <= 100%, so the clamp only absorbs last-bit
  // floating-point rounding; a bar can never overflow the selected range.
  const boundedMaxWidth = Math.min(histogramMaxWidth, rangeWidth)
  const totalWidth = (boundedMaxWidth * row.totalVolume) / maxRowVolume
  if (!Number.isFinite(totalWidth) || totalWidth <= 0) return null

  let barTop = top
  let barBottom = bottom
  if (barHeightPercent < FRVP_HISTOGRAM_DEFAULT_BAR_HEIGHT_PERCENT) {
    const center = (top + bottom) / 2
    const filledHeight = (height * barHeightPercent) / 100
    barTop = center - filledHeight / 2
    barBottom = center + filledHeight / 2
    if (
      !Number.isFinite(barTop) ||
      !Number.isFinite(barBottom) ||
      barBottom <= barTop
    ) {
      return null
    }
  }

  const upShare = row.totalVolume > 0 ? row.upVolume / row.totalVolume : 0
  const downShare = row.totalVolume > 0 ? row.downVolume / row.totalVolume : 0
  const upWidth = totalWidth * upShare
  const downWidth = totalWidth * downShare
  const defaults = frvpHistogramStyleDefaults()
  const upColor = params.upColor ?? defaults.upColor
  const downColor = params.downColor ?? defaults.downColor
  const upOpacityPercent = params.upOpacityPercent ?? defaults.upOpacityPercent
  const downOpacityPercent = params.downOpacityPercent ?? defaults.downOpacityPercent

  return {
    top: barTop,
    bottom: barBottom,
    left: rangeLeft,
    upWidth,
    downWidth,
    totalWidth,
    upColor: marketStyleColorWithOpacity(
      upColor,
      fixedRangeVolumeProfileRowOpacityPercent(upOpacityPercent, params.inValueArea),
    ),
    downColor: marketStyleColorWithOpacity(
      downColor,
      fixedRangeVolumeProfileRowOpacityPercent(downOpacityPercent, params.inValueArea),
    ),
  }
}

export function buildFixedRangeVolumeProfileLevelLines(params: {
  rangeLeft: number
  rangeRight: number
  pocStrokeStyle: string
  pocLineWidthCssPx: number
  pocLineDash: readonly number[]
  vahStrokeStyle: string
  vahLineWidthCssPx: number
  vahLineDash: readonly number[]
  valStrokeStyle: string
  valLineWidthCssPx: number
  valLineDash: readonly number[]
  pocPrice: number | null
  vah: number | null
  val: number | null
  priceToY: (price: number) => number | null
}): FixedRangeVolumeProfileLevelLineGeometry[] {
  const lines: FixedRangeVolumeProfileLevelLineGeometry[] = []
  const add = (
    kind: FixedRangeVolumeProfileLevelLineGeometry['kind'],
    price: number | null,
    strokeStyle: string,
    lineDash: readonly number[],
    lineWidthCssPx: number,
  ) => {
    if (price === null || !Number.isFinite(price)) return
    const y = params.priceToY(price)
    if (y === null || !Number.isFinite(y)) return
    lines.push({
      kind,
      y,
      x1: params.rangeLeft,
      x2: params.rangeRight,
      strokeStyle,
      lineDash,
      lineWidthCssPx,
    })
  }

  add('poc', params.pocPrice, params.pocStrokeStyle, params.pocLineDash, params.pocLineWidthCssPx)
  add('vah', params.vah, params.vahStrokeStyle, params.vahLineDash, params.vahLineWidthCssPx)
  add('val', params.val, params.valStrokeStyle, params.valLineDash, params.valLineWidthCssPx)
  return lines
}

export function buildFixedRangeVolumeProfileInstanceDrawModel(params: {
  instanceId: string
  fromTime: number
  toTime: number
  /** Right boundary used for the histogram/row/level span (Extend Right aware). Defaults to `toTime`. */
  effectiveToTime?: number
  profile: FixedRangeVolumeProfileResult
  fromTimeToCoordinate: (time: number) => number | null
  toTimeToCoordinate: (time: number) => number | null
  barSpacing: number
  priceToY: (price: number) => number | null
  pocStrokeStyle: string
  pocLineWidthCssPx: number
  pocLineDash: readonly number[]
  vahStrokeStyle: string
  vahLineWidthCssPx: number
  vahLineDash: readonly number[]
  valStrokeStyle: string
  valLineWidthCssPx: number
  valLineDash: readonly number[]
} & Partial<FixedRangeVolumeProfileHistogramStyleInput> &
  FixedRangeVolumeProfileHistogramGeometryStyleInput): FixedRangeVolumeProfileInstanceDrawModel | null {
  const xFrom = params.fromTimeToCoordinate(params.fromTime)
  const xTo = params.toTimeToCoordinate(params.toTime)
  if (xFrom === null || xTo === null) return null
  if (!Number.isFinite(xFrom) || !Number.isFinite(xTo)) return null

  const range = computeSelectionRangeHorizontalBounds({
    fromTime: params.fromTime,
    toTime: params.effectiveToTime ?? params.toTime,
    fromTimeToCoordinate: params.fromTimeToCoordinate,
    toTimeToCoordinate: params.toTimeToCoordinate,
    barSpacing: params.barSpacing,
  })
  if (!range) return null

  const rows = params.profile.rows
  if (rows.length === 0) return null
  const maxRowVolume = computeMaxRowVolume(rows)
  if (maxRowVolume <= 0) return null

  const rowGeometries: FixedRangeVolumeProfileRowBarGeometry[] = []
  // Endpoint handles stay at the centre of the full price-bin span: shrinking
  // the vertical bar fill must not move the drag handles.
  let profileTop = Infinity
  let profileBottom = -Infinity
  for (const row of rows) {
    const yHigh = params.priceToY(row.priceHigh)
    const yLow = params.priceToY(row.priceLow)
    if (yHigh === null || yLow === null) continue
    const top = Math.min(yHigh, yLow)
    const bottom = Math.max(yHigh, yLow)
    const geometry = buildFixedRangeVolumeProfileRowBarGeometry({
      row,
      rangeLeft: range.left,
      rangeWidth: range.width,
      maxRowVolume,
      top,
      bottom,
      inValueArea: row.inValueArea,
      upColor: params.upColor,
      downColor: params.downColor,
      upOpacityPercent: params.upOpacityPercent,
      downOpacityPercent: params.downOpacityPercent,
      histogramWidthPercent: params.histogramWidthPercent,
      histogramBarHeightPercent: params.histogramBarHeightPercent,
    })
    if (!geometry) continue
    rowGeometries.push(geometry)
    profileTop = Math.min(profileTop, top)
    profileBottom = Math.max(profileBottom, bottom)
  }

  if (rowGeometries.length === 0) return null

  const lines = buildFixedRangeVolumeProfileLevelLines({
    rangeLeft: range.left,
    rangeRight: range.right,
    pocStrokeStyle: params.pocStrokeStyle,
    pocLineWidthCssPx: params.pocLineWidthCssPx,
    pocLineDash: params.pocLineDash,
    vahStrokeStyle: params.vahStrokeStyle,
    vahLineWidthCssPx: params.vahLineWidthCssPx,
    vahLineDash: params.vahLineDash,
    valStrokeStyle: params.valStrokeStyle,
    valLineWidthCssPx: params.valLineWidthCssPx,
    valLineDash: params.valLineDash,
    pocPrice: params.profile.pocPrice,
    vah: params.profile.vah,
    val: params.profile.val,
    priceToY: params.priceToY,
  })

  if (!Number.isFinite(profileTop) || !Number.isFinite(profileBottom)) return null
  const handleY = (profileTop + profileBottom) / 2

  const endpointHandles = {
    startX: xFrom,
    endX: xTo,
    y: handleY,
  }

  return {
    instanceId: params.instanceId,
    rangeLeft: range.left,
    rangeRight: range.right,
    rangeWidth: range.width,
    rows: rowGeometries,
    lines,
    endpointHandles,
  }
}

export type FixedRangeVolumeProfileDrawStyleInput = {
  pocStrokeStyle: string
  pocLineWidthCssPx: number
  pocLineDash: readonly number[]
  vahStrokeStyle: string
  vahLineWidthCssPx: number
  vahLineDash: readonly number[]
  valStrokeStyle: string
  valLineWidthCssPx: number
  valLineDash: readonly number[]
} & FixedRangeVolumeProfileHistogramStyleInput &
  Required<FixedRangeVolumeProfileHistogramGeometryStyleInput>

export function buildFixedRangeVolumeProfileDrawModels(params: {
  instances: readonly {
    id: string
    fromTime: number
    toTime: number
    enabled: boolean
    extendRight?: boolean
    locked?: boolean
  }[]
  selectedId?: string | null
  readyById: ReadonlyMap<
    string,
    {
      profile: FixedRangeVolumeProfileResult
    }
  >
  fromTimeToCoordinate: (time: number) => number | null
  toTimeToCoordinate: (time: number) => number | null
  barSpacing: number
  priceToY: (price: number) => number | null
  styleForInstance: (instanceId: string) => FixedRangeVolumeProfileDrawStyleInput
  /** Latest available candle time, used when an instance has Extend Right set. */
  liveRightEdge?: number | null
}): FixedRangeVolumeProfileInstanceDrawModel[] {
  const models: FixedRangeVolumeProfileInstanceDrawModel[] = []
  const liveRightEdge = params.liveRightEdge ?? null
  for (const instance of params.instances) {
    if (!instance.enabled) continue
    const ready = params.readyById.get(instance.id)
    if (!ready) continue
    const styles = params.styleForInstance(instance.id)
    const model = buildFixedRangeVolumeProfileInstanceDrawModel({
      instanceId: instance.id,
      fromTime: instance.fromTime,
      toTime: instance.toTime,
      effectiveToTime: resolveFixedRangeVolumeProfileEffectiveToTime(instance, liveRightEdge),
      profile: ready.profile,
      fromTimeToCoordinate: params.fromTimeToCoordinate,
      toTimeToCoordinate: params.toTimeToCoordinate,
      barSpacing: params.barSpacing,
      priceToY: params.priceToY,
      ...styles,
    })
    if (!model) continue
    const showHandles =
      params.selectedId === instance.id && instance.locked !== true
    models.push({
      ...model,
      endpointHandles: showHandles ? model.endpointHandles : null,
    })
  }
  return models
}
