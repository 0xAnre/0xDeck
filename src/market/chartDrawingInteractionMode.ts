import type { IChartApi } from 'lightweight-charts'
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
): boolean {
  return (
    isRectangleChartNavigationLocked(rectangleInteraction) ||
    isLineChartNavigationLocked(lineInteraction)
  )
}

export function applyChartDrawingInteractionMode(
  chart: IChartApi,
  rectangleInteraction: RectangleInteractionState,
  lineInteraction: LineInteractionState,
  frvpInteraction: FixedRangeVolumeProfileInteractionState,
): void {
  const drawingLocked = isAnyChartDrawingNavigationLocked(rectangleInteraction, lineInteraction)
  const frvpLocked = isFixedRangeVolumeProfileChartInteractionLocked(frvpInteraction)
  if (drawingLocked) {
    applyFixedRangeVolumeProfileChartInteractionMode(chart, {
      phase: 'armed',
      draft: null,
    })
    return
  }
  applyFixedRangeVolumeProfileChartInteractionMode(chart, frvpInteraction)
  if (frvpLocked) return
}
