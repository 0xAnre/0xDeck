import {
  isFixedRangeVolumeProfileChartNavigationLocked,
  type FixedRangeVolumeProfileInteractionState,
} from './fixedRangeVolumeProfileInteraction.ts'
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
