import { BTC_PERPETUAL_CANDLESTICK_COLORS } from './btcPerpetualCandleColors.ts'
import type { FixedRangeVolumeProfileResult, FixedRangeVolumeProfileRow } from './fixedRangeVolumeProfile.ts'

export const FRVP_VALUE_AREA_ROW_OPACITY = 0.55
export const FRVP_OUTSIDE_VALUE_AREA_ROW_OPACITY = 0.25

/** Max histogram bar width as a fraction of the selected time range width (peak volume row). */
export const FRVP_HISTOGRAM_MAX_WIDTH_FRACTION_OF_RANGE = 1 / 6

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
}): FixedRangeVolumeProfileRowBarGeometry | null {
  const { row, rangeLeft, rangeWidth, maxRowVolume, top, bottom } = params
  if (!Number.isFinite(rangeLeft) || !Number.isFinite(rangeWidth) || rangeWidth <= 0) return null
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
    left: rangeLeft,
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
}): FixedRangeVolumeProfileInstanceDrawModel | null {
  const xFrom = params.fromTimeToCoordinate(params.fromTime)
  const xTo = params.toTimeToCoordinate(params.toTime)
  if (xFrom === null || xTo === null) return null
  if (!Number.isFinite(xFrom) || !Number.isFinite(xTo)) return null

  const range = computeSelectionRangeHorizontalBounds({
    fromTime: params.fromTime,
    toTime: params.toTime,
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
    })
    if (geometry) rowGeometries.push(geometry)
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

  let profileTop = Infinity
  let profileBottom = -Infinity
  for (const row of rowGeometries) {
    profileTop = Math.min(profileTop, row.top)
    profileBottom = Math.max(profileBottom, row.bottom)
  }
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
}

export function buildFixedRangeVolumeProfileDrawModels(params: {
  instances: readonly {
    id: string
    fromTime: number
    toTime: number
    enabled: boolean
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
}): FixedRangeVolumeProfileInstanceDrawModel[] {
  const models: FixedRangeVolumeProfileInstanceDrawModel[] = []
  for (const instance of params.instances) {
    if (!instance.enabled) continue
    const ready = params.readyById.get(instance.id)
    if (!ready) continue
    const styles = params.styleForInstance(instance.id)
    const model = buildFixedRangeVolumeProfileInstanceDrawModel({
      instanceId: instance.id,
      fromTime: instance.fromTime,
      toTime: instance.toTime,
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
