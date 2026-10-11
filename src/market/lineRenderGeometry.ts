import type { LineTimeEdge } from './lineChartTime.ts'
import type { LineHandleKind } from './lineHitTest.ts'
import {
  DEFAULT_LINE_CHART_STROKE_STYLE,
  DEFAULT_LINE_CHART_STROKE_WIDTH,
  lineChartStrokeDashPattern,
} from './lineChartStroke.ts'
import { readLineStrokeStyleForInstance } from './lineColors.ts'
import {
  isLineInstanceHidden,
  isLineInstanceLocked,
  lineInstanceStrokeStyle,
  lineInstanceStrokeWidth,
  type LineInstance,
} from './lineInstances.ts'
import type { LineInteractionState } from './lineInteraction.ts'
import { previewEndpointsFromInteraction } from './lineInteraction.ts'

export type LineHandleDrawModel = {
  x: number
  y: number
}

export type LineDrawModel = {
  ax: number
  ay: number
  bx: number
  by: number
  strokeStyle: string
  lineWidthCssPx: number
  dashPatternCssPx: readonly number[]
  handles: LineHandleDrawModel[]
}

export type BuildLineDrawModelsArgs = {
  instances: readonly LineInstance[]
  interaction: LineInteractionState
  strokeStyle: string
  pointerTime: number | null
  pointerPrice: number | null
  timeToCoordinate: (time: number, edge: LineTimeEdge) => number | null
  priceToY: (price: number) => number | null
}

/** Earlier endpoint floors (`start`); later endpoint ceils (`end`). */
function lineTimeEdge(time: number, otherTime: number): LineTimeEdge {
  return time <= otherTime ? 'start' : 'end'
}

function endpointsToScreenSegment(
  instance: Pick<LineInstance, 'timeA' | 'priceA' | 'timeB' | 'priceB'>,
  timeToCoordinate: (time: number, edge: LineTimeEdge) => number | null,
  priceToY: (price: number) => number | null,
): { ax: number; ay: number; bx: number; by: number } | null {
  const ax = timeToCoordinate(instance.timeA, lineTimeEdge(instance.timeA, instance.timeB))
  const bx = timeToCoordinate(instance.timeB, lineTimeEdge(instance.timeB, instance.timeA))
  const ay = priceToY(instance.priceA)
  const by = priceToY(instance.priceB)
  if (ax === null || bx === null || ay === null || by === null) return null
  return { ax, ay, bx, by }
}

function buildHandlePoints(segment: { ax: number; ay: number; bx: number; by: number }): LineHandleDrawModel[] {
  return [{ x: segment.ax, y: segment.ay }, { x: segment.bx, y: segment.by }]
}

type LineStrokePresentation = {
  strokeStyle: string
  lineWidthCssPx: number
  dashPatternCssPx: readonly number[]
}

function lineInstanceStrokePresentation(
  instance: LineInstance,
  defaultStrokeStyle: string,
): LineStrokePresentation {
  const style = lineInstanceStrokeStyle(instance)
  return {
    strokeStyle: readLineStrokeStyleForInstance(instance, defaultStrokeStyle),
    lineWidthCssPx: lineInstanceStrokeWidth(instance),
    dashPatternCssPx: lineChartStrokeDashPattern(style),
  }
}

function defaultLineStrokePresentation(defaultStrokeStyle: string): LineStrokePresentation {
  return {
    strokeStyle: defaultStrokeStyle,
    lineWidthCssPx: DEFAULT_LINE_CHART_STROKE_WIDTH,
    dashPatternCssPx: lineChartStrokeDashPattern(DEFAULT_LINE_CHART_STROKE_STYLE),
  }
}

function previewStrokePresentationForInteraction(args: BuildLineDrawModelsArgs): LineStrokePresentation {
  const { interaction } = args
  const defaultPresentation = defaultLineStrokePresentation(args.strokeStyle)
  if (interaction.phase !== 'resizing' && interaction.phase !== 'moving') {
    return defaultPresentation
  }

  const draft = interaction.draft
  if (draft === null || draft.kind === 'create') {
    return defaultPresentation
  }
  if (draft.kind === 'resize' || draft.kind === 'move') {
    const instance = args.instances.find((item) => item.id === draft.instanceId)
    return instance ? lineInstanceStrokePresentation(instance, args.strokeStyle) : defaultPresentation
  }

  const _exhaustive: never = draft
  return _exhaustive
}

function instanceToDrawModel(
  instance: LineInstance,
  selectedId: string | null,
  defaultStrokeStyle: string,
  timeToCoordinate: (time: number, edge: LineTimeEdge) => number | null,
  priceToY: (price: number) => number | null,
): LineDrawModel | null {
  const segment = endpointsToScreenSegment(instance, timeToCoordinate, priceToY)
  if (!segment) return null
  const showHandles =
    selectedId === instance.id && !isLineInstanceLocked(instance)
  const presentation = lineInstanceStrokePresentation(instance, defaultStrokeStyle)
  return {
    ...segment,
    ...presentation,
    handles: showHandles ? buildHandlePoints(segment) : [],
  }
}

export function getLineInstanceOmittedDuringInteraction(
  interaction: LineInteractionState,
): string | null {
  if (interaction.phase === 'resizing' && interaction.draft?.kind === 'resize') {
    return interaction.draft.instanceId
  }
  if (interaction.phase === 'moving' && interaction.draft?.kind === 'move') {
    return interaction.draft.instanceId
  }
  return null
}

export function buildLineDrawModels(args: BuildLineDrawModelsArgs): LineDrawModel[] {
  const models: LineDrawModel[] = []
  const omittedInstanceId = getLineInstanceOmittedDuringInteraction(args.interaction)

  for (const instance of args.instances) {
    if (isLineInstanceHidden(instance)) continue
    if (omittedInstanceId !== null && instance.id === omittedInstanceId) continue
    const model = instanceToDrawModel(
      instance,
      args.interaction.selectedId,
      args.strokeStyle,
      args.timeToCoordinate,
      args.priceToY,
    )
    if (model) models.push(model)
  }

  if (
    args.interaction.phase === 'creating' ||
    args.interaction.phase === 'resizing' ||
    args.interaction.phase === 'moving'
  ) {
    if (args.pointerTime !== null && args.pointerPrice !== null) {
      const preview = previewEndpointsFromInteraction(
        args.interaction,
        args.pointerTime,
        args.pointerPrice,
      )
      if (preview) {
        const segment = endpointsToScreenSegment(preview, args.timeToCoordinate, args.priceToY)
        if (segment) {
          const presentation = previewStrokePresentationForInteraction(args)
          models.push({
            ...segment,
            ...presentation,
            handles:
              args.interaction.phase === 'resizing' || args.interaction.phase === 'moving'
                ? buildHandlePoints(segment)
                : [],
          })
        }
      }
    }
  }

  return models
}

export function projectLineInstanceToScreenSegment(
  instance: LineInstance,
  timeToCoordinate: (time: number, edge: LineTimeEdge) => number | null,
  priceToY: (price: number) => number | null,
): { ax: number; ay: number; bx: number; by: number } | null {
  return endpointsToScreenSegment(instance, timeToCoordinate, priceToY)
}

export function lineHandleKindFromEndpoint(endpoint: 'endpoint-a' | 'endpoint-b'): LineHandleKind {
  return endpoint
}
