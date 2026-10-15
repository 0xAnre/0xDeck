import type { IChartApi, ISeriesApi, SeriesType, Time } from 'lightweight-charts'
import { frvpDefaultDrawStyle, frvpDrawStyleForInstance } from './frvpInstanceLineStyles.ts'
import { buildFixedRangeVolumeProfileDrawModels } from './fixedRangeVolumeProfileRenderGeometry.ts'
import { buildFixedRangeVolumeProfileReadyRuntime } from './fixedRangeVolumeProfileRuntimeIdentity.ts'
import { buildFixedRangeVolumeProfileTimeCoordinateResolvers } from './fixedRangeVolumeProfileTimeCoordinates.ts'
import type { FixedRangeVolumeProfileRuntimeSnapshot } from './fixedRangeVolumeProfileRuntimeTypes.ts'
import {
  hitTestFixedRangeVolumeProfiles,
  type FixedRangeVolumeProfileHandleKind,
  type FixedRangeVolumeProfileHitTarget,
} from './fixedRangeVolumeProfileHitTest.ts'
import type { FixedRangeVolumeProfileInstance } from './fixedRangeVolumeProfileInstances.ts'
import { hitTestLines, type LineHandleKind, type LineHitTarget } from './lineHitTest.ts'
import type { LineInstance } from './lineInstances.ts'
import { projectLineInstanceToScreenSegment } from './lineRenderGeometry.ts'
import {
  buildRectangleChartTimeContext,
  resolveRectangleTimeToCoordinate,
} from './rectangleChartTime.ts'
import {
  hitTestRectangles,
  type RectangleHandleKind,
  type RectangleHitTarget,
} from './rectangleHitTest.ts'
import type { RectangleInstance } from './rectangleInstances.ts'
import { projectRectangleInstanceToScreenBox } from './rectangleRenderGeometry.ts'
import {
  hitTestAnchoredVwapDrawings,
  type AnchoredVwapDrawingHitTarget,
} from './anchoredVwapDrawingHitTest.ts'
import { projectAnchoredVwapDrawingInstance } from './anchoredVwapDrawingRenderGeometry.ts'
import type { AnchoredVwapInstance } from './anchoredVwapInstances.ts'
import type { MarketCandle } from './types.ts'

export type DrawingPointerTool = 'line' | 'rectangle' | 'frvp' | 'anchored-vwap'

const LINE_ENDPOINT_SPECIFICITY = 40
const RECTANGLE_CORNER_SPECIFICITY = 40
const RECTANGLE_EDGE_SPECIFICITY = 30
const LINE_BODY_SPECIFICITY = 20
const RECTANGLE_INTERIOR_SPECIFICITY = 10
const FRVP_ENDPOINT_SPECIFICITY = 40
const FRVP_BODY_SPECIFICITY = 8
const ANCHORED_VWAP_ANCHOR_SPECIFICITY = 40
const ANCHORED_VWAP_BODY_SPECIFICITY = 20

function lineHitSpecificity(kind: LineHandleKind): number {
  switch (kind) {
    case 'endpoint-a':
    case 'endpoint-b':
      return LINE_ENDPOINT_SPECIFICITY
    case 'body':
      return LINE_BODY_SPECIFICITY
    default: {
      const unreachable: never = kind
      return unreachable
    }
  }
}

function frvpHitSpecificity(kind: FixedRangeVolumeProfileHandleKind): number {
  switch (kind) {
    case 'start':
    case 'end':
      return FRVP_ENDPOINT_SPECIFICITY
    case 'body':
      return FRVP_BODY_SPECIFICITY
    default: {
      const unreachable: never = kind
      return unreachable
    }
  }
}

function rectangleHitSpecificity(kind: RectangleHandleKind): number {
  switch (kind) {
    case 'corner-nw':
    case 'corner-ne':
    case 'corner-se':
    case 'corner-sw':
      return RECTANGLE_CORNER_SPECIFICITY
    case 'edge-n':
    case 'edge-e':
    case 'edge-s':
    case 'edge-w':
      return RECTANGLE_EDGE_SPECIFICITY
    case 'interior':
      return RECTANGLE_INTERIOR_SPECIFICITY
    default: {
      const unreachable: never = kind
      return unreachable
    }
  }
}

/**
 * Chooses which drawing receives the pointer when both tools hit the same point.
 * A line stroke outranks a rectangle fill. Equal specificity prefers the line
 * because the line primitive is attached above rectangles.
 */
function anchoredVwapHitSpecificity(kind: AnchoredVwapDrawingHitTarget['kind']): number {
  switch (kind) {
    case 'anchor':
      return ANCHORED_VWAP_ANCHOR_SPECIFICITY
    case 'body':
      return ANCHORED_VWAP_BODY_SPECIFICITY
    default: {
      const unreachable: never = kind
      return unreachable
    }
  }
}

export function preferDrawingPointerTarget(
  lineHit: LineHitTarget | null,
  rectangleHit: RectangleHitTarget | null,
): DrawingPointerTool | null {
  return preferDrawingPointerTargetAmongPeers(lineHit, rectangleHit, null, null)
}

/**
 * Chooses which drawing receives the pointer when line, rectangle, and FRVP overlap.
 * Higher handle/body specificity wins; ties prefer line, then rectangle, then FRVP (z-order).
 */
