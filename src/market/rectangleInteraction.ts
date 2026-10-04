import type { RectangleHandleKind } from './rectangleHitTest.ts'
import {
  createRectangleInstance,
  normalizeRectangleBounds,
  type NormalizedRectangleBounds,
  type RectangleInstance,
} from './rectangleInstances.ts'

export type RectangleInteractionPhase = 'inactive' | 'armed' | 'creating' | 'resizing'

export type RectangleCreateDraft = {
  kind: 'create'
  anchorTime: number
  anchorPrice: number
  previewTime: number
  previewPrice: number
}

export type RectangleResizeDraft = {
  kind: 'resize'
  instanceId: string
  handle: Exclude<RectangleHandleKind, 'interior'>
  initialBounds: NormalizedRectangleBounds
}

export type RectangleDraft = RectangleCreateDraft | RectangleResizeDraft

export type RectangleInteractionState = {
  phase: RectangleInteractionPhase
  selectedId: string | null
  draft: RectangleDraft | null
}

export const INITIAL_RECTANGLE_INTERACTION_STATE: RectangleInteractionState = {
  phase: 'inactive',
  selectedId: null,
  draft: null,
}

export function isRectangleChartNavigationLocked(state: RectangleInteractionState): boolean {
  return state.phase === 'creating' || state.phase === 'resizing'
}

export function armRectangleTool(state: RectangleInteractionState): RectangleInteractionState {
  return {
    ...state,
    phase: 'armed',
    draft: null,
  }
}

export function cancelRectangleInteraction(
  state: RectangleInteractionState,
): RectangleInteractionState {
  if (state.phase === 'inactive' && state.draft === null) {
    return { ...state, draft: null }
  }
  return {
    phase: 'inactive',
    selectedId: state.selectedId,
    draft: null,
  }
}

export function cancelRectangleInteractionFully(): RectangleInteractionState {
  return INITIAL_RECTANGLE_INTERACTION_STATE
}

export function applyRectangleSelection(
  state: RectangleInteractionState,
  selectedId: string | null,
): RectangleInteractionState {
  if (state.phase === 'creating' || state.phase === 'resizing') return state
  if (state.selectedId === selectedId) return state
  return { ...state, selectedId }
}

export function startRectangleCreateDraft(
  state: RectangleInteractionState,
  anchorTime: number,
  anchorPrice: number,
): RectangleInteractionState {
  if (state.phase !== 'armed') return state
  if (!Number.isFinite(anchorTime) || !Number.isFinite(anchorPrice)) return state
  return {
    phase: 'creating',
    selectedId: state.selectedId,
    draft: {
      kind: 'create',
      anchorTime,
      anchorPrice,
      previewTime: anchorTime,
      previewPrice: anchorPrice,
    },
  }
}

export function updateRectangleCreatePreview(
  state: RectangleInteractionState,
  previewTime: number,
  previewPrice: number,
): RectangleInteractionState {
  if (state.phase !== 'creating' || state.draft?.kind !== 'create') return state
  if (!Number.isFinite(previewTime) || !Number.isFinite(previewPrice)) return state
  const draft = state.draft
  if (draft.previewTime === previewTime && draft.previewPrice === previewPrice) return state
  return {
    ...state,
    draft: { ...draft, previewTime, previewPrice },
  }
}

export function startRectangleResizeDraft(
  state: RectangleInteractionState,
  instance: RectangleInstance,
  handle: Exclude<RectangleHandleKind, 'interior'>,
): RectangleInteractionState {
  if (state.phase !== 'inactive') return state
  return {
    phase: 'resizing',
    selectedId: instance.id,
    draft: {
      kind: 'resize',
      instanceId: instance.id,
      handle,
      initialBounds: {
        fromTime: instance.fromTime,
        toTime: instance.toTime,
        lowPrice: instance.lowPrice,
        highPrice: instance.highPrice,
      },
    },
  }
}

