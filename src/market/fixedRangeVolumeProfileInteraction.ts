import {
  createFixedRangeVolumeProfileInstance,
  isValidUnixChartTimeSeconds,
  normalizeFixedRangeVolumeProfileTimes,
  type FixedRangeVolumeProfileInstance,
} from './fixedRangeVolumeProfileInstances.ts'
import type { CandleInterval } from './types.ts'

export type FixedRangeVolumeProfileToolPhase =
  | 'inactive'
  | 'armed'
  | 'preview'
  | 'resizing'

export type FixedRangeVolumeProfileEndpointKind = 'start' | 'end'

export type FixedRangeVolumeProfileCreateDraft = {
  kind: 'create'
  anchorTime: number
  previewTime: number
}

export type FixedRangeVolumeProfileResizeDraft = {
  kind: 'resize'
  instanceId: string
  endpoint: FixedRangeVolumeProfileEndpointKind
  initialFromTime: number
  initialToTime: number
  previewPointerTime: number
}

export type FixedRangeVolumeProfileDraft =
  | FixedRangeVolumeProfileCreateDraft
  | FixedRangeVolumeProfileResizeDraft

export type FixedRangeVolumeProfileInteractionState = {
  phase: FixedRangeVolumeProfileToolPhase
  selectedId: string | null
  draft: FixedRangeVolumeProfileDraft | null
}

export const INITIAL_FIXED_RANGE_VP_INTERACTION_STATE: FixedRangeVolumeProfileInteractionState = {
  phase: 'inactive',
  selectedId: null,
  draft: null,
}

export function isFixedRangeVolumeProfileToolActive(
  state: FixedRangeVolumeProfileInteractionState,
): boolean {
  return state.phase === 'armed' || state.phase === 'preview'
}

export function isFixedRangeVolumeProfileChartNavigationLocked(
  state: FixedRangeVolumeProfileInteractionState,
): boolean {
  return isFixedRangeVolumeProfileToolActive(state) || state.phase === 'resizing'
}

export function armFixedRangeVolumeProfileTool(): FixedRangeVolumeProfileInteractionState {
  return { phase: 'armed', selectedId: null, draft: null }
}

export function cancelFixedRangeVolumeProfileInteraction(
  state: FixedRangeVolumeProfileInteractionState,
): FixedRangeVolumeProfileInteractionState {
  if (state.phase === 'resizing') {
    return { phase: 'inactive', selectedId: state.selectedId, draft: null }
  }
  if (state.phase === 'inactive' && state.draft === null) {
    return { ...state, draft: null }
  }
  if (state.phase === 'inactive') {
    return { phase: 'inactive', selectedId: state.selectedId, draft: null }
  }
  return INITIAL_FIXED_RANGE_VP_INTERACTION_STATE
}

export function applyFixedRangeVolumeProfileSelection(
  state: FixedRangeVolumeProfileInteractionState,
  selectedId: string | null,
): FixedRangeVolumeProfileInteractionState {
  if (state.phase === 'armed' || state.phase === 'preview' || state.phase === 'resizing') {
    return state
  }
  if (state.selectedId === selectedId) return state
  return { ...state, selectedId }
}

export function applyFixedRangeVolumeProfileCrosshairTime(
  state: FixedRangeVolumeProfileInteractionState,
  hoverTime: number | null,
): FixedRangeVolumeProfileInteractionState {
  if (state.phase !== 'preview' || state.draft?.kind !== 'create' || hoverTime === null) {
    return state
  }
  if (!Number.isFinite(hoverTime)) return state
  const previewTime = Math.trunc(hoverTime)
  if (!isValidUnixChartTimeSeconds(previewTime)) return state
  if (previewTime === state.draft.previewTime) return state
  return {
    phase: 'preview',
    selectedId: state.selectedId,
    draft: { ...state.draft, previewTime },
  }
}

export type FixedRangeVolumeProfileClickResult = {
  state: FixedRangeVolumeProfileInteractionState
  completedInstance: FixedRangeVolumeProfileInstance | null
}

export function applyFixedRangeVolumeProfileClick(
  state: FixedRangeVolumeProfileInteractionState,
  clickTime: number | null,
  existingInstances: readonly FixedRangeVolumeProfileInstance[],
  selectionInterval: CandleInterval,
): FixedRangeVolumeProfileClickResult {
  if (!isFixedRangeVolumeProfileToolActive(state) || clickTime === null || !Number.isFinite(clickTime)) {
    return { state, completedInstance: null }
  }

  const time = Math.trunc(clickTime)
  if (!isValidUnixChartTimeSeconds(time)) {
    return { state, completedInstance: null }
  }

  if (state.phase === 'armed') {
    return {
      state: {
        phase: 'preview',
        selectedId: state.selectedId,
        draft: { kind: 'create', anchorTime: time, previewTime: time },
      },
      completedInstance: null,
    }
  }

  if (state.phase !== 'preview' || state.draft?.kind !== 'create') {
    return { state, completedInstance: null }
  }

  const instance = createFixedRangeVolumeProfileInstance({
    fromTime: state.draft.anchorTime,
    toTime: time,
    selectionInterval,
    existingIds: new Set(existingInstances.map((item) => item.id)),
    siblingInstances: existingInstances,
  })

  if (!instance) {
    return {
      state: { phase: 'armed', selectedId: state.selectedId, draft: null },
      completedInstance: null,
    }
  }

  return {
    state: INITIAL_FIXED_RANGE_VP_INTERACTION_STATE,
    completedInstance: instance,
  }
}

