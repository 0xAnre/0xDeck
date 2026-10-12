import { pointerMovementWithinClickTolerance } from './chartObjectState.ts'

const DOUBLE_CLICK_INTERVAL_MS = 500
const DOUBLE_CLICK_MAX_POINTER_MOVE_PX = 10

type PointerClickRecord = {
  time: number
  clientX: number
  clientY: number
}

const lastCompletedClickByPane = new WeakMap<HTMLElement, PointerClickRecord>()
const pendingClickByPane = new WeakMap<HTMLElement, PointerClickRecord>()
const awaitingSecondPressForDoubleClickByPane = new WeakMap<HTMLElement, boolean>()
const dragTaintedDoubleClickByPane = new WeakMap<HTMLElement, PointerClickRecord>()

function setDragTaintForSettingsSuppression(
  paneElement: HTMLElement,
  clientX: number,
  clientY: number,
  now: number,
): void {
  dragTaintedDoubleClickByPane.set(paneElement, { time: now, clientX, clientY })
}

export function clearAwaitingSecondPressForDoubleClick(paneElement: HTMLElement): void {
  awaitingSecondPressForDoubleClickByPane.delete(paneElement)
}

function isWithinDoubleClickDistance(
  a: PointerClickRecord,
  clientX: number,
  clientY: number,
): boolean {
  return (
    Math.hypot(clientX - a.clientX, clientY - a.clientY) <=
    DOUBLE_CLICK_MAX_POINTER_MOVE_PX
  )
}

/**
 * Pointer Events sets `detail` to 0 on `pointerdown`, so double-click handling
 * must track the click sequence independently of `event.detail`.
 *
 * When the user presses again soon after a completed click at the same spot,
 * consume the stored click so drag can start on this press; a release within
 * click tolerance cancels the drag without committing (see pane pointer up handlers).
 */
export function consumeCompletedClickForDoubleClickSequence(
  paneElement: HTMLElement,
  clientX: number,
  clientY: number,
  now: number = performance.now(),
): boolean {
  const last = lastCompletedClickByPane.get(paneElement)
  if (
    last &&
    now - last.time <= DOUBLE_CLICK_INTERVAL_MS &&
    isWithinDoubleClickDistance(last, clientX, clientY)
  ) {
    lastCompletedClickByPane.delete(paneElement)
    pendingClickByPane.delete(paneElement)
    awaitingSecondPressForDoubleClickByPane.set(paneElement, true)
    return true
  }
  return false
}

/** Begin tracking a press; only completed clicks are promoted to `lastCompleted`. */
export function armPanePointerClickForDoubleClick(
  paneElement: HTMLElement,
  clientX: number,
  clientY: number,
  now: number = performance.now(),
): void {
  pendingClickByPane.set(paneElement, { time: now, clientX, clientY })
}

export function invalidatePanePointerClickForDoubleClickOnDrag(
  paneElement: HTMLElement,
  startClientX: number,
  startClientY: number,
  clientX: number,
  clientY: number,
  now: number = performance.now(),
): void {
  if (
    !pointerMovementWithinClickTolerance(
      startClientX,
      startClientY,
      clientX,
      clientY,
    )
  ) {
    pendingClickByPane.delete(paneElement)
    setDragTaintForSettingsSuppression(paneElement, startClientX, startClientY, now)
  }
}

/** Clear sequence state after a committed drag so later presses are not misclassified. */
export function markPanePointerDragCommittedForSettingsSuppression(
  paneElement: HTMLElement,
  clientX: number,
  clientY: number,
  now: number = performance.now(),
): void {
  pendingClickByPane.delete(paneElement)
  lastCompletedClickByPane.delete(paneElement)
  awaitingSecondPressForDoubleClickByPane.delete(paneElement)
  setDragTaintForSettingsSuppression(paneElement, clientX, clientY, now)
}

export function completePaneDoubleClickSequenceForSettings(paneElement: HTMLElement): void {
  pendingClickByPane.delete(paneElement)
  lastCompletedClickByPane.delete(paneElement)
  clearAwaitingSecondPressForDoubleClick(paneElement)
}

/**
 * A line/rectangle drag committed on this pane; ignore the next `dblclick` only while
 * still within the double-click interval (including first-gesture drags in the 4–10 px gap).
 */
export function markPaneDoubleClickSequenceDragTainted(
  paneElement: HTMLElement,
  clientX: number,
  clientY: number,
  now: number = performance.now(),
): void {
  setDragTaintForSettingsSuppression(paneElement, clientX, clientY, now)
}

export function shouldSuppressChartObjectSettingsDoubleClick(
  paneElement: HTMLElement,
  clientX: number,
  clientY: number,
  now: number = performance.now(),
): boolean {
  const tainted = dragTaintedDoubleClickByPane.get(paneElement)
  if (tainted === undefined) {
    return false
  }
  if (now - tainted.time > DOUBLE_CLICK_INTERVAL_MS) {
    dragTaintedDoubleClickByPane.delete(paneElement)
    return false
  }
  if (!isWithinDoubleClickDistance(tainted, clientX, clientY)) {
    return false
  }
  dragTaintedDoubleClickByPane.delete(paneElement)
  return true
}

export function commitPanePointerClickForDoubleClick(paneElement: HTMLElement): void {
  const pending = pendingClickByPane.get(paneElement)
  if (!pending) return
  lastCompletedClickByPane.set(paneElement, pending)
  pendingClickByPane.delete(paneElement)
}

export function cancelPanePointerClickForDoubleClick(paneElement: HTMLElement): void {
  pendingClickByPane.delete(paneElement)
}