export function preferDrawingPointerTargetAmongPeers(
  lineHit: LineHitTarget | null,
  rectangleHit: RectangleHitTarget | null,
  frvpHit: FixedRangeVolumeProfileHitTarget | null,
  anchoredVwapHit: AnchoredVwapDrawingHitTarget | null = null,
): DrawingPointerTool | null {
  type ScoredTool = { tool: DrawingPointerTool; score: number }
  const scored: ScoredTool[] = []
  if (lineHit) scored.push({ tool: 'line', score: lineHitSpecificity(lineHit.kind) })
  if (rectangleHit) {
    scored.push({ tool: 'rectangle', score: rectangleHitSpecificity(rectangleHit.kind) })
  }
  if (frvpHit) scored.push({ tool: 'frvp', score: frvpHitSpecificity(frvpHit.kind) })
  if (anchoredVwapHit) {
    scored.push({
      tool: 'anchored-vwap',
      score: anchoredVwapHitSpecificity(anchoredVwapHit.kind),
    })
  }
  if (scored.length === 0) return null
  if (scored.length === 1) return scored[0].tool

  const maxScore = Math.max(...scored.map((entry) => entry.score))
  const top = scored.filter((entry) => entry.score === maxScore)
  if (top.length === 1) return top[0].tool

  if (top.some((entry) => entry.tool === 'line')) return 'line'
  if (top.some((entry) => entry.tool === 'anchored-vwap')) return 'anchored-vwap'
  if (top.some((entry) => entry.tool === 'rectangle')) return 'rectangle'
  return 'frvp'
}

type PaneHitArgs = {
  chart: IChartApi
  series: ISeriesApi<SeriesType, Time>
  paneX: number
  paneY: number
  intervalDurationSeconds: number
  lastBarUnixTime: number | null
}

export function lineHitAtPanePoint(
  args: PaneHitArgs & {
    instances: readonly LineInstance[]
    selectedId: string | null
  },
): LineHitTarget | null {
  const timeContext = buildRectangleChartTimeContext(
    args.chart,
    args.lastBarUnixTime,
    args.intervalDurationSeconds,
  )
  return hitTestLines(args.instances, args.selectedId, args.paneX, args.paneY, (instance) =>
    projectLineInstanceToScreenSegment(
      instance,
      (time, edge) => resolveRectangleTimeToCoordinate(args.chart, time, edge, timeContext),
      (price) => args.series.priceToCoordinate(price),
    ),
  )
}

export function rectangleHitAtPanePoint(
  args: PaneHitArgs & {
    instances: readonly RectangleInstance[]
    selectedId: string | null
  },
): RectangleHitTarget | null {
  const timeContext = buildRectangleChartTimeContext(
    args.chart,
    args.lastBarUnixTime,
    args.intervalDurationSeconds,
  )
  return hitTestRectangles(args.instances, args.selectedId, args.paneX, args.paneY, (instance) =>
    projectRectangleInstanceToScreenBox(
      instance,
      (time, edge) => resolveRectangleTimeToCoordinate(args.chart, time, edge, timeContext),
      (price) => args.series.priceToCoordinate(price),
    ),
  )
}

export function frvpHitAtPanePoint(
  args: PaneHitArgs & {
    instances: readonly FixedRangeVolumeProfileInstance[]
    runtimeById: FixedRangeVolumeProfileRuntimeSnapshot
    selectedId: string | null
  },
): FixedRangeVolumeProfileHitTarget | null {
  const timeScale = args.chart.timeScale()
  const { fromTimeToCoordinate, toTimeToCoordinate } =
    buildFixedRangeVolumeProfileTimeCoordinateResolvers(
      args.chart,
      args.lastBarUnixTime,
      args.intervalDurationSeconds,
    )
  const instanceById = new Map(args.instances.map((item) => [item.id, item]))
  const models = buildFixedRangeVolumeProfileDrawModels({
    instances: args.instances,
    selectedId: args.selectedId,
    readyById: buildFixedRangeVolumeProfileReadyRuntime(args.instances, args.runtimeById),
    fromTimeToCoordinate,
    toTimeToCoordinate,
    barSpacing: timeScale.options().barSpacing,
    priceToY: (price) => args.series.priceToCoordinate(price),
    liveRightEdge: args.lastBarUnixTime,
    styleForInstance: (instanceId) => {
      const instance = instanceById.get(instanceId)
      return instance ? frvpDrawStyleForInstance(instance) : frvpDefaultDrawStyle()
    },
  })
  return hitTestFixedRangeVolumeProfiles(
    args.instances,
    models,
    args.selectedId,
    args.paneX,
    args.paneY,
  )
}

export function anchoredVwapHitAtPanePoint(
  args: PaneHitArgs & {
    instances: readonly AnchoredVwapInstance[]
    selectedId: string | null
    candles: readonly MarketCandle[]
  },
): AnchoredVwapDrawingHitTarget | null {
  const timeContext = buildRectangleChartTimeContext(
    args.chart,
    args.lastBarUnixTime,
    args.intervalDurationSeconds,
  )
  return hitTestAnchoredVwapDrawings(
    args.instances,
    args.selectedId,
    args.paneX,
    args.paneY,
    (instance) =>
      projectAnchoredVwapDrawingInstance(
        args.chart,
        args.series,
        args.candles,
        instance,
        timeContext,
      ),
  )
}
