import type { CanvasRenderingTarget2D } from 'fancy-canvas'
import {
  PriceScaleMode,
  type AutoscaleInfo,
  type IChartApi,
  type IPrimitivePaneRenderer,
  type IPrimitivePaneView,
  type ISeriesApi,
  type ISeriesPrimitive,
  type Logical,
  type PrimitiveHoveredItem,
  type SeriesType,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import {
  buildRollingVwapBandDrawModels,
  emptyRollingVwapBandDrawModels,
  hitTestRollingVwapBandOutlineModels,
  resolveRollingVwapBandProjection,
  rollingVwapBandAutoscaleRange,
  type RollingVwapBandDrawModels,
  type RollingVwapBandFillContour,
  type RollingVwapBandHaloStroke,
  type RollingVwapBandOutlineRun,
  type RollingVwapBandPairKey,
  type RollingVwapBandPart,
  type RollingVwapBandPriceMode,
  type RollingVwapBandPrimitiveStyle,
  type RollingVwapBandVisibleWindow,
} from './rollingVwapBandRenderGeometry.ts'
import {
  OVERLAY_SELECTION_HALO_ALPHA,
  overlaySelectionHaloWidth,
} from './overlayIndicatorSelectionHalo.ts'
import type { RollingVwapPoint } from './rollingVwap.ts'

/**
 * One official series primitive per Rolling VWAP instance (#262).
 *
 * The native centre `LineSeries` stays attached for series identity, the
 * last-value label, the price line and existing native behavior. The six
 * deviation-band outlines and the three band fills move into this primitive, so
 * one data update costs ONE native series rebuild instead of seven. Fills paint
 * at `'bottom'`, outlines at `'normal'`, and the selection halo at `'top'`, the
 * same visual layers the native series/fill primitives used.
 *
 * Redraw lifecycle (docs/CHART-OBJECT-STANDARD.md#series-primitive-redraw-lifecycle-must):
 * - `updateAllViews()` is view-only and never requests another update;
 * - every external setter (`set*`, data update, attach) requests exactly one
 *   update through `requestUpdate()`;
 * - `detached()` clears the chart/series/request references, so disposal can
 *   never schedule a later frame.
 */

export type RollingVwapBandSeriesPrimitiveContext = {
  points: readonly RollingVwapPoint[]
  /** `false` while the instance is disabled or unsupported on the interval. */
  visible: boolean
  /** Per band-pair visibility from the instance multipliers. */
  bandVisible: Record<RollingVwapBandPairKey, boolean>
  style: RollingVwapBandPrimitiveStyle
  /** Transient chart-chrome selection. Never persisted. */
  haloPart: RollingVwapBandPart | null
}

export type RollingVwapBandPrimitiveStats = {
  /** Library-driven view rebuild passes (`updateAllViews`). */
  rebuilds: number
  /** Explicit external invalidations requested by this primitive. */
  invalidations: number
  /** Source samples examined by the most recent rebuild. */
  visitedPoints: number
  outlineRuns: number
  fillContours: number
  haloStrokes: number
}

/** No band pair is visible until the instance's multipliers enable it. */
export const EMPTY_ROLLING_VWAP_BAND_VISIBILITY: Record<RollingVwapBandPairKey, boolean> = {
  band1: false,
  band2: false,
  band3: false,
}

function numericTime(time: Time | null | undefined): number | null {
  return typeof time === 'number' && Number.isFinite(time) ? time : null
}

function resolvePriceMode(series: ISeriesApi<SeriesType, Time>): RollingVwapBandPriceMode {
  const mode = series.priceScale().options().mode
  if (mode === PriceScaleMode.Percentage) return 'percentage'
  if (mode === PriceScaleMode.IndexedTo100) return 'indexed-to-100'
  return 'absolute'
}

function visibleWindowFromChart(chart: IChartApi): RollingVwapBandVisibleWindow | null {
  const range = chart.timeScale().getVisibleRange()
  const fromTime = numericTime(range?.from)
  const toTime = numericTime(range?.to)
  if (fromTime === null || toTime === null) return null
  return { fromTime, toTime }
}

function buildRollingVwapBandModelsForChart(
  chart: IChartApi,
  series: ISeriesApi<SeriesType, Time>,
  context: RollingVwapBandSeriesPrimitiveContext,
): RollingVwapBandDrawModels {
  if (!context.visible || context.points.length === 0) {
    return emptyRollingVwapBandDrawModels()
  }
  const visibleWindow = visibleWindowFromChart(chart)
  if (visibleWindow === null) {
    return emptyRollingVwapBandDrawModels()
  }

  const mode = resolvePriceMode(series)
  const projection = resolveRollingVwapBandProjection({
    mode,
    points: context.points,
    fromTime: visibleWindow.fromTime,
  })

  const timeScale = chart.timeScale()
  const models = buildRollingVwapBandDrawModels({
    points: context.points,
    visibleWindow,
    visible: context.visible,
    bandVisible: context.bandVisible,
    style: context.style,
    haloPart:
      context.haloPart === 'center' || context.haloPart === null
        ? null
        : context.haloPart,
    barSpacing: timeScale.options().barSpacing,
    timeToX: (time) => {
      const coordinate = timeScale.timeToCoordinate(time as UTCTimestamp)
      return coordinate === null ? null : coordinate
    },
    // The geometry already projected this value through the band's own first
    // visible base, so the native conversion through the centre base is final.
    outlinePriceToY: (_key, value) => series.priceToCoordinate(value),
    fillPriceToY: (value) => series.priceToCoordinate(value),
    projection,
  })

  return models
}

class RollingVwapBandFillRenderer implements IPrimitivePaneRenderer {
  private readonly _fills: readonly RollingVwapBandFillContour[]

  constructor(fills: readonly RollingVwapBandFillContour[]) {
    this._fills = fills
  }

  draw(target: CanvasRenderingTarget2D): void {
    if (this._fills.length === 0) return
    target.useBitmapCoordinateSpace((scope) => {
      const { context, horizontalPixelRatio, verticalPixelRatio, bitmapSize } = scope
      context.save()
      context.beginPath()
      context.rect(0, 0, bitmapSize.width, bitmapSize.height)
      context.clip()

      for (const fill of this._fills) {
        const vertices = fill.polygon
        if (vertices.length < 6) continue
        context.beginPath()
        for (let index = 0; index < vertices.length; index += 2) {
          const x = Math.round(vertices[index] * horizontalPixelRatio)
          const y = Math.round(vertices[index + 1] * verticalPixelRatio)
          if (index === 0) {
            context.moveTo(x, y)
          } else {
            context.lineTo(x, y)
          }
        }
        context.closePath()
        context.fillStyle = fill.fillStyle
        context.fill()
      }

      context.restore()
    })
  }
}

/**
 * Native line stying parity: butt caps, round joins, line width scaled by the
 * vertical pixel ratio, and the library's dotted pattern `[width, width]`.
 */
class RollingVwapBandOutlineRenderer implements IPrimitivePaneRenderer {
  private readonly _runs: readonly RollingVwapBandOutlineRun[]

  constructor(runs: readonly RollingVwapBandOutlineRun[]) {
    this._runs = runs
  }

  draw(target: CanvasRenderingTarget2D): void {
    if (this._runs.length === 0) return
    target.useBitmapCoordinateSpace((scope) => {
      const { context, horizontalPixelRatio, verticalPixelRatio, bitmapSize } = scope
      context.save()
      context.beginPath()
      context.rect(0, 0, bitmapSize.width, bitmapSize.height)
      context.clip()
      context.lineCap = 'butt'
      context.lineJoin = 'round'

      for (const run of this._runs) {
        if (run.points.length < 2) continue
        const width = Math.max(1, run.style.widthPx * verticalPixelRatio)
        context.beginPath()
        for (let index = 0; index < run.points.length; index += 1) {
          const x = run.points[index].x * horizontalPixelRatio
          const y = run.points[index].y * verticalPixelRatio
          if (index === 0) {
            context.moveTo(x, y)
          } else {
            context.lineTo(x, y)
          }
        }
        context.lineWidth = width
        context.setLineDash(run.style.lineStyle === 'dotted' ? [width, width] : [])
        context.strokeStyle = run.style.color
        context.stroke()
      }

      context.restore()
    })
  }
}

/** Same halo language as every other overlay indicator: wider, 30% alpha. */
class RollingVwapBandHaloRenderer implements IPrimitivePaneRenderer {
  private readonly _strokes: readonly RollingVwapBandHaloStroke[]

  constructor(strokes: readonly RollingVwapBandHaloStroke[]) {
    this._strokes = strokes
  }

  draw(target: CanvasRenderingTarget2D): void {
    if (this._strokes.length === 0) return
    target.useBitmapCoordinateSpace((scope) => {
      const { context, horizontalPixelRatio, verticalPixelRatio, bitmapSize } = scope
      context.save()
      context.beginPath()
      context.rect(0, 0, bitmapSize.width, bitmapSize.height)
      context.clip()
      context.globalAlpha = OVERLAY_SELECTION_HALO_ALPHA
      context.lineJoin = 'round'
      context.lineCap = 'round'

      for (const stroke of this._strokes) {
        if (stroke.points.length < 2) continue
        context.beginPath()
        for (let index = 0; index < stroke.points.length; index += 1) {
          const x = stroke.points[index].x * horizontalPixelRatio
          const y = stroke.points[index].y * verticalPixelRatio
          if (index === 0) {
            context.moveTo(x, y)
          } else {
            context.lineTo(x, y)
          }
        }
        context.lineWidth = overlaySelectionHaloWidth(stroke.widthPx) * verticalPixelRatio
        context.strokeStyle = stroke.color
        context.stroke()
      }

      context.restore()
    })
  }
}

class RollingVwapBandFillPaneView implements IPrimitivePaneView {
  private readonly _getModels: () => RollingVwapBandDrawModels

  constructor(getModels: () => RollingVwapBandDrawModels) {
    this._getModels = getModels
  }

  zOrder(): 'bottom' {
    return 'bottom'
  }

  renderer(): IPrimitivePaneRenderer | null {
    const fills = this._getModels().fills
    return fills.length === 0 ? null : new RollingVwapBandFillRenderer(fills)
  }
}

class RollingVwapBandOutlinePaneView implements IPrimitivePaneView {
  private readonly _getModels: () => RollingVwapBandDrawModels

  constructor(getModels: () => RollingVwapBandDrawModels) {
    this._getModels = getModels
  }

  zOrder(): 'normal' {
    return 'normal'
  }

  renderer(): IPrimitivePaneRenderer | null {
    const outlines = this._getModels().outlines
    return outlines.length === 0 ? null : new RollingVwapBandOutlineRenderer(outlines)
  }
}

class RollingVwapBandHaloPaneView implements IPrimitivePaneView {
  private readonly _getModels: () => RollingVwapBandDrawModels

  constructor(getModels: () => RollingVwapBandDrawModels) {
    this._getModels = getModels
  }

  zOrder(): 'top' {
    return 'top'
  }

  renderer(): IPrimitivePaneRenderer | null {
    const halo = this._getModels().halo
    return halo.length === 0 ? null : new RollingVwapBandHaloRenderer(halo)
  }
}

export class RollingVwapBandSeriesPrimitive implements ISeriesPrimitive<Time> {
  private _chart: IChartApi | null = null
  private _series: ISeriesApi<SeriesType, Time> | null = null
  private _requestUpdate: (() => void) | null = null
  private readonly _getContext: () => RollingVwapBandSeriesPrimitiveContext
  private _models: RollingVwapBandDrawModels = emptyRollingVwapBandDrawModels()
  private readonly _views: readonly IPrimitivePaneView[]
  private readonly _stats: RollingVwapBandPrimitiveStats = {
    rebuilds: 0,
    invalidations: 0,
    visitedPoints: 0,
    outlineRuns: 0,
    fillContours: 0,
    haloStrokes: 0,
  }

  constructor(getContext: () => RollingVwapBandSeriesPrimitiveContext) {
    this._getContext = getContext
    this._views = [
      new RollingVwapBandFillPaneView(() => this._models),
      new RollingVwapBandOutlinePaneView(() => this._models),
      new RollingVwapBandHaloPaneView(() => this._models),
    ]
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this._views
  }

  stats(): RollingVwapBandPrimitiveStats {
    return { ...this._stats }
  }

  /**
   * Library-driven view update. The chart is already updating and will paint
   * after this callback, so it must not request another update.
   */
  updateAllViews(): void {
    const chart = this._chart
    const series = this._series
    this._stats.rebuilds += 1
    if (!chart || !series) {
      this._models = emptyRollingVwapBandDrawModels()
      return
    }
    this._models = buildRollingVwapBandModelsForChart(chart, series, this._getContext())
    this._stats.visitedPoints = this._models.visitedPoints
    this._stats.outlineRuns = this._models.outlines.length
    this._stats.fillContours = this._models.fills.length
    this._stats.haloStrokes = this._models.halo.length
  }

  autoscaleInfo(startTimePoint: Logical, endTimePoint: Logical): AutoscaleInfo | null {
    const series = this._series
    const chart = this._chart
    const context = this._getContext()
    if (!series || !chart || !context.visible || context.points.length === 0) return null

    const bars = series.barsInLogicalRange({
      from: startTimePoint,
      to: endTimePoint,
    })
    const fromTime = numericTime(bars?.from)
    const toTime = numericTime(bars?.to)
    if (fromTime === null || toTime === null) return null

    const projection = resolveRollingVwapBandProjection({
      mode: resolvePriceMode(series),
      points: context.points,
      fromTime,
    })
    const priceRange = rollingVwapBandAutoscaleRange({
      points: context.points,
      visibleWindow: { fromTime, toTime },
      bandVisible: context.bandVisible,
      projection,
    })
    return priceRange === null ? null : { priceRange }
  }

  /**
   * Hit testing uses the exact geometry the outline view draws, rebuilt from
   * the current transforms (no cross-frame coordinate cache). The library calls
   * this on pointer move; the shared chart-object hit test calls
   * `hitTestBandAt` through the attachment for selection and settings.
   */
  hitTest(x: number, y: number): PrimitiveHoveredItem | null {
    const hit = this.hitTestBandAt(x, y)
    if (hit === null) return null
    return {
      externalId: hit.band,
      zOrder: 'normal',
      cursorStyle: 'pointer',
      hitTestPriority: 1,
      distance: hit.distance,
    }
  }

  hitTestBandAt(
    x: number,
    y: number,
  ): { band: RollingVwapBandPairKey; distance: number } | null {
    const chart = this._chart
    const series = this._series
    if (!chart || !series) return null
    const context = this._getContext()
    if (!context.visible || context.points.length === 0) return null
    const models = buildRollingVwapBandModelsForChart(chart, series, context)
    return hitTestRollingVwapBandOutlineModels(models, x, y)
  }

  /**
   * External invalidation: data, style, visibility, public update and
   * attachment initialization. The chart cannot infer these context changes,
   * so it must be asked for another update; that library update rebuilds the
   * bounded geometry against the final transforms.
   */
  invalidate(): void {
    this._stats.invalidations += 1
    this._requestUpdate?.()
  }

  attached(param: {
    chart: IChartApi
    series: ISeriesApi<SeriesType, Time>
    requestUpdate: () => void
  }): void {
    this._chart = param.chart
    this._series = param.series
    this._requestUpdate = param.requestUpdate
    this.invalidate()
  }

  detached(): void {
    this._chart = null
    this._series = null
    this._requestUpdate = null
    this._models = emptyRollingVwapBandDrawModels()
  }
}

export type RollingVwapBandSeriesAttachment = {
  /** Adopts the full chronological source (history pages included). */
  setPoints: (points: readonly RollingVwapPoint[]) => void
  /** Patches only the latest point; a new bar appends. */
  updateLastPoint: (point: RollingVwapPoint) => void
  /** Instance visibility plus per-band multiplier visibility; one invalidation. */
  setVisibility: (
    visible: boolean,
    bandVisible: Record<RollingVwapBandPairKey, boolean>,
  ) => void
  setStyle: (style: RollingVwapBandPrimitiveStyle) => void
  getStyle: () => RollingVwapBandPrimitiveStyle
  /** Read-only snapshot of the adopted chronological source (diagnostics). */
  getPoints: () => readonly RollingVwapPoint[]
  /** `null` clears the band halo; `center` leaves it to the native centre halo. */
  setHaloPart: (part: RollingVwapBandPart | null) => void
  invalidate: () => void
  hitTestBandAt: (
    x: number,
    y: number,
  ) => { band: RollingVwapBandPairKey; distance: number } | null
  stats: () => RollingVwapBandPrimitiveStats
  dispose: () => void
}

export function attachRollingVwapBandSeriesPrimitive(
  series: ISeriesApi<'Line', Time>,
  initialContext: RollingVwapBandSeriesPrimitiveContext,
): RollingVwapBandSeriesAttachment {
  let points = [...initialContext.points]
  let context: RollingVwapBandSeriesPrimitiveContext = { ...initialContext, points }
  const primitive = new RollingVwapBandSeriesPrimitive(() => context)
  series.attachPrimitive(primitive)

  const invalidate = () => primitive.invalidate()

  return {
    setPoints: (nextPoints) => {
      points = [...nextPoints]
      context = { ...context, points }
      invalidate()
    },
    updateLastPoint: (point) => {
      const lastIndex = points.length - 1
      if (lastIndex < 0) {
        points.push(point)
      } else if (points[lastIndex].time === point.time) {
        points[lastIndex] = point
      } else if (point.time > points[lastIndex].time) {
        points.push(point)
      } else {
        return
      }
      context = { ...context, points }
      invalidate()
    },
    setVisibility: (visible, bandVisible) => {
      if (
        context.visible === visible &&
        context.bandVisible.band1 === bandVisible.band1 &&
        context.bandVisible.band2 === bandVisible.band2 &&
        context.bandVisible.band3 === bandVisible.band3
      ) {
        return
      }
      context = { ...context, visible, bandVisible: { ...bandVisible } }
      invalidate()
    },
    setStyle: (style) => {
      context = { ...context, style }
      invalidate()
    },
    getStyle: () => context.style,
    getPoints: () => points,
    setHaloPart: (part) => {
      if (context.haloPart === part) return
      context = { ...context, haloPart: part }
      invalidate()
    },
    invalidate,
    hitTestBandAt: (x, y) => primitive.hitTestBandAt(x, y),
    stats: () => primitive.stats(),
    dispose: () => {
      series.detachPrimitive(primitive)
      primitive.detached()
    },
  }
}
