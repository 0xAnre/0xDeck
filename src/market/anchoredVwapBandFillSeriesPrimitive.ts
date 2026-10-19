import type { CanvasRenderingTarget2D } from 'fancy-canvas'
import type {
  AutoscaleInfo,
  IChartApi,
  ISeriesApi,
  ISeriesPrimitive,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  Logical,
  SeriesType,
  Time,
} from 'lightweight-charts'
import {
  anchoredVwapBandFillPriceRange,
  buildAnchoredVwapBandFillDrawModels,
  type AnchoredVwapBandFillDrawModel,
  type AnchoredVwapBandFillPairGeometry,
  type AnchoredVwapBandFillPoint,
} from './anchoredVwapBandFillRenderGeometry.ts'

export type AnchoredVwapBandFillPairContext = {
  id: string
  points: readonly AnchoredVwapBandFillPoint[]
  visible: boolean
  fillStyle: string
}

export type AnchoredVwapBandFillSeriesPrimitiveContext = {
  pairs: readonly AnchoredVwapBandFillPairContext[]
}

function unixTime(time: Time | undefined): number | null {
  return typeof time === 'number' && Number.isFinite(time) ? time : null
}

function visibleFillGeometries(
  context: AnchoredVwapBandFillSeriesPrimitiveContext,
): AnchoredVwapBandFillPairGeometry[] {
  return context.pairs
    .filter((pair) => pair.visible && pair.points.length > 0)
    .map((pair) => ({ points: pair.points, fillStyle: pair.fillStyle }))
}

class AnchoredVwapBandFillRenderer implements IPrimitivePaneRenderer {
  private readonly _models: AnchoredVwapBandFillDrawModel[]

  constructor(models: AnchoredVwapBandFillDrawModel[]) {
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

class AnchoredVwapBandFillPaneView implements IPrimitivePaneView {
  private readonly _getChart: () => IChartApi | null
  private readonly _getSeries: () => ISeriesApi<SeriesType, Time> | null
  private readonly _getContext: () => AnchoredVwapBandFillSeriesPrimitiveContext
  private _models: AnchoredVwapBandFillDrawModel[] = []

  constructor(
    getChart: () => IChartApi | null,
    getSeries: () => ISeriesApi<SeriesType, Time> | null,
    getContext: () => AnchoredVwapBandFillSeriesPrimitiveContext,
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
    if (!chart || !series) {
      this._models = []
      return
    }

    const pairs = visibleFillGeometries(context)
    if (pairs.length === 0) {
      this._models = []
      return
    }

    const timeScale = chart.timeScale()
    this._models = buildAnchoredVwapBandFillDrawModels({
      pairs,
      barSpacing: timeScale.options().barSpacing,
      timeToCoordinate: (time) => timeScale.timeToCoordinate(time),
      priceToY: (price) => series.priceToCoordinate(price),
    })
  }

  renderer(): IPrimitivePaneRenderer | null {
    if (this._models.length === 0) return null
    return new AnchoredVwapBandFillRenderer(this._models)
  }
}

export class AnchoredVwapBandFillSeriesPrimitive implements ISeriesPrimitive<Time> {
  private _chart: IChartApi | null = null
  private _series: ISeriesApi<SeriesType, Time> | null = null
  private _requestUpdate: (() => void) | null = null
  private _getContext: () => AnchoredVwapBandFillSeriesPrimitiveContext = () => ({ pairs: [] })
  private readonly _view: AnchoredVwapBandFillPaneView

  constructor(getContext: () => AnchoredVwapBandFillSeriesPrimitiveContext) {
    this._getContext = getContext
    this._view = new AnchoredVwapBandFillPaneView(
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
    if (!series) return null
    const pairs = visibleFillGeometries(context)
    if (pairs.length === 0) return null

    const bars = series.barsInLogicalRange({
      from: startTimePoint,
      to: endTimePoint,
    })
    const fromTime = unixTime(bars?.from)
    const toTime = unixTime(bars?.to)
    if (fromTime === null || toTime === null) return null

    const priceRange = anchoredVwapBandFillPriceRange(pairs, fromTime, toTime)
    if (!priceRange) return null
    return { priceRange }
  }

  updateAllViews(): void {
    this._view.update()
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
    this.updateAllViews()
  }

  detached(): void {
    this._chart = null
    this._series = null
    this._requestUpdate = null
  }
}

export type AnchoredVwapBandFillSeriesAttachment = {
  setPairs: (pairs: readonly AnchoredVwapBandFillPairContext[]) => void
  update: () => void
  dispose: () => void
}

export function attachAnchoredVwapBandFillSeriesPrimitive(
  series: ISeriesApi<'Line', Time>,
  initialContext: AnchoredVwapBandFillSeriesPrimitiveContext,
): AnchoredVwapBandFillSeriesAttachment {
  let context = initialContext
  const primitive = new AnchoredVwapBandFillSeriesPrimitive(() => context)
  series.attachPrimitive(primitive)

  return {
    setPairs: (pairs) => {
      context = { pairs }
      primitive.updateAllViews()
    },
    update: () => {
      primitive.updateAllViews()
    },
    dispose: () => {
      series.detachPrimitive(primitive)
      primitive.detached()
    },
  }
}
