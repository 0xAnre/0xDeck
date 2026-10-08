import {
  isRectangleChartNavigationLocked,
  isRectangleToolArmed,
  type RectangleInteractionState,
} from './rectangleInteraction.ts'

export function isRectangleDrawingBlockingPeerTools(state: RectangleInteractionState): boolean {
  return isRectangleChartNavigationLocked(state) || isRectangleToolArmed(state)
}
