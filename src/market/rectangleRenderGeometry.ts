import type { RectangleTimeCoordinateProjection, RectangleTimeEdge } from './rectangleChartTime.ts'
import type { RectangleHandleKind, RectangleScreenBox } from './rectangleHitTest.ts'
import {
  isRectangleInstanceHidden,
  isRectangleInstanceLocked,
  type NormalizedRectangleBounds,
  type RectangleInstance,
} from './rectangleInstances.ts'
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
  /** Left edge is the earliest loaded bar, not the stored `fromTime`. */
  clippedStart: boolean
  /** Right edge is the earliest loaded bar, not the stored `toTime`. */
  clippedEnd: boolean
}

/**
 * Stored time edge -> pane coordinate. `clippedBeforeLoadedHistory` marks a
 * coordinate that is the earliest loaded bar instead of the stored time.
 */
export type RectangleTimeProjector = (
  time: number,
  edge: RectangleTimeEdge,
) => RectangleTimeCoordinateProjection | null

export type RectangleProjectedScreenBox = RectangleScreenBox & {
  clippedStart: boolean
  clippedEnd: boolean
}

export type BuildRectangleDrawModelsArgs = {
  instances: readonly RectangleInstance[]
  interaction: RectangleInteractionState
  resolveInstanceFillStyle: (instance: RectangleInstance) => string
  previewFillStyle: string
  handleFillStyle: string
  pointerTime: number | null
  pointerPrice: number | null
  projectTime: RectangleTimeProjector
  priceToY: (price: number) => number | null
  handleRadiusPx: number
}

const RECTANGLE_HANDLE_KINDS: readonly RectangleHandleKind[] = [
  'corner-nw',
  'edge-n',
  'corner-ne',
  'edge-e',
  'corner-se',
  'edge-s',
  'corner-sw',
  'edge-w',
]

/** Handles that move the stored `fromTime`; a clipped start has no real one. */
const RECTANGLE_START_HANDLE_KINDS: ReadonlySet<RectangleHandleKind> = new Set([
  'corner-nw',
  'corner-sw',
  'edge-w',
])

/** Handles that move the stored `toTime`; a clipped end has no real one. */
const RECTANGLE_END_HANDLE_KINDS: ReadonlySet<RectangleHandleKind> = new Set([
  'corner-ne',
  'corner-se',
  'edge-e',
])

function boundsToScreenBox(
  bounds: NormalizedRectangleBounds,
  projectTime: RectangleTimeProjector,
  priceToY: (price: number) => number | null,
): { left: number; right: number; top: number; bottom: number; clippedStart: boolean; clippedEnd: boolean } | null {
  const start = projectTime(bounds.fromTime, 'start')
  const end = projectTime(bounds.toTime, 'end')
  if (start === null || end === null) return null
  const top = priceToY(bounds.highPrice)
  const bottom = priceToY(bounds.lowPrice)
  if (top === null || bottom === null) return null
  return {
    left: Math.min(start.coordinate, end.coordinate),
    right: Math.max(start.coordinate, end.coordinate),
    top: Math.min(top, bottom),
    bottom: Math.max(top, bottom),
    clippedStart: start.clippedBeforeLoadedHistory,
    clippedEnd: end.clippedBeforeLoadedHistory,
  }
}

function buildHandlePoints(
  box: {
    left: number
    right: number
    top: number
    bottom: number
  },
  clippedStart: boolean,
  clippedEnd: boolean,
): RectangleHandleDrawModel[] {
  const midX = (box.left + box.right) / 2
  const midY = (box.top + box.bottom) / 2
  const points: RectangleHandleDrawModel[] = [
    { x: box.left, y: box.top },
    { x: midX, y: box.top },
    { x: box.right, y: box.top },
    { x: box.right, y: midY },
    { x: box.right, y: box.bottom },
    { x: midX, y: box.bottom },
    { x: box.left, y: box.bottom },
    { x: box.left, y: midY },
  ]
  // A clipped edge is not a real endpoint: it must not show (or later own) a
  // handle that would drag the stored time to an invented position.
  return points.filter((_, index) => {
    const kind = RECTANGLE_HANDLE_KINDS[index]
    if (kind === undefined) return false
    if (clippedStart && RECTANGLE_START_HANDLE_KINDS.has(kind)) return false
    if (clippedEnd && RECTANGLE_END_HANDLE_KINDS.has(kind)) return false
    return true
  })
}

