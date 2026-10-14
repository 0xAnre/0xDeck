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
import {
  bandPairVisible,
} from './anchoredVwapDrawingChartSeries.ts'
import {
  anchoredVwapDrawingPointsToBandFillPoints,
  buildAnchoredVwapBandFillDrawModels,
  sliceAnchoredVwapDrawingPointsToVisibleRange,
  type AnchoredVwapBandFillDrawModel,
  type AnchoredVwapBandFillLowerKey,
  type AnchoredVwapBandFillUpperKey,
} from './anchoredVwapBandFillGeometry.ts'
import {
  evictCachedAnchoredVwapDrawingPointsForInstance,
  getCachedAnchoredVwapDrawingPointsForInstance,
} from './anchoredVwapDrawingPointsCache.ts'
import { anchoredVwapDrawingLineRgba } from './anchoredVwapDrawingSettings.ts'
import { anchorScreenYFromPoints } from './anchoredVwapDrawingHitTest.ts'
import type { AnchoredVwapDrawingInteractionState } from './anchoredVwapDrawingInteraction.ts'
import {
  isAnchoredVwapInstanceHidden,
  type AnchoredVwapInstance,
} from './anchoredVwapInstances.ts'
import { readLineHandleFillStyle } from './lineColors.ts'
import {
  buildRectangleChartTimeContext,
  resolveRectangleTimeToCoordinate,
} from './rectangleChartTime.ts'
import type { MarketCandle } from './types.ts'

export type AnchoredVwapDrawingPrimitiveContext = {
  instances: readonly AnchoredVwapInstance[]
  interaction: AnchoredVwapDrawingInteractionState
  candles: readonly MarketCandle[]
  intervalDurationSeconds: number
  lastBarUnixTime: number | null
}

const HANDLE_RADIUS_PX = 4

class AnchoredVwapHandleRenderer implements IPrimitivePaneRenderer {
  private readonly _handles: { x: number; y: number }[]
  private readonly _fillStyle: string

  constructor(handles: { x: number; y: number }[], fillStyle: string) {
    this._handles = handles
    this._fillStyle = fillStyle
  }

  draw(target: CanvasRenderingTarget2D): void {
    if (this._handles.length === 0) return
    target.useBitmapCoordinateSpace((scope) => {
      const { context, horizontalPixelRatio, verticalPixelRatio, bitmapSize } = scope
      context.save()
      context.beginPath()
      context.rect(0, 0, bitmapSize.width, bitmapSize.height)
      context.clip()
      for (const handle of this._handles) {
        const hx = Math.round(handle.x * horizontalPixelRatio)
        const hy = Math.round(handle.y * verticalPixelRatio)
        const radius = HANDLE_RADIUS_PX * horizontalPixelRatio
        context.beginPath()
        context.fillStyle = this._fillStyle
        context.arc(hx, hy, radius, 0, Math.PI * 2)
        context.fill()
      }
      context.restore()
    })
  }
}

class AnchoredVwapHandlePaneView implements IPrimitivePaneView {
  private readonly _getChart: () => IChartApi | null
  private readonly _getSeries: () => ISeriesApi<SeriesType, Time> | null
  private readonly _getContext: () => AnchoredVwapDrawingPrimitiveContext
  private _handles: { x: number; y: number }[] = []

  constructor(
    getChart: () => IChartApi | null,
    getSeries: () => ISeriesApi<SeriesType, Time> | null,
    getContext: () => AnchoredVwapDrawingPrimitiveContext,
  ) {
    this._getChart = getChart
    this._getSeries = getSeries
    this._getContext = getContext
  }

  zOrder(): 'top' {
    return 'top'
  }

  renderer(): IPrimitivePaneRenderer {
    return new AnchoredVwapHandleRenderer(this._handles, readLineHandleFillStyle())
  }

  update(): void {
    const chart = this._getChart()
    const series = this._getSeries()
    if (!chart || !series) {
      this._handles = []
      return
    }
    const ctx = this._getContext()
    const selectedId = ctx.interaction.selectedId
    if (!selectedId) {
      this._handles = []
      return
    }
    const instance = ctx.instances.find((item) => item.id === selectedId)
    if (!instance || isAnchoredVwapInstanceHidden(instance)) {
      this._handles = []
      return
    }
    const timeContext = buildRectangleChartTimeContext(
      chart,
      ctx.lastBarUnixTime,
      ctx.intervalDurationSeconds,
    )
    const anchorX = resolveRectangleTimeToCoordinate(
      chart,
      instance.anchorTime,
      'start',
      timeContext,
    )
    const points = getCachedAnchoredVwapDrawingPointsForInstance(ctx.candles, instance)
    const anchorY = anchorScreenYFromPoints(points, (price) => series.priceToCoordinate(price))
    if (anchorX === null || anchorY === null) {
      this._handles = []
      return
    }
    this._handles = [{ x: anchorX, y: anchorY }]
  }
}

