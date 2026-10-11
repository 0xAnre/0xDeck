import type { LineTimeEdge } from './lineChartTime.ts'
import type { LineHandleKind } from './lineHitTest.ts'
import { lineChartStrokeDashPattern } from './lineChartStroke.ts'
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
  const style = lineInstanceStrokeStyle(instance)
  return {
    ...segment,
    strokeStyle: readLineStrokeStyleForInstance(instance, defaultStrokeStyle),
    lineWidthCssPx: lineInstanceStrokeWidth(instance),
    dashPatternCssPx: lineChartStrokeDashPattern(style),
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
          models.push({
            ...segment,
            strokeStyle: args.strokeStyle,
            lineWidthCssPx: 1,
            dashPatternCssPx: lineChartStrokeDashPattern('dashed'),
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
