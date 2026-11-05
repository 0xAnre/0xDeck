import type {
  FixedRangeVolumeProfileDevelopingSample,
  FixedRangeVolumeProfileResult,
  FixedRangeVolumeProfileRow,
} from './fixedRangeVolumeProfile.ts'
import { resolveFixedRangeVolumeProfileEffectiveToTime } from './fixedRangeVolumeProfileRequestBounds.ts'
import {
  DEFAULT_FRVP_LEVEL_RENDER_MODE,
  frvpInstancePocMode,
  frvpInstanceValueAreaMode,
  frvpRenderModeShowsLine,
  frvpRenderModeShowsStep,
  type FrvpLevelRenderMode,
} from './frvpDevelopingMode.ts'
import {
  buildFrvpDevelopingStepRuns,
  type FrvpDevelopingStepPoint,
  type FrvpDevelopingVisibleTimeRange,
} from './frvpDevelopingStepLine.ts'
import {
  frvpHistogramStyleDefaults,
  type FixedRangeVolumeProfileHistogramStyleInput,
} from './frvpHistogramStyles.ts'
import {
  clampMarketStyleOpacityPercent,
  marketStyleColorWithOpacity,
} from './marketStylePalette.ts'

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

/**
 * Developing step series for one level group. A run is one contiguous staircase;
 * a null level (no accumulated volume yet) splits the series into several runs.
 */
export type FixedRangeVolumeProfileDevelopingLineGeometry = {
  kind: 'poc' | 'vah' | 'val'
  runs: FrvpDevelopingStepPoint[][]
  strokeStyle: string
  lineDash: readonly number[]
  lineWidthCssPx: number
}

/** Per-instance developing input: the cumulative samples and the visible window. */
export type FixedRangeVolumeProfileDevelopingInput = {
  samples: readonly FixedRangeVolumeProfileDevelopingSample[]
  visibleTimeRange?: FrvpDevelopingVisibleTimeRange | null
}

export type FixedRangeVolumeProfileInstanceDrawModel = {
  instanceId: string
  rangeLeft: number
  rangeRight: number
  rangeWidth: number
  rows: FixedRangeVolumeProfileRowBarGeometry[]
  lines: FixedRangeVolumeProfileLevelLineGeometry[]
  /**
   * Empty unless an instance's `valueAreaMode`/`pocMode` is `step` or `both`;
   * the flat `lines` above are then filtered by the same modes.
   */
  developingLines: FixedRangeVolumeProfileDevelopingLineGeometry[]
  endpointHandles: FixedRangeVolumeProfileEndpointHandlesGeometry | null
}

