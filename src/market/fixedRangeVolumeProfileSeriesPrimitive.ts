import type { CanvasRenderingTarget2D } from 'fancy-canvas'
import type {
  IChartApi,
  ISeriesApi,
  ISeriesPrimitive,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  SeriesType,
  Time,
  UTCTimestamp,
} from 'lightweight-charts'
import {
  buildFixedRangeVolumeProfileDrawModels,
  FRVP_LEVEL_LINE_WIDTH_CSS_PX,
  type FixedRangeVolumeProfileInstanceDrawModel,
} from './fixedRangeVolumeProfileRenderGeometry.ts'
import type { FixedRangeVolumeProfileInstance } from './fixedRangeVolumeProfileInstances.ts'
import type { FixedRangeVolumeProfileResult } from './fixedRangeVolumeProfile.ts'
import type { FixedRangeVolumeProfileRuntimeSnapshot } from './fixedRangeVolumeProfileRuntimeTypes.ts'

export type FixedRangeVolumeProfileSeriesPrimitiveContext = {
  instances: readonly FixedRangeVolumeProfileInstance[]
  runtimeById: FixedRangeVolumeProfileRuntimeSnapshot
}

function bitmapBox(start: number, end: number, pixelRatio: number): { position: number; length: number } {
  const position = Math.round(Math.min(start, end) * pixelRatio)
  const length = Math.round(Math.abs(end - start) * pixelRatio)
  return { position, length }
}

class FixedRangeVolumeProfileRenderer implements IPrimitivePaneRenderer {
  private readonly _models: FixedRangeVolumeProfileInstanceDrawModel[]

  constructor(models: FixedRangeVolumeProfileInstanceDrawModel[]) {
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
        for (const row of model.rows) {
          const rowTop = bitmapBox(row.top, row.bottom, verticalPixelRatio)
          const rowRightBitmap = Math.round(row.right * horizontalPixelRatio)
          const downWidth = Math.round(row.downWidth * horizontalPixelRatio)
          const upWidth = Math.round(row.upWidth * horizontalPixelRatio)
          const downLeft = rowRightBitmap - downWidth - upWidth

          if (downWidth > 0) {
            context.fillStyle = row.downColor
            context.fillRect(downLeft, rowTop.position, downWidth, rowTop.length)
          }
          if (upWidth > 0) {
            context.fillStyle = row.upColor
            context.fillRect(rowRightBitmap - upWidth, rowTop.position, upWidth, rowTop.length)
          }
        }

        for (const line of model.lines) {
          const y = Math.round(line.y * verticalPixelRatio)
          const x1 = Math.round(line.x1 * horizontalPixelRatio)
          const x2 = Math.round(line.x2 * horizontalPixelRatio)
          context.save()
          context.beginPath()
          context.setLineDash(line.lineDash.map((value) => value * horizontalPixelRatio))
          context.strokeStyle = line.strokeStyle
          context.lineWidth = FRVP_LEVEL_LINE_WIDTH_CSS_PX * horizontalPixelRatio
          context.moveTo(x1, y)
          context.lineTo(x2, y)
          context.stroke()
          context.restore()
        }
      }

      context.restore()
    })
  }
}

class FixedRangeVolumeProfilePaneView implements IPrimitivePaneView {
  private readonly _getChart: () => IChartApi | null
  private readonly _getSeries: () => ISeriesApi<SeriesType, Time> | null
  private readonly _getContext: () => FixedRangeVolumeProfileSeriesPrimitiveContext
  private _models: FixedRangeVolumeProfileInstanceDrawModel[] = []

  constructor(
    getChart: () => IChartApi | null,
    getSeries: () => ISeriesApi<SeriesType, Time> | null,
    getContext: () => FixedRangeVolumeProfileSeriesPrimitiveContext,
  ) {
    this._getChart = getChart
    this._getSeries = getSeries
    this._getContext = getContext
  }

  zOrder(): 'normal' {
    return 'normal'
  }

  update(): void {
    const chart = this._getChart()
    const series = this._getSeries()
    if (!chart || !series) {
      this._models = []
      return
    }

    const context = this._getContext()
    const readyById = new Map<string, { profile: FixedRangeVolumeProfileResult }>()
    for (const [id, state] of Object.entries(context.runtimeById)) {
      if (state.status === 'ready') {
        readyById.set(id, { profile: state.profile })
      }
    }

    const timeScale = chart.timeScale()
    const barSpacing = timeScale.options().barSpacing

    this._models = buildFixedRangeVolumeProfileDrawModels({
      instances: context.instances,
      readyById,
      barSpacing,
      timeToCoordinate: (time) => timeScale.timeToCoordinate(time as UTCTimestamp),
      priceToY: (price) => series.priceToCoordinate(price),
    })
  }

  renderer(): IPrimitivePaneRenderer | null {
    if (this._models.length === 0) return null
    return new FixedRangeVolumeProfileRenderer(this._models)
  }
}

export class FixedRangeVolumeProfileSeriesPrimitive implements ISeriesPrimitive<Time> {
  private _chart: IChartApi | null = null
  private _series: ISeriesApi<SeriesType, Time> | null = null
  private _requestUpdate: (() => void) | null = null
  private _getContext: () => FixedRangeVolumeProfileSeriesPrimitiveContext = () => ({
    instances: [],
    runtimeById: {},
  })
  private readonly _view: FixedRangeVolumeProfilePaneView

  constructor(getContext: () => FixedRangeVolumeProfileSeriesPrimitiveContext) {
    this._getContext = getContext
    this._view = new FixedRangeVolumeProfilePaneView(
      () => this._chart,
      () => this._series,
      () => this._getContext(),
    )
  }

  setContextProvider(getContext: () => FixedRangeVolumeProfileSeriesPrimitiveContext): void {
    this._getContext = getContext
    this.updateAllViews()
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

export function attachFixedRangeVolumeProfileSeriesPrimitive(
  series: ISeriesApi<'Candlestick', Time>,
  getContext: () => FixedRangeVolumeProfileSeriesPrimitiveContext,
): {
  primitive: FixedRangeVolumeProfileSeriesPrimitive
  dispose: () => void
  update: () => void
} {
  const primitive = new FixedRangeVolumeProfileSeriesPrimitive(getContext)
  series.attachPrimitive(primitive)
  return {
    primitive,
    update: () => primitive.updateAllViews(),
    dispose: () => {
      series.detachPrimitive(primitive)
      primitive.detached()
    },
  }
}