function isPositiveAreaBox(box: { left: number; right: number; top: number; bottom: number }): boolean {
  return box.right > box.left && box.bottom > box.top
}

function instanceToDrawModel(
  instance: RectangleInstance,
  selectedId: string | null,
  resolveInstanceFillStyle: (instance: RectangleInstance) => string,
  projectTime: RectangleTimeProjector,
  priceToY: (price: number) => number | null,
): RectangleDrawModel | null {
  const box = boundsToScreenBox(instance, projectTime, priceToY)
  if (!box) return null
  // A box whose stored range lies entirely before the loaded history collapses
  // onto the earliest loaded bar: nothing of it is on screen, so nothing is
  // painted and no handle appears at that shared edge.
  if (!isPositiveAreaBox(box)) return null
  const showHandles =
    selectedId === instance.id && !isRectangleInstanceLocked(instance)
  return {
    ...box,
    fillStyle: resolveInstanceFillStyle(instance),
    handles: showHandles
      ? buildHandlePoints(box, box.clippedStart, box.clippedEnd)
      : [],
  }
}

export function getRectangleInstanceOmittedDuringInteraction(
  interaction: RectangleInteractionState,
): string | null {
  if (interaction.phase === 'resizing' && interaction.draft?.kind === 'resize') {
    return interaction.draft.instanceId
  }
  if (interaction.phase === 'moving' && interaction.draft?.kind === 'move') {
    return interaction.draft.instanceId
  }
  return null
}

function previewFillStyleForInteraction(args: BuildRectangleDrawModelsArgs): string {
  const { interaction } = args
  if (interaction.phase !== 'resizing' && interaction.phase !== 'moving') {
    return args.previewFillStyle
  }

  const draft = interaction.draft
  if (draft === null || draft.kind === 'create') {
    return args.previewFillStyle
  }
  if (draft.kind === 'resize' || draft.kind === 'move') {
    const instance = args.instances.find((item) => item.id === draft.instanceId)
    return instance ? args.resolveInstanceFillStyle(instance) : args.previewFillStyle
  }

  const _exhaustive: never = draft
  return _exhaustive
}

export function buildRectangleDrawModels(args: BuildRectangleDrawModelsArgs): RectangleDrawModel[] {
  const models: RectangleDrawModel[] = []
  const omittedInstanceId = getRectangleInstanceOmittedDuringInteraction(args.interaction)

  for (const instance of args.instances) {
    if (isRectangleInstanceHidden(instance)) continue
    if (omittedInstanceId !== null && instance.id === omittedInstanceId) continue
    const model = instanceToDrawModel(
      instance,
      args.interaction.selectedId,
      args.resolveInstanceFillStyle,
      args.projectTime,
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
      const preview = previewBoundsFromInteraction(
        args.interaction,
        args.pointerTime,
        args.pointerPrice,
      )
      if (preview) {
        const box = boundsToScreenBox(preview, args.projectTime, args.priceToY)
        if (box && isPositiveAreaBox(box)) {
          models.push({
            ...box,
            fillStyle: previewFillStyleForInteraction(args),
            handles:
              args.interaction.phase === 'resizing' || args.interaction.phase === 'moving'
                ? buildHandlePoints(box, box.clippedStart, box.clippedEnd)
                : [],
          })
        }
      }
    }
  }

  return models
}

export function projectRectangleInstanceToScreenBox(
  instance: RectangleInstance,
  projectTime: RectangleTimeProjector,
  priceToY: (price: number) => number | null,
): RectangleProjectedScreenBox | null {
  return boundsToScreenBox(instance, projectTime, priceToY)
}

/**
 * Handle kind of an index in the **full eight-slot layout** — the pre-clip
 * order `nw, n, ne, e, se, s, sw, w`.
 *
 * Draw models omit the handles of a clipped edge (an edge that is the earliest
 * loaded bar, not the stored time), so `model.handles[i]` is this kind only for
 * a model whose edges are both real; a clipped model carries the remaining
 * subset in the same relative order. Callers that need kinds for a clipped
 * model must map `model.handles` against the model's `clippedStart`/
 * `clippedEnd` flags rather than index into the full layout.
 */
export function rectangleHandleKindFromDrawIndex(index: number): RectangleHandleKind | null {
  return RECTANGLE_HANDLE_KINDS[index] ?? null
}
