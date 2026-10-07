import type { RectangleHandleKind } from './rectangleHitTest.ts'
import type { NormalizedRectangleBounds, RectangleInstance } from './rectangleInstances.ts'
import type { RectangleInteractionState } from './rectangleInteraction.ts'
import { previewBoundsFromInteraction } from './rectangleInteraction.ts'

export type RectangleHandleDrawModel = {
  x: number
  y: number
}

export type RectangleDrawModel = {
  left: number
  right: number
  top: number
  bottom: number
  fillStyle: string
  handles: RectangleHandleDrawModel[]
}

export type BuildRectangleDrawModelsArgs = {
  instances: readonly RectangleInstance[]
  interaction: RectangleInteractionState
  fillStyle: string
  handleFillStyle: string
  pointerTime: number | null
  pointerPrice: number | null
  timeToCoordinate: (time: number) => number | null
  priceToY: (price: number) => number | null
  handleRadiusPx: number
}

function boundsToScreenBox(
  bounds: NormalizedRectangleBounds,
  timeToCoordinate: (time: number) => number | null,
  priceToY: (price: number) => number | null,
): { left: number; right: number; top: number; bottom: number } | null {
  const left = timeToCoordinate(bounds.fromTime)
  const right = timeToCoordinate(bounds.toTime)
  const top = priceToY(bounds.highPrice)
  const bottom = priceToY(bounds.lowPrice)
  if (left === null || right === null || top === null || bottom === null) return null
  return {
    left: Math.min(left, right),
    right: Math.max(left, right),
    top: Math.min(top, bottom),
    bottom: Math.max(top, bottom),
  }
}

function buildHandlePoints(box: {
  left: number
  right: number
  top: number
  bottom: number
}): RectangleHandleDrawModel[] {
  const midX = (box.left + box.right) / 2
  const midY = (box.top + box.bottom) / 2
  return [
    { x: box.left, y: box.top },
    { x: midX, y: box.top },
    { x: box.right, y: box.top },
    { x: box.right, y: midY },
    { x: box.right, y: box.bottom },
    { x: midX, y: box.bottom },
    { x: box.left, y: box.bottom },
    { x: box.left, y: midY },
  ]
}

function instanceToDrawModel(
  instance: RectangleInstance,
  selectedId: string | null,
  fillStyle: string,
  timeToCoordinate: (time: number) => number | null,
  priceToY: (price: number) => number | null,
): RectangleDrawModel | null {
  const box = boundsToScreenBox(instance, timeToCoordinate, priceToY)
  if (!box) return null
  return {
    ...box,
    fillStyle,
    handles: selectedId === instance.id ? buildHandlePoints(box) : [],
  }
}

export function getRectangleInstanceOmittedDuringInteraction(
  interaction: RectangleInteractionState,
): string | null {
  if (interaction.phase === 'resizing' && interaction.draft?.kind === 'resize') {
    return interaction.draft.instanceId
  }
  return null
}

export function buildRectangleDrawModels(args: BuildRectangleDrawModelsArgs): RectangleDrawModel[] {
  const models: RectangleDrawModel[] = []
  const omittedInstanceId = getRectangleInstanceOmittedDuringInteraction(args.interaction)

  for (const instance of args.instances) {
    if (omittedInstanceId !== null && instance.id === omittedInstanceId) continue
    const model = instanceToDrawModel(
      instance,
      args.interaction.selectedId,
      args.fillStyle,
      args.timeToCoordinate,
      args.priceToY,
    )
    if (model) models.push(model)
  }

  if (
    args.interaction.phase === 'creating' ||
    args.interaction.phase === 'resizing'
  ) {
    if (args.pointerTime !== null && args.pointerPrice !== null) {
      const preview = previewBoundsFromInteraction(
        args.interaction,
        args.pointerTime,
        args.pointerPrice,
      )
      if (preview) {
        const box = boundsToScreenBox(preview, args.timeToCoordinate, args.priceToY)
        if (box) {
          models.push({
            ...box,
            fillStyle: args.fillStyle,
            handles:
              args.interaction.phase === 'resizing' ? buildHandlePoints(box) : [],
          })
        }
      }
    }
  }

  return models
}

export function projectRectangleInstanceToScreenBox(
  instance: RectangleInstance,
  timeToCoordinate: (time: number) => number | null,
  priceToY: (price: number) => number | null,
): { left: number; right: number; top: number; bottom: number } | null {
  return boundsToScreenBox(instance, timeToCoordinate, priceToY)
}

export function rectangleHandleKindFromDrawIndex(index: number): RectangleHandleKind | null {
  const kinds: RectangleHandleKind[] = [
    'corner-nw',
    'edge-n',
    'corner-ne',
    'edge-e',
    'corner-se',
    'edge-s',
    'corner-sw',
    'edge-w',
  ]
  return kinds[index] ?? null
}
