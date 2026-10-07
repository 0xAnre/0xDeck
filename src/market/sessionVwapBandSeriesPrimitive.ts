import type { CanvasRenderingTarget2D } from 'fancy-canvas'
import type {
  IChartApi,
  ISeriesApi,
  ISeriesPrimitive,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  SeriesType,
  Time,
} from 'lightweight-charts'
import { readRectangleFillStyle } from './rectangleColors.ts'
import {
  buildSessionVwapBandDrawModels,
  type SessionVwapBandDrawModel,
  type SessionVwapBandPoint,
} from './sessionVwapBandRenderGeometry.ts'

export type SessionVwapBandSeriesPrimitiveContext = {
  points: readonly SessionVwapBandPoint[]
  visible: boolean
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
    if (!chart || !series || !context.visible) {
      this._models = []
      return
    }

    const timeScale = chart.timeScale()
    this._models = buildSessionVwapBandDrawModels({
      points: context.points,
      barSpacing: timeScale.options().barSpacing,
      fillStyle: readRectangleFillStyle(),
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

export type SessionVwapBandSeriesAttachment = {
  updateBandData: (points: readonly SessionVwapBandPoint[]) => void
  setBandVisible: (visible: boolean) => void
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
      primitive.updateAllViews()
    },
    setBandVisible: (visible) => {
      context = { ...context, visible }
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
