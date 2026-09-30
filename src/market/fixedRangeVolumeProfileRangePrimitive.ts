import type { CanvasRenderingTarget2D } from 'fancy-canvas'
import type {
  IChartApi,
  IPanePrimitive,
  IPanePrimitivePaneView,
  IPrimitivePaneRenderer,
  Time,
  UTCTimestamp,
} from 'lightweight-charts'
import type { FixedRangeVolumeProfileInteractionState } from './fixedRangeVolumeProfileInteraction.ts'
import type { FixedRangeVolumeProfileInstance } from './fixedRangeVolumeProfileInstances.ts'
import { normalizeFixedRangeVolumeProfileTimes } from './fixedRangeVolumeProfileInstances.ts'

const RANGE_FILL = 'rgba(160, 160, 160, 0.14)'
const RANGE_BORDER = 'rgba(160, 160, 160, 0.65)'

export type FixedRangeVolumeProfileRangeSegment = {
  fromTime: number
  toTime: number
}

export function buildFixedRangeVolumeProfileRangeSegments(
  instances: readonly FixedRangeVolumeProfileInstance[],
  interaction: FixedRangeVolumeProfileInteractionState,
): FixedRangeVolumeProfileRangeSegment[] {
  const segments: FixedRangeVolumeProfileRangeSegment[] = []
  for (const instance of instances) {
    if (!instance.enabled) continue
    const normalized = normalizeFixedRangeVolumeProfileTimes(instance.fromTime, instance.toTime)
    if (!normalized) continue
    segments.push({ fromTime: normalized.fromTime, toTime: normalized.toTime })
  }

  if (interaction.phase === 'preview' && interaction.draft) {
    const normalized = normalizeFixedRangeVolumeProfileTimes(
      interaction.draft.anchorTime,
      interaction.draft.previewTime,
    )
    if (normalized) {
      segments.push({ fromTime: normalized.fromTime, toTime: normalized.toTime })
    }
  }

  return segments
}

class FixedRangeVolumeProfileRangeRenderer implements IPrimitivePaneRenderer {
  private readonly _chart: IChartApi
  private readonly _segments: FixedRangeVolumeProfileRangeSegment[]

  constructor(chart: IChartApi, segments: FixedRangeVolumeProfileRangeSegment[]) {
    this._chart = chart
    this._segments = segments
  }

  draw(target: CanvasRenderingTarget2D): void {
    if (this._segments.length === 0) return

    target.useMediaCoordinateSpace((scope) => {
      const { context, mediaSize } = scope
      const timeScale = this._chart.timeScale()

      for (const segment of this._segments) {
        const x1 = timeScale.timeToCoordinate(segment.fromTime as UTCTimestamp)
        const x2 = timeScale.timeToCoordinate(segment.toTime as UTCTimestamp)
        if (x1 === null || x2 === null) continue

        const left = Math.min(x1, x2)
        const right = Math.max(x1, x2)
        const width = Math.max(1, right - left)

        context.fillStyle = RANGE_FILL
        context.fillRect(left, 0, width, mediaSize.height)

        context.strokeStyle = RANGE_BORDER
        context.lineWidth = 1
        context.beginPath()
        context.moveTo(left, 0)
        context.lineTo(left, mediaSize.height)
        context.moveTo(right, 0)
        context.lineTo(right, mediaSize.height)
        context.stroke()
      }
    })
  }
}

class FixedRangeVolumeProfileRangePaneView implements IPanePrimitivePaneView {
  private readonly _getChart: () => IChartApi | null
  private readonly _getSegments: () => FixedRangeVolumeProfileRangeSegment[]

  constructor(
    getChart: () => IChartApi | null,
    getSegments: () => FixedRangeVolumeProfileRangeSegment[],
  ) {
    this._getChart = getChart
    this._getSegments = getSegments
  }

  zOrder(): 'bottom' {
    return 'bottom'
  }

  renderer(): IPrimitivePaneRenderer | null {
    const chart = this._getChart()
    if (!chart) return null
    const segments = this._getSegments()
    if (segments.length === 0) return null
    return new FixedRangeVolumeProfileRangeRenderer(chart, segments)
  }
}

export class FixedRangeVolumeProfileRangePrimitive implements IPanePrimitive<Time> {
  private _chart: IChartApi | null = null
  private _requestUpdate: (() => void) | null = null
  private _getSegments: () => FixedRangeVolumeProfileRangeSegment[] = () => []
  private readonly _view: FixedRangeVolumeProfileRangePaneView

  constructor(getSegments: () => FixedRangeVolumeProfileRangeSegment[]) {
    this._getSegments = getSegments
    this._view = new FixedRangeVolumeProfileRangePaneView(() => this._chart, () => this._getSegments())
  }

  setSegmentProvider(getSegments: () => FixedRangeVolumeProfileRangeSegment[]): void {
    this._getSegments = getSegments
    this._requestUpdate?.()
  }

  paneViews(): readonly IPanePrimitivePaneView[] {
    return [this._view]
  }

  updateAllViews(): void {
    this._requestUpdate?.()
  }

  attached(param: { chart: IChartApi; requestUpdate: () => void }): void {
    this._chart = param.chart
    this._requestUpdate = param.requestUpdate
  }

  detached(): void {
    this._chart = null
    this._requestUpdate = null
  }
}
