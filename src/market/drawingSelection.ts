import {
  INITIAL_FIXED_RANGE_VP_INTERACTION_STATE,
  applyFixedRangeVolumeProfileSelection,
  isFixedRangeVolumeProfileChartNavigationLocked,
  isFixedRangeVolumeProfileToolActive,
  type FixedRangeVolumeProfileInteractionState,
} from './fixedRangeVolumeProfileInteraction.ts'
import {
  applyLineSelection,
  isLineChartNavigationLocked,
  type LineInteractionState,
} from './lineInteraction.ts'
import {
  applyRectangleSelection,
  isRectangleChartNavigationLocked,
  type RectangleInteractionState,
} from './rectangleInteraction.ts'
import {
  INITIAL_ANCHORED_VWAP_DRAWING_INTERACTION_STATE,
  applyAnchoredVwapDrawingSelection,
  isAnchoredVwapDrawingNavigationLocked,
  isAnchoredVwapDrawingToolArmed,
  type AnchoredVwapDrawingInteractionState,
} from './anchoredVwapDrawingInteraction.ts'

export function releaseLineInteractionForPeerTool(
  state: LineInteractionState,
): LineInteractionState {
  if (state.phase === 'inactive' && state.draft === null && state.selectedId === null) {
    return state
  }
  return { phase: 'inactive', selectedId: null, draft: null }
}

export function releaseRectangleInteractionForPeerTool(
  state: RectangleInteractionState,
): RectangleInteractionState {
  if (state.phase === 'inactive' && state.draft === null && state.selectedId === null) {
    return state
  }
  return { phase: 'inactive', selectedId: null, draft: null }
}

export function releaseAnchoredVwapDrawingInteractionForPeerTool(
  state: AnchoredVwapDrawingInteractionState,
): AnchoredVwapDrawingInteractionState {
  if (
    isAnchoredVwapDrawingNavigationLocked(state) ||
    isAnchoredVwapDrawingToolArmed(state)
  ) {
    return INITIAL_ANCHORED_VWAP_DRAWING_INTERACTION_STATE
  }
  if (state.phase === 'inactive' && state.selectedId === null && state.draft === null) {
    return state
  }
  return { phase: 'inactive', selectedId: null, draft: null }
}

export function releaseFixedRangeVolumeProfileInteractionForPeerTool(
  state: FixedRangeVolumeProfileInteractionState,
): FixedRangeVolumeProfileInteractionState {
  if (isFixedRangeVolumeProfileToolActive(state) || state.phase === 'resizing') {
    return INITIAL_FIXED_RANGE_VP_INTERACTION_STATE
  }
  if (state.phase === 'inactive' && state.selectedId === null && state.draft === null) {
    return state
  }
  return { phase: 'inactive', selectedId: null, draft: null }
}

export function clearLineSelectionForPeerClaim(
  state: LineInteractionState,
): LineInteractionState {
  if (state.selectedId === null || isLineChartNavigationLocked(state)) return state
  return { ...state, selectedId: null }
}

export function clearRectangleSelectionForPeerClaim(
  state: RectangleInteractionState,
): RectangleInteractionState {
  if (state.selectedId === null || isRectangleChartNavigationLocked(state)) return state
  return { ...state, selectedId: null }
}

export function clearFixedRangeVolumeProfileSelectionForPeerClaim(
  state: FixedRangeVolumeProfileInteractionState,
): FixedRangeVolumeProfileInteractionState {
  if (state.selectedId === null || isFixedRangeVolumeProfileChartNavigationLocked(state)) {
    return state
  }
  return { ...state, selectedId: null }
}

export function clearLineAndRectangleSelectionForFrvpClaim(
  line: LineInteractionState,
  rectangle: RectangleInteractionState,
): { line: LineInteractionState; rectangle: RectangleInteractionState } {
  const nextLine = clearLineSelectionForPeerClaim(line)
  const nextRectangle = clearRectangleSelectionForPeerClaim(rectangle)
  if (nextLine === line && nextRectangle === rectangle) {
    return { line, rectangle }
  }
  return { line: nextLine, rectangle: nextRectangle }
}

