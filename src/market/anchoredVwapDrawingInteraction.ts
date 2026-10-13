import {
  createAnchoredVwapInstance,
  isAnchoredVwapInstanceLocked,
  type AnchoredVwapInstance,
} from './anchoredVwapInstances.ts'

export type AnchoredVwapDrawingInteractionPhase = 'inactive' | 'armed' | 'dragging-anchor'

export type AnchoredVwapDrawingDragDraft = {
  instanceId: string
  initialAnchorTime: number
}

export type AnchoredVwapDrawingInteractionState = {
  phase: AnchoredVwapDrawingInteractionPhase
  selectedId: string | null
  draft: AnchoredVwapDrawingDragDraft | null
}

export const INITIAL_ANCHORED_VWAP_DRAWING_INTERACTION_STATE: AnchoredVwapDrawingInteractionState =
  {
    phase: 'inactive',
    selectedId: null,
    draft: null,
  }

export function isAnchoredVwapDrawingNavigationLocked(
  state: AnchoredVwapDrawingInteractionState,
): boolean {
  return state.phase === 'dragging-anchor'
}

export function isAnchoredVwapDrawingToolArmed(
  state: AnchoredVwapDrawingInteractionState,
): boolean {
  return state.phase === 'armed'
}

export function isAnchoredVwapDrawingBlockingPeerTools(
  state: AnchoredVwapDrawingInteractionState,
): boolean {
  return isAnchoredVwapDrawingNavigationLocked(state) || isAnchoredVwapDrawingToolArmed(state)
}

export function armAnchoredVwapDrawingTool(
  state: AnchoredVwapDrawingInteractionState,
): AnchoredVwapDrawingInteractionState {
  return { ...state, phase: 'armed', draft: null }
}

export function restoreAnchoredVwapDragAnchor(
  state: AnchoredVwapDrawingInteractionState,
  instances: readonly AnchoredVwapInstance[],
): AnchoredVwapInstance | null {
  if (state.phase !== 'dragging-anchor' || state.draft === null) return null
  const draft = state.draft
  const instance = instances.find((item) => item.id === draft.instanceId)
  if (!instance || instance.anchorTime === draft.initialAnchorTime) return null
  return { ...instance, anchorTime: draft.initialAnchorTime }
}

export function cancelAnchoredVwapDrawingInteraction(
  state: AnchoredVwapDrawingInteractionState,
): AnchoredVwapDrawingInteractionState {
  if (state.phase === 'inactive' && state.draft === null) {
    return { ...state, draft: null }
  }
  return {
    phase: 'inactive',
    selectedId: state.selectedId,
    draft: null,
  }
}

export function applyAnchoredVwapDrawingSelection(
  state: AnchoredVwapDrawingInteractionState,
  selectedId: string | null,
): AnchoredVwapDrawingInteractionState {
  if (state.selectedId === selectedId && state.phase !== 'armed') {
    return state
  }
  return {
    phase: selectedId === null ? state.phase : 'inactive',
    selectedId,
    draft: null,
  }
}

export function startAnchoredVwapAnchorDrag(
  state: AnchoredVwapDrawingInteractionState,
  instanceId: string,
  initialAnchorTime: number,
): AnchoredVwapDrawingInteractionState {
  if (state.phase === 'armed') return state
  return {
    phase: 'dragging-anchor',
    selectedId: instanceId,
    draft: { instanceId, initialAnchorTime },
  }
}

export function commitAnchoredVwapAnchorDrag(
  state: AnchoredVwapDrawingInteractionState,
): AnchoredVwapDrawingInteractionState {
  if (state.phase !== 'dragging-anchor') return state
  return {
    phase: 'inactive',
    selectedId: state.selectedId,
    draft: null,
  }
}

export function createAnchoredVwapFromAnchorTime(
  instances: readonly AnchoredVwapInstance[],
  anchorTime: number,
): { instance: AnchoredVwapInstance; instances: AnchoredVwapInstance[] } | null {
  const existingIds = new Set(instances.map((item) => item.id))
  const instance = createAnchoredVwapInstance({
    anchorTime,
    existingIds,
    siblingInstances: instances,
  })
  if (!instance) return null
  return { instance, instances: [...instances, instance] }
}

export function removeSelectedAnchoredVwap(
  state: AnchoredVwapDrawingInteractionState,
  instances: readonly AnchoredVwapInstance[],
): { state: AnchoredVwapDrawingInteractionState; instances: AnchoredVwapInstance[] } {
  if (!state.selectedId) return { state, instances: [...instances] }
  const selected = instances.find((item) => item.id === state.selectedId)
  if (!selected || isAnchoredVwapInstanceLocked(selected)) {
    return { state, instances: [...instances] }
  }
  const nextInstances = instances.filter((item) => item.id !== state.selectedId)
  return {
    state: { phase: 'inactive', selectedId: null, draft: null },
    instances: nextInstances,
  }
}
