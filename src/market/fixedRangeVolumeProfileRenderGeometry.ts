import { BTC_PERPETUAL_CANDLESTICK_COLORS } from './btcPerpetualCandleColors.ts'
import type { FixedRangeVolumeProfileResult, FixedRangeVolumeProfileRow } from './fixedRangeVolumeProfile.ts'

export const FRVP_VALUE_AREA_ROW_OPACITY = 0.55
export const FRVP_OUTSIDE_VALUE_AREA_ROW_OPACITY = 0.25

/** Max histogram bar width as a fraction of the selected time range width (peak volume row). */
export const FRVP_HISTOGRAM_MAX_WIDTH_FRACTION_OF_RANGE = 1 / 6

/** POC, VAH, and VAL line thickness in CSS pixels. */
export const FRVP_LEVEL_LINE_WIDTH_CSS_PX = 3

/** POC level line stroke (solid red at 0.85 opacity). */
export const FRVP_POC_LINE_STROKE_STYLE = 'rgba(220, 38, 38, 0.85)'

const FRVP_VAH_VAL_LINE_STROKE_STYLE = 'rgba(160, 160, 160, 0.55)'
const FRVP_VAH_VAL_LINE_DASH: readonly number[] = [4, 4]

export type FixedRangeVolumeProfileRowBarGeometry = {
  top: number
  bottom: number
  right: number
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
}

export type FixedRangeVolumeProfileInstanceDrawModel = {
  instanceId: string
  rangeLeft: number
  rangeRight: number
  rangeWidth: number
  rows: FixedRangeVolumeProfileRowBarGeometry[]
  lines: FixedRangeVolumeProfileLevelLineGeometry[]
}

