import type { LineEndpointKind } from './lineHitTest.ts'
import {
  createLineInstance,
  normalizeLineEndpoints,
  type LineInstance,
  type NormalizedLineEndpoints,
} from './lineInstances.ts'

export type LineInteractionPhase =
  | 'inactive'
  | 'armed'
  | 'creating'
  | 'resizing'
  | 'moving'

export type LineCreateDraft = {
  kind: 'create'
  anchorTime: number
  anchorPrice: number
  previewTime: number
  previewPrice: number
}

export type LineResizeDraft = {
  kind: 'resize'
  instanceId: string
  endpoint: LineEndpointKind
  initialEndpoints: NormalizedLineEndpoints
}

export type LineMoveDraft = {
  kind: 'move'
  instanceId: string
  initialEndpoints: NormalizedLineEndpoints
  anchorTime: number
  anchorPrice: number
}

export type LineDraft = LineCreateDraft | LineResizeDraft | LineMoveDraft

export type LineInteractionState = {
  phase: LineInteractionPhase
  selectedId: string | null
  draft: LineDraft | null
}

export const INITIAL_LINE_INTERACTION_STATE: LineInteractionState = {
  phase: 'inactive',
  selectedId: null,
  draft: null,
}

export function isLineChartNavigationLocked(state: LineInteractionState): boolean {
  return state.phase === 'creating' || state.phase === 'resizing' || state.phase === 'moving'
}

export function isLineToolArmed(state: LineInteractionState): boolean {
  return state.phase === 'armed'
}

export function isLineDrawingBlockingPeerTools(state: LineInteractionState): boolean {
  return isLineChartNavigationLocked(state) || isLineToolArmed(state)
}

export function armLineTool(state: LineInteractionState): LineInteractionState {
  return {
    ...state,
    phase: 'armed',
    draft: null,
  }
}

export function cancelLineInteraction(state: LineInteractionState): LineInteractionState {
  if (state.phase === 'inactive' && state.draft === null) {
    return { ...state, draft: null }
  }
  return {
    phase: 'inactive',
    selectedId: state.selectedId,
    draft: null,
  }
}

export function cancelLineInteractionFully(): LineInteractionState {
  return INITIAL_LINE_INTERACTION_STATE
}

export function applyLineSelection(
  state: LineInteractionState,
  selectedId: string | null,
): LineInteractionState {
  if (state.phase === 'creating' || state.phase === 'resizing' || state.phase === 'moving') {
    return state
  }
  if (state.selectedId === selectedId) return state
  return { ...state, selectedId }
}