export function withExclusiveLineSelection(
  line: LineInteractionState,
  rectangle: RectangleInteractionState,
  frvp: FixedRangeVolumeProfileInteractionState = {
    phase: 'inactive',
    selectedId: null,
    draft: null,
  },
): {
  line: LineInteractionState
  rectangle: RectangleInteractionState
  frvp: FixedRangeVolumeProfileInteractionState
} {
  if (line.selectedId === null) return { line, rectangle, frvp }
  const nextRectangle = clearRectangleSelectionForPeerClaim(rectangle)
  const nextFrvp = clearFixedRangeVolumeProfileSelectionForPeerClaim(frvp)
  if (nextRectangle === rectangle && nextFrvp === frvp) return { line, rectangle, frvp }
  return { line, rectangle: nextRectangle, frvp: nextFrvp }
}

export function withExclusiveRectangleSelection(
  rectangle: RectangleInteractionState,
  line: LineInteractionState,
  frvp: FixedRangeVolumeProfileInteractionState = {
    phase: 'inactive',
    selectedId: null,
    draft: null,
  },
): {
  rectangle: RectangleInteractionState
  line: LineInteractionState
  frvp: FixedRangeVolumeProfileInteractionState
} {
  if (rectangle.selectedId === null) return { rectangle, line, frvp }
  const nextLine = clearLineSelectionForPeerClaim(line)
  const nextFrvp = clearFixedRangeVolumeProfileSelectionForPeerClaim(frvp)
  if (nextLine === line && nextFrvp === frvp) return { rectangle, line, frvp }
  return { rectangle, line: nextLine, frvp: nextFrvp }
}

export function withExclusiveFrvpSelection(
  frvp: FixedRangeVolumeProfileInteractionState,
  line: LineInteractionState,
  rectangle: RectangleInteractionState,
): {
  frvp: FixedRangeVolumeProfileInteractionState
  line: LineInteractionState
  rectangle: RectangleInteractionState
} {
  if (frvp.selectedId === null || isFixedRangeVolumeProfileChartNavigationLocked(frvp)) {
    return { frvp, line, rectangle }
  }
  const nextLine = clearLineSelectionForPeerClaim(line)
  const nextRectangle = clearRectangleSelectionForPeerClaim(rectangle)
  if (nextLine === line && nextRectangle === rectangle) return { frvp, line, rectangle }
  return { frvp, line: nextLine, rectangle: nextRectangle }
}

/** Selection state of every drawing tool at once. */
export type DrawingSelectionStates = {
  rectangle: RectangleInteractionState
  line: LineInteractionState
  fixedRangeVolumeProfile: FixedRangeVolumeProfileInteractionState
  anchoredVwap: AnchoredVwapDrawingInteractionState
}

export function hasDrawingSelection(states: DrawingSelectionStates): boolean {
  return (
    states.rectangle.selectedId !== null ||
    states.line.selectedId !== null ||
    states.fixedRangeVolumeProfile.selectedId !== null ||
    states.anchoredVwap.selectedId !== null
  )
}

/**
 * Deselect every drawing tool, used by an empty-space click outside the candle
 * pane (RSI / liquidation panes) where no tool pointer module is listening.
 *
 * Returns `null` when nothing was selected so callers keep the same state
 * objects and skip a re-render; armed and in-progress gestures are left alone
 * by the per-tool `apply*Selection` helpers.
 */
export function clearDrawingSelections(
  states: DrawingSelectionStates,
): DrawingSelectionStates | null {
  const rectangle = applyRectangleSelection(states.rectangle, null)
  const line = applyLineSelection(states.line, null)
  const fixedRangeVolumeProfile = applyFixedRangeVolumeProfileSelection(
    states.fixedRangeVolumeProfile,
    null,
  )
  const anchoredVwap = applyAnchoredVwapDrawingSelection(states.anchoredVwap, null)
  if (
    rectangle === states.rectangle &&
    line === states.line &&
    fixedRangeVolumeProfile === states.fixedRangeVolumeProfile &&
    anchoredVwap === states.anchoredVwap
  ) {
    return null
  }
  return { rectangle, line, fixedRangeVolumeProfile, anchoredVwap }
}
