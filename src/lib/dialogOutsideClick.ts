/**
 * Geometry decision for the shared `DialogContent` outside-click guard.
 *
 * Radix `Select` is always modal: while its popup is open it disables pointer
 * events on every layer below it (`disableOutsidePointerEvents`), including the
 * dialog panel. A press that visually lands inside the dialog panel therefore
 * reaches the dialog overlay instead, and Radix reports it as a dialog
 * "outside" interaction. The dialog must not treat such a press as a dismissal.
 *
 * This module is pure so the border/degenerate cases stay unit-tested; the
 * dialog wrapper only supplies the pointer position and its own bounding rect.
 */

export type DialogPointerPosition = {
  clientX: number
  clientY: number
}

export type DialogPanelRect = {
  left: number
  top: number
  right: number
  bottom: number
}

/**
 * True when `point` lies inside a non-degenerate `rect`, borders included.
 *
 * Non-finite coordinates, a missing point/rect, and zero-area or inverted rects
 * all return `false`: a collapsed panel cannot claim a press, so the usual
 * outside-click dismissal stays in effect instead of being swallowed.
 */
export function isPointInsideDialogPanel(
  point: DialogPointerPosition | null | undefined,
  rect: DialogPanelRect | null | undefined,
): boolean {
  if (!point || !rect) return false

  const { clientX, clientY } = point
  const { left, top, right, bottom } = rect
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return false
  if (![left, top, right, bottom].every(Number.isFinite)) return false
  if (right <= left || bottom <= top) return false

  return clientX >= left && clientX <= right && clientY >= top && clientY <= bottom
}