export function startLineCreateDraft(
  state: LineInteractionState,
  anchorTime: number,
  anchorPrice: number,
): LineInteractionState {
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

export function updateLineCreatePreview(
  state: LineInteractionState,
  previewTime: number,
  previewPrice: number,
): LineInteractionState {
  if (state.phase !== 'creating' || state.draft?.kind !== 'create') return state
  if (!Number.isFinite(previewTime) || !Number.isFinite(previewPrice)) return state
  const draft = state.draft
  if (draft.previewTime === previewTime && draft.previewPrice === previewPrice) return state
  return {
    ...state,
    draft: { ...draft, previewTime, previewPrice },
  }
}

function endpointsFromInstance(instance: LineInstance): NormalizedLineEndpoints {
  return {
    timeA: instance.timeA,
    priceA: instance.priceA,
    timeB: instance.timeB,
    priceB: instance.priceB,
  }
}

export function startLineResizeDraft(
  state: LineInteractionState,
  instance: LineInstance,
  endpoint: LineEndpointKind,
): LineInteractionState {
  if (state.phase !== 'inactive') return state
  return {
    phase: 'resizing',
    selectedId: instance.id,
    draft: {
      kind: 'resize',
      instanceId: instance.id,
      endpoint,
      initialEndpoints: endpointsFromInstance(instance),
    },
  }
}

export function startLineMoveDraft(
  state: LineInteractionState,
  instance: LineInstance,
  anchorTime: number,
  anchorPrice: number,
): LineInteractionState {
  if (state.phase !== 'inactive') return state
  if (!Number.isFinite(anchorTime) || !Number.isFinite(anchorPrice)) return state
  return {
    phase: 'moving',
    selectedId: instance.id,
    draft: {
      kind: 'move',
      instanceId: instance.id,
      anchorTime,
      anchorPrice,
      initialEndpoints: endpointsFromInstance(instance),
    },
  }
}

export function applyLineEndpointDrag(
  initial: NormalizedLineEndpoints,
  endpoint: LineEndpointKind,
  pointerTime: number,
  pointerPrice: number,
): NormalizedLineEndpoints | null {
  if (endpoint === 'endpoint-a') {
    return normalizeLineEndpoints(pointerTime, pointerPrice, initial.timeB, initial.priceB)
  }
  return normalizeLineEndpoints(initial.timeA, initial.priceA, pointerTime, pointerPrice)
}

export function previewEndpointsFromInteraction(
  state: LineInteractionState,
  pointerTime: number,
  pointerPrice: number,
): NormalizedLineEndpoints | null {
  if (!state.draft) return null
  if (state.draft.kind === 'create') {
    return normalizeLineEndpoints(
      state.draft.anchorTime,
      state.draft.anchorPrice,
      pointerTime,
      pointerPrice,
    )
  }
  if (state.draft.kind === 'move') {
    const deltaTime = pointerTime - state.draft.anchorTime
    const deltaPrice = pointerPrice - state.draft.anchorPrice
    const initial = state.draft.initialEndpoints
    return normalizeLineEndpoints(
      initial.timeA + deltaTime,
      initial.priceA + deltaPrice,
      initial.timeB + deltaTime,
      initial.priceB + deltaPrice,
    )
  }
  return applyLineEndpointDrag(
    state.draft.initialEndpoints,
    state.draft.endpoint,
    pointerTime,
    pointerPrice,
  )
}

export type LineCreateCommitResult = {
  state: LineInteractionState
  completedInstance: LineInstance | null
}

export function commitLineCreate(
  state: LineInteractionState,
  existingInstances: readonly LineInstance[],
): LineCreateCommitResult {
  if (state.phase !== 'creating' || state.draft?.kind !== 'create') {
    return { state, completedInstance: null }
  }
  const draft = state.draft
  const instance = createLineInstance({
    timeA: draft.anchorTime,
    priceA: draft.anchorPrice,
    timeB: draft.previewTime,
    priceB: draft.previewPrice,
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

export type LineResizeCommitResult = {
  state: LineInteractionState
  updatedInstance: LineInstance | null
}

export type LineMoveCommitResult = {
  state: LineInteractionState
  updatedInstance: LineInstance | null
}

export function commitLineMove(
  state: LineInteractionState,
  instances: readonly LineInstance[],
  pointerTime: number,
  pointerPrice: number,
): LineMoveCommitResult {
  if (state.phase !== 'moving' || state.draft?.kind !== 'move') {
    return { state, updatedInstance: null }
  }
  const endpoints = previewEndpointsFromInteraction(state, pointerTime, pointerPrice)
  if (!endpoints) {
    return {
      state: { phase: 'inactive', selectedId: state.selectedId, draft: null },
      updatedInstance: null,
    }
  }
  const draft = state.draft
  const existing = instances.find((item) => item.id === draft.instanceId)
  if (!existing) {
    return {
      state: { phase: 'inactive', selectedId: null, draft: null },
      updatedInstance: null,
    }
  }
  const updatedInstance = { ...existing, ...endpoints }
  return {
    state: { phase: 'inactive', selectedId: updatedInstance.id, draft: null },
    updatedInstance,
  }
}

export function commitLineResize(
  state: LineInteractionState,
  instances: readonly LineInstance[],
  pointerTime: number,
  pointerPrice: number,
): LineResizeCommitResult {
  if (state.phase !== 'resizing' || state.draft?.kind !== 'resize') {
    return { state, updatedInstance: null }
  }
  const draft = state.draft
  const endpoints = applyLineEndpointDrag(
    draft.initialEndpoints,
    draft.endpoint,
    pointerTime,
    pointerPrice,
  )
  if (!endpoints) {
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
  const updatedInstance = { ...existing, ...endpoints }
  return {
    state: { phase: 'inactive', selectedId: updatedInstance.id, draft: null },
    updatedInstance,
  }
}

export function removeSelectedLine(
  state: LineInteractionState,
  instances: readonly LineInstance[],
): { state: LineInteractionState; instances: LineInstance[] } {
  if (!state.selectedId) return { state, instances: [...instances] }
  const nextInstances = instances.filter((item) => item.id !== state.selectedId)
  return {
    state: { ...state, selectedId: null },
    instances: nextInstances,
  }
}