/** Per-level stroke settings shared by the flat lines and the developing steps. */
export type FixedRangeVolumeProfileLevelLineStyles = {
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
} & Partial<FixedRangeVolumeProfileHistogramStyleInput>): FixedRangeVolumeProfileRowBarGeometry | null {
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
  const defaults = frvpHistogramStyleDefaults()
  const upColor = params.upColor ?? defaults.upColor
  const downColor = params.downColor ?? defaults.downColor
  const upOpacityPercent = params.upOpacityPercent ?? defaults.upOpacityPercent
  const downOpacityPercent = params.downOpacityPercent ?? defaults.downOpacityPercent

  return {
    top,
    bottom,
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
  /** Per-group `line` visibility; a `step`-only group hides its flat line. */
  pocVisible?: boolean
  valueAreaVisible?: boolean
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

  if (params.pocVisible !== false) {
    add('poc', params.pocPrice, params.pocStrokeStyle, params.pocLineDash, params.pocLineWidthCssPx)
  }
  if (params.valueAreaVisible !== false) {
    add('vah', params.vah, params.vahStrokeStyle, params.vahLineDash, params.vahLineWidthCssPx)
    add('val', params.val, params.valStrokeStyle, params.valLineDash, params.valLineWidthCssPx)
  }
  return lines
}

/**
 * Developing (cumulative) step series geometry for the requested level groups.
 *
 * Only the groups whose mode includes `step` are built; `line` (the default)
 * returns an empty array, so a fresh or legacy instance renders exactly today's
 * flat lines and allocates nothing extra per frame. The step series reuses the
 * per-level stroke settings of the flat lines.
 */
export function buildFixedRangeVolumeProfileDevelopingLines(params: {
  developing: FixedRangeVolumeProfileDevelopingInput
  valueAreaMode: FrvpLevelRenderMode
  pocMode: FrvpLevelRenderMode
  rangeStartX: number
  rangeEndX: number
  timeToX: (time: number) => number | null
  priceToY: (price: number) => number | null
} & FixedRangeVolumeProfileLevelLineStyles): FixedRangeVolumeProfileDevelopingLineGeometry[] {
  const { samples, visibleTimeRange } = params.developing
  const { valueAreaMode, pocMode } = params
  if (samples.length === 0) return []

  const levelStyles: Array<{
    kind: FixedRangeVolumeProfileDevelopingLineGeometry['kind']
    strokeStyle: string
    lineDash: readonly number[]
    lineWidthCssPx: number
  }> = []

  if (frvpRenderModeShowsStep(pocMode)) {
    levelStyles.push({
      kind: 'poc',
      strokeStyle: params.pocStrokeStyle,
      lineDash: params.pocLineDash,
      lineWidthCssPx: params.pocLineWidthCssPx,
    })
  }
  if (frvpRenderModeShowsStep(valueAreaMode)) {
    levelStyles.push({
      kind: 'vah',
      strokeStyle: params.vahStrokeStyle,
      lineDash: params.vahLineDash,
      lineWidthCssPx: params.vahLineWidthCssPx,
    })
    levelStyles.push({
      kind: 'val',
      strokeStyle: params.valStrokeStyle,
      lineDash: params.valLineDash,
      lineWidthCssPx: params.valLineWidthCssPx,
    })
  }

  const developingLines: FixedRangeVolumeProfileDevelopingLineGeometry[] = []
  for (const level of levelStyles) {
    const runs = buildFrvpDevelopingStepRuns({
      samples,
      level: level.kind,
      rangeStartX: params.rangeStartX,
      rangeEndX: params.rangeEndX,
      timeToX: params.timeToX,
      priceToY: params.priceToY,
      visibleTimeRange,
    })
    if (runs.length === 0) continue
    developingLines.push({
      kind: level.kind,
      runs: runs.map((run) => run.points),
      strokeStyle: level.strokeStyle,
      lineDash: level.lineDash,
      lineWidthCssPx: level.lineWidthCssPx,
    })
  }
  return developingLines
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
  /** Flat-line vs developing-step render mode per level group; default `line`. */
  valueAreaMode?: FrvpLevelRenderMode
  pocMode?: FrvpLevelRenderMode
  /** Cumulative samples for the developing step series; absent = no step series. */
  developing?: FixedRangeVolumeProfileDevelopingInput | null
} & Partial<FixedRangeVolumeProfileHistogramStyleInput>): FixedRangeVolumeProfileInstanceDrawModel | null {
  const valueAreaMode = params.valueAreaMode ?? DEFAULT_FRVP_LEVEL_RENDER_MODE
  const pocMode = params.pocMode ?? DEFAULT_FRVP_LEVEL_RENDER_MODE
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
    pocVisible: frvpRenderModeShowsLine(pocMode),
    valueAreaVisible: frvpRenderModeShowsLine(valueAreaMode),
  })

  const developingLines = params.developing
    ? buildFixedRangeVolumeProfileDevelopingLines({
        developing: params.developing,
        valueAreaMode,
        pocMode,
        rangeStartX: range.left,
        rangeEndX: range.right,
        timeToX: params.fromTimeToCoordinate,
        priceToY: params.priceToY,
        pocStrokeStyle: params.pocStrokeStyle,
        pocLineWidthCssPx: params.pocLineWidthCssPx,
        pocLineDash: params.pocLineDash,
        vahStrokeStyle: params.vahStrokeStyle,
        vahLineWidthCssPx: params.vahLineWidthCssPx,
        vahLineDash: params.vahLineDash,
        valStrokeStyle: params.valStrokeStyle,
        valLineWidthCssPx: params.valLineWidthCssPx,
        valLineDash: params.valLineDash,
      })
    : []

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
    developingLines,
    endpointHandles,
  }
}

export type FixedRangeVolumeProfileDrawStyleInput =
  FixedRangeVolumeProfileLevelLineStyles & FixedRangeVolumeProfileHistogramStyleInput

export function buildFixedRangeVolumeProfileDrawModels(params: {
  instances: readonly {
    id: string
    fromTime: number
    toTime: number
    enabled: boolean
    extendRight?: boolean
    locked?: boolean
    valueAreaMode?: FrvpLevelRenderMode
    pocMode?: FrvpLevelRenderMode
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
  /**
   * Developing samples per instance. Only the render path passes this; the
   * hit-test/arbitration callers omit it so pointer moves never build step
   * geometry, and hit testing stays exactly the flat lines + histogram rows.
   */
  developingSamplesById?: ReadonlyMap<string, readonly FixedRangeVolumeProfileDevelopingSample[]>
  /** Visible time window used to bound the developing step walk. */
  developingVisibleTimeRange?: FrvpDevelopingVisibleTimeRange | null
}): FixedRangeVolumeProfileInstanceDrawModel[] {
  const models: FixedRangeVolumeProfileInstanceDrawModel[] = []
  const liveRightEdge = params.liveRightEdge ?? null
  for (const instance of params.instances) {
    if (!instance.enabled) continue
    const ready = params.readyById.get(instance.id)
    if (!ready) continue
    const styles = params.styleForInstance(instance.id)
    const developingSamples = params.developingSamplesById?.get(instance.id)
    const developing =
      developingSamples && developingSamples.length > 0
        ? {
            samples: developingSamples,
            visibleTimeRange: params.developingVisibleTimeRange ?? null,
          }
        : null
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
      valueAreaMode: frvpInstanceValueAreaMode(instance),
      pocMode: frvpInstancePocMode(instance),
      developing,
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
