import {
  createDottedLineInstance,
  isValidChartPrice,
  type DottedLineAnchor,
  type DottedLineInstance,
} from './dottedLineInstances.ts'
import { isValidUnixChartTimeSeconds } from './fixedRangeVolumeProfileInstances.ts'

export type DottedLineToolPhase = 'inactive' | 'armed' | 'preview'

export type DottedLineDraft = {
  anchor: DottedLineAnchor
  preview: DottedLineAnchor
}

export type DottedLineInteractionState = {
  phase: DottedLineToolPhase
  draft: DottedLineDraft | null
}

export const INITIAL_DOTTED_LINE_INTERACTION_STATE: DottedLineInteractionState = {
  phase: 'inactive',
  draft: null,
}

export function isDottedLineToolActive(state: DottedLineInteractionState): boolean {
  return state.phase === 'armed' || state.phase === 'preview'
}

export function armDottedLineTool(): DottedLineInteractionState {
  return { phase: 'armed', draft: null }
}

export function cancelDottedLineInteraction(
  state: DottedLineInteractionState,
): DottedLineInteractionState {
  if (state.phase === 'inactive') return state
  return INITIAL_DOTTED_LINE_INTERACTION_STATE
}

function isValidAnchor(anchor: DottedLineAnchor | null): anchor is DottedLineAnchor {
  if (!anchor) return false
  if (!Number.isFinite(anchor.time) || !Number.isFinite(anchor.price)) return false
  const time = Math.trunc(anchor.time)
  return isValidUnixChartTimeSeconds(time) && isValidChartPrice(anchor.price)
}

export function applyDottedLineCrosshairAnchor(
  state: DottedLineInteractionState,
  hover: DottedLineAnchor | null,
): DottedLineInteractionState {
  if (state.phase !== 'preview' || state.draft === null || !isValidAnchor(hover)) {
    return state
  }
  const preview = { time: Math.trunc(hover.time), price: hover.price }
  if (
    preview.time === state.draft.preview.time &&
    preview.price === state.draft.preview.price
  ) {
    return state
  }
  return {
    phase: 'preview',
    draft: { ...state.draft, preview },
  }
}

export type DottedLineClickResult = {
  state: DottedLineInteractionState
  completedInstance: DottedLineInstance | null
}

export function applyDottedLineClick(
  state: DottedLineInteractionState,
  click: DottedLineAnchor | null,
  existingInstances: readonly DottedLineInstance[],
): DottedLineClickResult {
  if (!isDottedLineToolActive(state) || !isValidAnchor(click)) {
    return { state, completedInstance: null }
  }

  const anchor = { time: Math.trunc(click.time), price: click.price }

  if (state.phase === 'armed') {
    return {
      state: {
        phase: 'preview',
        draft: { anchor, preview: anchor },
      },
      completedInstance: null,
    }
  }

  if (state.phase !== 'preview' || state.draft === null) {
    return { state, completedInstance: null }
  }

  const instance = createDottedLineInstance(
    state.draft.anchor,
    anchor,
    new Set(existingInstances.map((item) => item.id)),
  )

  if (!instance) {
    return {
      state: { phase: 'armed', draft: null },
      completedInstance: null,
    }
  }

  return {
    state: INITIAL_DOTTED_LINE_INTERACTION_STATE,
    completedInstance: instance,
  }
}