export function startFixedRangeVolumeProfileResizeDraft(
  state: FixedRangeVolumeProfileInteractionState,
  instance: FixedRangeVolumeProfileInstance,
  endpoint: FixedRangeVolumeProfileEndpointKind,
): FixedRangeVolumeProfileInteractionState {
  if (state.phase !== 'inactive') return state
  const previewPointerTime = endpoint === 'start' ? instance.fromTime : instance.toTime
  return {
    phase: 'resizing',
    selectedId: instance.id,
    draft: {
      kind: 'resize',
      instanceId: instance.id,
      endpoint,
      initialFromTime: instance.fromTime,
      initialToTime: instance.toTime,
      previewPointerTime,
    },
  }
}

export function applyFixedRangeVolumeProfileResizePreview(
  state: FixedRangeVolumeProfileInteractionState,
  pointerTime: number | null,
): FixedRangeVolumeProfileInteractionState {
  if (state.phase !== 'resizing' || state.draft?.kind !== 'resize' || pointerTime === null) {
    return state
  }
  if (!Number.isFinite(pointerTime)) return state
  const previewPointerTime = Math.trunc(pointerTime)
  if (!isValidUnixChartTimeSeconds(previewPointerTime)) return state
  if (state.draft.previewPointerTime === previewPointerTime) return state
  return {
    ...state,
    draft: { ...state.draft, previewPointerTime },
  }
}

export function resolveFixedRangeVolumeProfileInstancesForDisplay(
  instances: readonly FixedRangeVolumeProfileInstance[],
  interaction: FixedRangeVolumeProfileInteractionState,
): readonly FixedRangeVolumeProfileInstance[] {
  if (interaction.phase !== 'resizing' || interaction.draft?.kind !== 'resize') {
    return instances
  }
  const normalized = previewFixedRangeVolumeProfileTimesFromResize(
    interaction,
    interaction.draft.previewPointerTime,
  )
  if (!normalized) return instances
  const { instanceId } = interaction.draft
  return instances.map((instance) => {
    if (instance.id !== instanceId) return instance
    if (
      instance.fromTime === normalized.fromTime &&
      instance.toTime === normalized.toTime
    ) {
      return instance
    }
    return { ...instance, fromTime: normalized.fromTime, toTime: normalized.toTime }
  })
}

export function previewFixedRangeVolumeProfileTimesFromResize(
  state: FixedRangeVolumeProfileInteractionState,
  pointerTime: number,
): { fromTime: number; toTime: number } | null {
  if (state.phase !== 'resizing' || state.draft?.kind !== 'resize') return null
  if (!Number.isFinite(pointerTime)) return null
  const time = Math.trunc(pointerTime)
  if (!isValidUnixChartTimeSeconds(time)) return null
  const draft = state.draft
  const fromTime = draft.endpoint === 'start' ? time : draft.initialFromTime
  const toTime = draft.endpoint === 'end' ? time : draft.initialToTime
  return normalizeFixedRangeVolumeProfileTimes(fromTime, toTime)
}

export type FixedRangeVolumeProfileResizeCommitResult = {
  state: FixedRangeVolumeProfileInteractionState
  updatedInstance: FixedRangeVolumeProfileInstance | null
}

export function commitFixedRangeVolumeProfileResize(
  state: FixedRangeVolumeProfileInteractionState,
  instances: readonly FixedRangeVolumeProfileInstance[],
  pointerTime: number,
): FixedRangeVolumeProfileResizeCommitResult {
  if (state.phase !== 'resizing' || state.draft?.kind !== 'resize') {
    return { state, updatedInstance: null }
  }
  const normalized = previewFixedRangeVolumeProfileTimesFromResize(state, pointerTime)
  if (!normalized) {
    return {
      state: { phase: 'inactive', selectedId: state.selectedId, draft: null },
      updatedInstance: null,
    }
  }
  const draft = state.draft
  if (draft?.kind !== 'resize') {
    return { state, updatedInstance: null }
  }
  const existing = instances.find((item) => item.id === draft.instanceId)
  if (!existing) {
    return {
      state: { phase: 'inactive', selectedId: null, draft: null },
      updatedInstance: null,
    }
  }
  const updatedInstance = {
    ...existing,
    fromTime: normalized.fromTime,
    toTime: normalized.toTime,
  }
  return {
    state: { phase: 'inactive', selectedId: updatedInstance.id, draft: null },
    updatedInstance,
  }
}