const ANCHORED_VWAP_FILL_PAIRS: readonly {
  upper: AnchoredVwapBandFillUpperKey
  lower: AnchoredVwapBandFillLowerKey
  settingsKey: 'band1' | 'band2' | 'band3'
}[] = [
  { upper: 'upper1', lower: 'lower1', settingsKey: 'band1' },
  { upper: 'upper2', lower: 'lower2', settingsKey: 'band2' },
  { upper: 'upper3', lower: 'lower3', settingsKey: 'band3' },
]

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
  private readonly _getContext: () => AnchoredVwapDrawingPrimitiveContext
  private _models: AnchoredVwapBandFillDrawModel[] = []

  constructor(
    getChart: () => IChartApi | null,
    getSeries: () => ISeriesApi<SeriesType, Time> | null,
    getContext: () => AnchoredVwapDrawingPrimitiveContext,
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
    if (!chart || !series) {
      this._models = []
      return
    }
    const ctx = this._getContext()
    if (ctx.instances.length === 0) {
      this._models = []
      return
    }
    const timeContext = buildRectangleChartTimeContext(
      chart,
      ctx.lastBarUnixTime,
      ctx.intervalDurationSeconds,
    )
    const barSpacing = chart.timeScale().options().barSpacing
    const models: AnchoredVwapBandFillDrawModel[] = []
    for (const instance of ctx.instances) {
      if (isAnchoredVwapInstanceHidden(instance)) continue
      const allPoints = getCachedAnchoredVwapDrawingPointsForInstance(ctx.candles, instance)
      const points = sliceAnchoredVwapDrawingPointsToVisibleRange(chart, series, allPoints)
      if (points.length === 0) continue
      for (const pair of ANCHORED_VWAP_FILL_PAIRS) {
        const settings = instance.settings[pair.settingsKey]
        if (!bandPairVisible(true, settings.visible, settings.multiplier)) continue
        models.push(
          ...buildAnchoredVwapBandFillDrawModels({
            points: anchoredVwapDrawingPointsToBandFillPoints(points, pair.upper, pair.lower),
            barSpacing,
            fillStyle: anchoredVwapDrawingLineRgba(settings.fillColor, settings.fillOpacity),
            timeToCoordinate: (time) =>
              resolveRectangleTimeToCoordinate(chart, time, 'start', timeContext),
            priceToY: (price) => series.priceToCoordinate(price),
          }),
        )
      }
    }
    this._models = models
  }

  renderer(): IPrimitivePaneRenderer | null {
    if (this._models.length === 0) return null
    return new AnchoredVwapBandFillRenderer(this._models)
  }
}

/** z-order `bottom` fill between each visible band pair's upper/lower lines. */
export class AnchoredVwapBandFillSeriesPrimitive implements ISeriesPrimitive<Time> {
  private readonly _paneView: AnchoredVwapBandFillPaneView

  constructor(
    getChart: () => IChartApi | null,
    getSeries: () => ISeriesApi<SeriesType, Time> | null,
    getContext: () => AnchoredVwapDrawingPrimitiveContext,
  ) {
    this._paneView = new AnchoredVwapBandFillPaneView(getChart, getSeries, getContext)
  }

  paneViews() {
    return [this._paneView]
  }

  updateAllViews(): void {
    this._paneView.update()
  }
}

class AnchoredVwapDrawingSeriesPrimitive implements ISeriesPrimitive<Time> {
  private readonly _paneView: AnchoredVwapHandlePaneView

  constructor(
    getChart: () => IChartApi | null,
    getSeries: () => ISeriesApi<SeriesType, Time> | null,
    getContext: () => AnchoredVwapDrawingPrimitiveContext,
  ) {
    this._paneView = new AnchoredVwapHandlePaneView(getChart, getSeries, getContext)
  }

  paneViews() {
    return [this._paneView]
  }

  updateAllViews(): void {
    this._paneView.update()
  }
}

export type AnchoredVwapDrawingSeriesAttachment = {
  update: () => void
  dispose: () => void
}

export function attachAnchoredVwapDrawingSeriesPrimitive(
  series: ISeriesApi<SeriesType, Time>,
  getContext: () => AnchoredVwapDrawingPrimitiveContext,
  getChart: () => IChartApi | null,
): AnchoredVwapDrawingSeriesAttachment {
  const handlePrimitive = new AnchoredVwapDrawingSeriesPrimitive(getChart, () => series, getContext)
  const fillPrimitive = new AnchoredVwapBandFillSeriesPrimitive(getChart, () => series, getContext)
  series.attachPrimitive(handlePrimitive)
  series.attachPrimitive(fillPrimitive)
  return {
    update: () => {
      handlePrimitive.updateAllViews()
      fillPrimitive.updateAllViews()
    },
    dispose: () => {
      for (const instance of getContext().instances) {
        evictCachedAnchoredVwapDrawingPointsForInstance(instance.id)
      }
      series.detachPrimitive(handlePrimitive)
      series.detachPrimitive(fillPrimitive)
    },
  }
}
