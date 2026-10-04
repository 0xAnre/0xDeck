import {
  createHorizontalLineInstance,
  type HorizontalLineInstance,
} from './horizontalLineInstances.ts'

export type HorizontalLineToolPhase = 'inactive' | 'armed'

export type HorizontalLineInteractionState = {
  phase: HorizontalLineToolPhase
}

export const INITIAL_HORIZONTAL_LINE_INTERACTION_STATE: HorizontalLineInteractionState = {
  phase: 'inactive',
}

export function isHorizontalLineToolArmed(state: HorizontalLineInteractionState): boolean {
  return state.phase === 'armed'
}

export function armHorizontalLineTool(): HorizontalLineInteractionState {
  return { phase: 'armed' }
}

export function cancelHorizontalLineInteraction(
  state: HorizontalLineInteractionState,
): HorizontalLineInteractionState {
  if (state.phase === 'inactive') return state
  return INITIAL_HORIZONTAL_LINE_INTERACTION_STATE
}

export type HorizontalLineClickResult = {
  state: HorizontalLineInteractionState
  completedInstance: HorizontalLineInstance | null
}

export function applyHorizontalLineClick(
  state: HorizontalLineInteractionState,
  clickPrice: number | null,
  existingInstances: readonly HorizontalLineInstance[],
): HorizontalLineClickResult {
  if (!isHorizontalLineToolArmed(state) || clickPrice === null) {
    return { state, completedInstance: null }
  }

  const instance = createHorizontalLineInstance({
    price: clickPrice,
    existingIds: new Set(existingInstances.map((item) => item.id)),
  })

  if (!instance) {
    return { state, completedInstance: null }
  }

  return {
    state: INITIAL_HORIZONTAL_LINE_INTERACTION_STATE,
    completedInstance: instance,
  }
}
