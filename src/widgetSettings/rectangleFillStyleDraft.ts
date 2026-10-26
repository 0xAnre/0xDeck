/**
 * Draft / diff logic for `RectangleFillStyleDialog`.
 *
 * Same draft + Save contract as the other chart settings dialogs, restricted to
 * the rectangle fill color/opacity pair (the fill uses the shared
 * `ColorOpacityField` without the Line/Dot row). Pure functions only.
 */
import { isMarketStyleHexColor, isMarketStyleOpacityPercent } from '../market/marketStylePalette.ts'
import {
  rectangleInstanceFillOpacityPercent,
  type RectangleInstance,
} from '../market/rectangleInstances.ts'
import { rectangleInstancePickerFillHex } from '../market/rectangleColors.ts'

export type RectangleFillStyleDraft = {
  fillColor: string
  fillOpacityPercent: number
}

export type RectangleFillStyleDraftPatch = {
  fillColor?: string
  fillOpacity?: number
}

export function rectangleFillStyleDraftFromInstance(
  instance: RectangleInstance,
): RectangleFillStyleDraft {
  return {
    fillColor: rectangleInstancePickerFillHex(instance),
    fillOpacityPercent: rectangleInstanceFillOpacityPercent(instance),
  }
}

/** Coerce a draft to storable values; invalid fields fall back to `initial`. */
export function sanitizeRectangleFillStyleDraft(
  initial: RectangleFillStyleDraft,
  draft: RectangleFillStyleDraft,
): RectangleFillStyleDraft {
  return {
    fillColor: isMarketStyleHexColor(draft.fillColor) ? draft.fillColor : initial.fillColor,
    fillOpacityPercent: isMarketStyleOpacityPercent(draft.fillOpacityPercent)
      ? draft.fillOpacityPercent
      : initial.fillOpacityPercent,
  }
}

export function rectangleFillStyleDraftPatch(
  initial: RectangleFillStyleDraft,
  draft: RectangleFillStyleDraft,
): RectangleFillStyleDraftPatch {
  const patch: RectangleFillStyleDraftPatch = {}
  if (draft.fillColor !== initial.fillColor) patch.fillColor = draft.fillColor
  if (draft.fillOpacityPercent !== initial.fillOpacityPercent) {
    patch.fillOpacity = draft.fillOpacityPercent
  }
  return patch
}

export function isRectangleFillStyleDraftPatchEmpty(
  patch: RectangleFillStyleDraftPatch,
): boolean {
  return Object.keys(patch).length === 0
}
