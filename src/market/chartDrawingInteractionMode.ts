import type { IChartApi } from 'lightweight-charts'
import {
  INITIAL_ANCHORED_VWAP_DRAWING_INTERACTION_STATE,
  isAnchoredVwapDrawingNavigationLocked,
  type AnchoredVwapDrawingInteractionState,
} from './anchoredVwapDrawingInteraction.ts'
import {
  applyFixedRangeVolumeProfileChartInteractionMode,
  isFixedRangeVolumeProfileChartInteractionLocked,
} from './fixedRangeVolumeProfileChartTool.ts'
import type { FixedRangeVolumeProfileInteractionState } from './fixedRangeVolumeProfileInteraction.ts'
import { isLineChartNavigationLocked, type LineInteractionState } from './lineInteraction.ts'
import { isRectangleChartNavigationLocked, type RectangleInteractionState } from './rectangleInteraction.ts'

export function isAnyChartDrawingNavigationLocked(
  rectangleInteraction: RectangleInteractionState,
  lineInteraction: LineInteractionState,
  anchoredVwapInteraction: AnchoredVwapDrawingInteractionState = INITIAL_ANCHORED_VWAP_DRAWING_INTERACTION_STATE,
): boolean {
  return (
    isRectangleChartNavigationLocked(rectangleInteraction) ||
    isLineChartNavigationLocked(lineInteraction) ||
    isAnchoredVwapDrawingNavigationLocked(anchoredVwapInteraction)
  )
}

export function applyChartDrawingInteractionMode(
  chart: IChartApi,
  rectangleInteraction: RectangleInteractionState,
  lineInteraction: LineInteractionState,
  frvpInteraction: FixedRangeVolumeProfileInteractionState,
  anchoredVwapInteraction: AnchoredVwapDrawingInteractionState = INITIAL_ANCHORED_VWAP_DRAWING_INTERACTION_STATE,
): void {
  const drawingLocked = isAnyChartDrawingNavigationLocked(
    rectangleInteraction,
    lineInteraction,
    anchoredVwapInteraction,
  )
  const frvpLocked = isFixedRangeVolumeProfileChartInteractionLocked(frvpInteraction)
  if (drawingLocked) {
    applyFixedRangeVolumeProfileChartInteractionMode(chart, {
      phase: 'armed',
      selectedId: null,
      draft: null,
    })
    return
  }
  applyFixedRangeVolumeProfileChartInteractionMode(chart, frvpInteraction)
  if (frvpLocked) return
}
