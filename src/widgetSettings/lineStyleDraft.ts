/**
 * Draft / diff logic for `LineStyleDialog` (line tool settings).
 *
 * The dialog edits a local draft; `Save` commits only the fields that differ
 * from the values the dialog opened with, and `Cancel` / `X` / `Esc` /
 * outside click simply drop the draft. Pure functions only — no JSX, no DOM.
 */
import {
  isLineChartHexColor,
  isLineChartStrokeWidth,
  sanitizeLineChartStrokeStyle,
  type LineChartStrokeStyle,
  type LineChartStrokeWidth,
} from '../market/lineChartStroke.ts'
import {
  lineInstanceStrokeOpacityPercent,
  lineInstanceStrokeStyle,
  lineInstanceStrokeWidth,
  type LineInstance,
} from '../market/lineInstances.ts'
import { readLineStrokeColorHexForInstance } from '../market/lineColors.ts'
import { isMarketStyleOpacityPercent } from '../market/marketStylePalette.ts'

export type LineStyleDraft = {
  color: string
  opacityPercent: number
  lineWidth: LineChartStrokeWidth
  lineStyle: LineChartStrokeStyle
}

/** Field subset to commit; absent keys are unchanged and must not be applied. */
export type LineStyleDraftPatch = {
  strokeColor?: string
  strokeOpacity?: number
  lineWidth?: LineChartStrokeWidth
  lineStyle?: LineChartStrokeStyle
}

/** Resolved presentation values shown by the dialog when it opens. */
export function lineStyleDraftFromInstance(instance: LineInstance): LineStyleDraft {
  return {
    color: readLineStrokeColorHexForInstance(instance),
    opacityPercent: lineInstanceStrokeOpacityPercent(instance),
    lineWidth: lineInstanceStrokeWidth(instance),
    lineStyle: lineInstanceStrokeStyle(instance),
  }
}

/** Coerce a draft to storable values; invalid fields fall back to `initial`. */
export function sanitizeLineStyleDraft(
  initial: LineStyleDraft,
  draft: LineStyleDraft,
): LineStyleDraft {
  return {
    color: isLineChartHexColor(draft.color) ? draft.color : initial.color,
    opacityPercent: isMarketStyleOpacityPercent(draft.opacityPercent)
      ? draft.opacityPercent
      : initial.opacityPercent,
    lineWidth: isLineChartStrokeWidth(draft.lineWidth) ? draft.lineWidth : initial.lineWidth,
    lineStyle: sanitizeLineChartStrokeStyle(draft.lineStyle) ?? initial.lineStyle,
  }
}

/** Changed fields only: unchanged fields produce no patch entry. */
export function lineStyleDraftPatch(
  initial: LineStyleDraft,
  draft: LineStyleDraft,
): LineStyleDraftPatch {
  const patch: LineStyleDraftPatch = {}
  if (draft.color !== initial.color) patch.strokeColor = draft.color
  if (draft.opacityPercent !== initial.opacityPercent) {
    patch.strokeOpacity = draft.opacityPercent
  }
  if (draft.lineWidth !== initial.lineWidth) patch.lineWidth = draft.lineWidth
  if (draft.lineStyle !== initial.lineStyle) patch.lineStyle = draft.lineStyle
  return patch
}

export function isLineStyleDraftPatchEmpty(patch: LineStyleDraftPatch): boolean {
  return Object.keys(patch).length === 0
}
