import {
  isLineChartNavigationLocked,
  type LineInteractionState,
} from './lineInteraction.ts'
import {
  isRectangleChartNavigationLocked,
  type RectangleInteractionState,
} from './rectangleInteraction.ts'

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

export function withExclusiveLineSelection(
  line: LineInteractionState,
  rectangle: RectangleInteractionState,
): { line: LineInteractionState; rectangle: RectangleInteractionState } {
  if (line.selectedId === null) return { line, rectangle }
  const nextRectangle = clearRectangleSelectionForPeerClaim(rectangle)
  if (nextRectangle === rectangle) return { line, rectangle }
  return { line, rectangle: nextRectangle }
}

export function withExclusiveRectangleSelection(
  rectangle: RectangleInteractionState,
  line: LineInteractionState,
): { rectangle: RectangleInteractionState; line: LineInteractionState } {
  if (rectangle.selectedId === null) return { rectangle, line }
  const nextLine = clearLineSelectionForPeerClaim(line)
  if (nextLine === line) return { rectangle, line }
  return { rectangle, line: nextLine }
}