function withOpacity(hex: string, opacity: number): string {
  const normalized = hex.replace('#', '')
  const value =
    normalized.length === 3
      ? normalized
          .split('')
          .map((char) => char + char)
          .join('')
      : normalized
  const r = Number.parseInt(value.slice(0, 2), 16)
  const g = Number.parseInt(value.slice(2, 4), 16)
  const b = Number.parseInt(value.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${opacity})`
}

export function computeSelectionRangeHorizontalBounds(params: {
  fromTime: number
  toTime: number
  timeToCoordinate: (time: number) => number | null
  barSpacing: number
}): { left: number; right: number; width: number } | null {
  const xFrom = params.timeToCoordinate(params.fromTime)
  const xTo = params.timeToCoordinate(params.toTime)
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
  rangeRight: number
  rangeWidth: number
  maxRowVolume: number
  top: number
  bottom: number
  inValueArea: boolean
}): FixedRangeVolumeProfileRowBarGeometry | null {
  const { row, rangeRight, rangeWidth, maxRowVolume, top, bottom } = params
  if (!Number.isFinite(rangeRight) || !Number.isFinite(rangeWidth) || rangeWidth <= 0) return null
  if (!Number.isFinite(maxRowVolume) || maxRowVolume <= 0) return null
  if (!Number.isFinite(row.totalVolume) || row.totalVolume <= 0) return null

  const height = bottom - top
  if (!Number.isFinite(height) || height <= 0) return null

  const histogramMaxWidth = rangeWidth * FRVP_HISTOGRAM_MAX_WIDTH_FRACTION_OF_RANGE
  const totalWidth = (histogramMaxWidth * row.totalVolume) / maxRowVolume
  if (!Number.isFinite(totalWidth) || totalWidth <= 0) return null

  const upShare = row.totalVolume > 0 ? row.upVolume / row.totalVolume : 0
  const downShare = row.totalVolume > 0 ? row.downVolume / row.totalVolume : 0
  const upWidth = totalWidth * upShare
  const downWidth = totalWidth * downShare
  const opacity = params.inValueArea
    ? FRVP_VALUE_AREA_ROW_OPACITY
    : FRVP_OUTSIDE_VALUE_AREA_ROW_OPACITY

  return {
    top,
    bottom,
    right: rangeRight,
    upWidth,
    downWidth,
    totalWidth,
    upColor: withOpacity(BTC_PERPETUAL_CANDLESTICK_COLORS.upColor, opacity),
    downColor: withOpacity(BTC_PERPETUAL_CANDLESTICK_COLORS.downColor, opacity),
  }
}

export function buildFixedRangeVolumeProfileLevelLines(params: {
  rangeLeft: number
  rangeRight: number
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
    })
  }

  add('poc', params.pocPrice, FRVP_POC_LINE_STROKE_STYLE, [])
  add('vah', params.vah, FRVP_VAH_VAL_LINE_STROKE_STYLE, FRVP_VAH_VAL_LINE_DASH)
  add('val', params.val, FRVP_VAH_VAL_LINE_STROKE_STYLE, FRVP_VAH_VAL_LINE_DASH)
  return lines
}

export function buildFixedRangeVolumeProfileInstanceDrawModel(params: {
  instanceId: string
  fromTime: number
  toTime: number
  profile: FixedRangeVolumeProfileResult
  timeToCoordinate: (time: number) => number | null
  barSpacing: number
  priceToY: (price: number) => number | null
}): FixedRangeVolumeProfileInstanceDrawModel | null {
  const range = computeSelectionRangeHorizontalBounds({
    fromTime: params.fromTime,
    toTime: params.toTime,
    timeToCoordinate: params.timeToCoordinate,
    barSpacing: params.barSpacing,
  })
  if (!range) return null

  const rows = params.profile.rows
  if (rows.length === 0) return null
  const maxRowVolume = computeMaxRowVolume(rows)
  if (maxRowVolume <= 0) return null

  const rowGeometries: FixedRangeVolumeProfileRowBarGeometry[] = []
  for (const row of rows) {
    const yHigh = params.priceToY(row.priceHigh)
    const yLow = params.priceToY(row.priceLow)
    if (yHigh === null || yLow === null) continue
    const top = Math.min(yHigh, yLow)
    const bottom = Math.max(yHigh, yLow)
    const geometry = buildFixedRangeVolumeProfileRowBarGeometry({
      row,
      rangeRight: range.right,
      rangeWidth: range.width,
      maxRowVolume,
      top,
      bottom,
      inValueArea: row.inValueArea,
    })
    if (geometry) rowGeometries.push(geometry)
  }

  if (rowGeometries.length === 0) return null

  const lines = buildFixedRangeVolumeProfileLevelLines({
    rangeLeft: range.left,
    rangeRight: range.right,
    pocPrice: params.profile.pocPrice,
    vah: params.profile.vah,
    val: params.profile.val,
    priceToY: params.priceToY,
  })

  return {
    instanceId: params.instanceId,
    rangeLeft: range.left,
    rangeRight: range.right,
    rangeWidth: range.width,
    rows: rowGeometries,
    lines,
  }
}

export function buildFixedRangeVolumeProfileDrawModels(params: {
  instances: readonly {
    id: string
    fromTime: number
    toTime: number
    enabled: boolean
  }[]
  readyById: ReadonlyMap<
    string,
    {
      profile: FixedRangeVolumeProfileResult
    }
  >
  timeToCoordinate: (time: number) => number | null
  barSpacing: number
  priceToY: (price: number) => number | null
}): FixedRangeVolumeProfileInstanceDrawModel[] {
  const models: FixedRangeVolumeProfileInstanceDrawModel[] = []
  for (const instance of params.instances) {
    if (!instance.enabled) continue
    const ready = params.readyById.get(instance.id)
    if (!ready) continue
    const model = buildFixedRangeVolumeProfileInstanceDrawModel({
      instanceId: instance.id,
      fromTime: instance.fromTime,
      toTime: instance.toTime,
      profile: ready.profile,
      timeToCoordinate: params.timeToCoordinate,
      barSpacing: params.barSpacing,
      priceToY: params.priceToY,
    })
    if (model) models.push(model)
  }
  return models
}