export function applyResizeHandleToBounds(
  initial: NormalizedRectangleBounds,
  handle: Exclude<RectangleHandleKind, 'interior'>,
  pointerTime: number,
  pointerPrice: number,
): NormalizedRectangleBounds | null {
  let { fromTime, toTime, lowPrice, highPrice } = initial
  switch (handle) {
    case 'corner-nw':
      fromTime = pointerTime
      highPrice = pointerPrice
      break
    case 'corner-ne':
      toTime = pointerTime
      highPrice = pointerPrice
      break
    case 'corner-se':
      toTime = pointerTime
      lowPrice = pointerPrice
      break
    case 'corner-sw':
      fromTime = pointerTime
      lowPrice = pointerPrice
      break
    case 'edge-n':
      highPrice = pointerPrice
      break
    case 'edge-e':
      toTime = pointerTime
      break
    case 'edge-s':
      lowPrice = pointerPrice
      break
    case 'edge-w':
      fromTime = pointerTime
      break
    default: {
      const neverHandle: never = handle
      throw new Error(`Unhandled resize handle: ${neverHandle}`)
    }
  }
  return normalizeRectangleBounds(fromTime, toTime, lowPrice, highPrice)
}

export function previewBoundsFromInteraction(
  state: RectangleInteractionState,
  pointerTime: number,
  pointerPrice: number,
): NormalizedRectangleBounds | null {
  if (!state.draft) return null
  if (state.draft.kind === 'create') {
    return normalizeRectangleBounds(
      state.draft.anchorTime,
      pointerTime,
      state.draft.anchorPrice,
      pointerPrice,
    )
  }
  return applyResizeHandleToBounds(
    state.draft.initialBounds,
    state.draft.handle,
    pointerTime,
    pointerPrice,
  )
}

export type RectangleCreateCommitResult = {
  state: RectangleInteractionState
  completedInstance: RectangleInstance | null
}

export function commitRectangleCreate(
  state: RectangleInteractionState,
  existingInstances: readonly RectangleInstance[],
): RectangleCreateCommitResult {
  if (state.phase !== 'creating' || state.draft?.kind !== 'create') {
    return { state, completedInstance: null }
  }
  const draft = state.draft
  const instance = createRectangleInstance({
    fromTime: draft.anchorTime,
    toTime: draft.previewTime,
    lowPrice: draft.anchorPrice,
    highPrice: draft.previewPrice,
    existingIds: new Set(existingInstances.map((item) => item.id)),
  })
  if (!instance) {
    return {
      state: { phase: 'armed', selectedId: state.selectedId, draft: null },
      completedInstance: null,
    }
  }
  return {
    state: { phase: 'inactive', selectedId: instance.id, draft: null },
    completedInstance: instance,
  }
}

export type RectangleResizeCommitResult = {
  state: RectangleInteractionState
  updatedInstance: RectangleInstance | null
}

export function commitRectangleResize(
  state: RectangleInteractionState,
  instances: readonly RectangleInstance[],
  pointerTime: number,
  pointerPrice: number,
): RectangleResizeCommitResult {
  if (state.phase !== 'resizing' || state.draft?.kind !== 'resize') {
    return { state, updatedInstance: null }
  }
  const draft = state.draft
  const bounds = applyResizeHandleToBounds(
    draft.initialBounds,
    draft.handle,
    pointerTime,
    pointerPrice,
  )
  if (!bounds) {
    return {
      state: { phase: 'inactive', selectedId: state.selectedId, draft: null },
      updatedInstance: null,
    }
  }
  const existing = instances.find((item) => item.id === draft.instanceId)
  if (!existing) {
    return {
      state: { phase: 'inactive', selectedId: null, draft: null },
      updatedInstance: null,
    }
  }
  const updatedInstance = { ...existing, ...bounds }
  return {
    state: { phase: 'inactive', selectedId: updatedInstance.id, draft: null },
    updatedInstance,
  }
}

export function removeSelectedRectangle(
  state: RectangleInteractionState,
  instances: readonly RectangleInstance[],
): { state: RectangleInteractionState; instances: RectangleInstance[] } {
  if (!state.selectedId) return { state, instances: [...instances] }
  const nextInstances = instances.filter((item) => item.id !== state.selectedId)
  return {
    state: { ...state, selectedId: null },
    instances: nextInstances,
  }
}
