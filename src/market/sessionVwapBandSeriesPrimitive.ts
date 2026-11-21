import type { CanvasRenderingTarget2D } from 'fancy-canvas'
import type {
  AutoscaleInfo,
  IChartApi,
  ISeriesApi,
  ISeriesPrimitive,
  ITimeScaleApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  Logical,
  SeriesType,
  Time,
} from 'lightweight-charts'
import {
  buildSessionVwapBandDrawModels,
  sessionVwapBandPriceRange,
  type SessionVwapBandDrawModel,
  type SessionVwapBandPoint,
  type SessionVwapBandVisibleWindow,
} from './sessionVwapBandRenderGeometry.ts'

export type SessionVwapBandSeriesPrimitiveContext = {
  points: readonly SessionVwapBandPoint[]
  visible: boolean
  /** Resolved canvas fill style; independent from the VWAP line styling. */
  fillStyle: string
}

function unixTime(time: Time | undefined): number | null {
  return typeof time === 'number' && Number.isFinite(time) ? time : null
}

/**
 * Visible bar-time window from the chart's own time scale. The implementation
 * never converts data-array offsets to logical indices or derives time from
 * the wall clock; the bar times are the series times the time scale reports.
 */
function visibleWindowFromTimeScale(
  timeScale: ITimeScaleApi<Time>,
): SessionVwapBandVisibleWindow | null {
  const range = timeScale.getVisibleRange()
  const fromTime = unixTime(range?.from)
  const toTime = unixTime(range?.to)
  if (fromTime === null || toTime === null) return null
  return { fromTime, toTime }
}

class SessionVwapBandRenderer implements IPrimitivePaneRenderer {
  private readonly _models: SessionVwapBandDrawModel[]

  constructor(models: SessionVwapBandDrawModel[]) {
    this._models = models
  }

  draw(target: CanvasRenderingTarget2D): void {
    if (this._models.length === 0) return

    target.useBitmapCoordinateSpace((scope) => {
      const { context, horizontalPixelRatio, verticalPixelRatio, bitmapSize } = scope
      context.save()
      context.beginPath()
      context.rect(0, 0, bitmapSize.width, bitmapSize.height)
      context.clip()

      for (const model of this._models) {
        const vertices = model.polygon
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
        context.fillStyle = model.fillStyle
        context.fill()
      }

      context.restore()
    })
  }
}

class SessionVwapBandPaneView implements IPrimitivePaneView {
  private readonly _getChart: () => IChartApi | null
  private readonly _getSeries: () => ISeriesApi<SeriesType, Time> | null
  private readonly _getContext: () => SessionVwapBandSeriesPrimitiveContext
  private _models: SessionVwapBandDrawModel[] = []

  constructor(
    getChart: () => IChartApi | null,
    getSeries: () => ISeriesApi<SeriesType, Time> | null,
    getContext: () => SessionVwapBandSeriesPrimitiveContext,
  ) {
    this._getChart = getChart
    this._getSeries = getSeries
    this._getContext = getContext
  }

  zOrder(): 'bottom' {
    return 'bottom'
  }

  update(): void {
    const chart = this._getChart()
    const series = this._getSeries()
    const context = this._getContext()
    if (!chart || !series || !context.visible || context.points.length === 0) {
      this._models = []
      return
    }

    const timeScale = chart.timeScale()
    const visibleWindow = visibleWindowFromTimeScale(timeScale)
    if (visibleWindow === null) {
      this._models = []
      return
    }

    this._models = buildSessionVwapBandDrawModels({
      points: context.points,
      visibleWindow,
      barSpacing: timeScale.options().barSpacing,
      fillStyle: context.fillStyle,
      timeToCoordinate: (time) => timeScale.timeToCoordinate(time),
      priceToY: (price) => series.priceToCoordinate(price),
    })
  }

  renderer(): IPrimitivePaneRenderer | null {
    if (this._models.length === 0) return null
    return new SessionVwapBandRenderer(this._models)
  }
}

export class SessionVwapBandSeriesPrimitive implements ISeriesPrimitive<Time> {
  private _chart: IChartApi | null = null
  private _series: ISeriesApi<SeriesType, Time> | null = null
  private _requestUpdate: (() => void) | null = null
  private _getContext: () => SessionVwapBandSeriesPrimitiveContext = () => ({
    points: [],
    visible: false,
    fillStyle: 'transparent',
  })
  private readonly _view: SessionVwapBandPaneView

  constructor(getContext: () => SessionVwapBandSeriesPrimitiveContext) {
    this._getContext = getContext
    this._view = new SessionVwapBandPaneView(
      () => this._chart,
      () => this._series,
      () => this._getContext(),
    )
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this._view]
  }

  autoscaleInfo(startTimePoint: Logical, endTimePoint: Logical): AutoscaleInfo | null {
    const series = this._series
    const context = this._getContext()
    if (!series || !context.visible || context.points.length === 0) return null

    const bars = series.barsInLogicalRange({
      from: startTimePoint,
      to: endTimePoint,
    })
    const fromTime = unixTime(bars?.from)
    const toTime = unixTime(bars?.to)
    if (fromTime === null || toTime === null) return null

    const priceRange = sessionVwapBandPriceRange(context.points, fromTime, toTime)
    if (!priceRange) return null
    return { priceRange }
  }

  /**
   * Library-driven view update. The chart is already updating and will paint
   * after this callback, so it must not request another update.
   */
  updateAllViews(): void {
    this._view.update()
  }

  /**
   * External invalidation: data, style, visibility, public `update()` and
   * attachment initialization. The chart cannot infer these context changes,
   * so it must be asked for another update; that library update rebuilds the
   * bounded geometry against the final transforms, coalescing several setters
   * made before the next paint.
   */
  invalidate(): void {
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
  }
}

export type SessionVwapBandSeriesAttachment = {
  updateBandData: (points: readonly SessionVwapBandPoint[]) => void
  setBandVisible: (visible: boolean) => void
  setFillStyle: (fillStyle: string) => void
  update: () => void
  dispose: () => void
}

export function attachSessionVwapBandSeriesPrimitive(
  series: ISeriesApi<'Line', Time>,
  initialContext: SessionVwapBandSeriesPrimitiveContext,
): SessionVwapBandSeriesAttachment {
  let context = initialContext
  const primitive = new SessionVwapBandSeriesPrimitive(() => context)
  series.attachPrimitive(primitive)

  return {
    updateBandData: (points) => {
      context = { ...context, points }
      primitive.invalidate()
    },
    setBandVisible: (visible) => {
      context = { ...context, visible }
      primitive.invalidate()
    },
    setFillStyle: (fillStyle) => {
      context = { ...context, fillStyle }
      primitive.invalidate()
    },
    update: () => {
      primitive.invalidate()
    },
    dispose: () => {
      series.detachPrimitive(primitive)
      primitive.detached()
    },
  }
}
