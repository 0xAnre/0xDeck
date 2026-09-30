import {
  createFixedRangeVolumeProfileInstance,
  isValidUnixChartTimeSeconds,
  type FixedRangeVolumeProfileInstance,
} from './fixedRangeVolumeProfileInstances.ts'
import type { CandleInterval } from './types.ts'

export type FixedRangeVolumeProfileToolPhase = 'inactive' | 'armed' | 'preview'

export type FixedRangeVolumeProfileDraft = {
  anchorTime: number
  previewTime: number
}

export type FixedRangeVolumeProfileInteractionState = {
  phase: FixedRangeVolumeProfileToolPhase
  draft: FixedRangeVolumeProfileDraft | null
}

export const INITIAL_FIXED_RANGE_VP_INTERACTION_STATE: FixedRangeVolumeProfileInteractionState = {
  phase: 'inactive',
  draft: null,
}

export function isFixedRangeVolumeProfileToolActive(
  state: FixedRangeVolumeProfileInteractionState,
): boolean {
  return state.phase === 'armed' || state.phase === 'preview'
}

export function armFixedRangeVolumeProfileTool(): FixedRangeVolumeProfileInteractionState {
  return { phase: 'armed', draft: null }
}

export function cancelFixedRangeVolumeProfileInteraction(
  state: FixedRangeVolumeProfileInteractionState,
): FixedRangeVolumeProfileInteractionState {
  if (state.phase === 'inactive') return state
  return INITIAL_FIXED_RANGE_VP_INTERACTION_STATE
}

export function applyFixedRangeVolumeProfileCrosshairTime(
  state: FixedRangeVolumeProfileInteractionState,
  hoverTime: number | null,
): FixedRangeVolumeProfileInteractionState {
  if (state.phase !== 'preview' || state.draft === null || hoverTime === null) {
    return state
  }
  if (!Number.isFinite(hoverTime)) return state
  const previewTime = Math.trunc(hoverTime)
  if (!isValidUnixChartTimeSeconds(previewTime)) return state
  if (previewTime === state.draft.previewTime) return state
  return {
    phase: 'preview',
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
        draft: { anchorTime: time, previewTime: time },
      },
      completedInstance: null,
    }
  }

  if (state.phase !== 'preview' || state.draft === null) {
    return { state, completedInstance: null }
  }

  const instance = createFixedRangeVolumeProfileInstance({
    fromTime: state.draft.anchorTime,
    toTime: time,
    selectionInterval,
    existingIds: new Set(existingInstances.map((item) => item.id)),
  })

  if (!instance) {
    return {
      state: { phase: 'armed', draft: null },
      completedInstance: null,
    }
  }

  return {
    state: INITIAL_FIXED_RANGE_VP_INTERACTION_STATE,
    completedInstance: instance,
  }
}
