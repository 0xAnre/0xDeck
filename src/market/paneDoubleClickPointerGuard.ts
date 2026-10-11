const DOUBLE_CLICK_INTERVAL_MS = 500
const DOUBLE_CLICK_MAX_POINTER_MOVE_PX = 10

type PointerClickRecord = {
  time: number
  clientX: number
  clientY: number
}

const lastCompletedClickByPane = new WeakMap<HTMLElement, PointerClickRecord>()
const pendingClickByPane = new WeakMap<HTMLElement, PointerClickRecord>()
const dragTaintedDoubleClickByPane = new WeakMap<HTMLElement, boolean>()

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
): void {
  if (
    !isWithinDoubleClickDistance(
      { time: 0, clientX: startClientX, clientY: startClientY },
      clientX,
      clientY,
    )
  ) {
    pendingClickByPane.delete(paneElement)
    markPaneDoubleClickSequenceDragTainted(paneElement)
  }
}

/** Either press in a click sequence moved enough to commit a drag; ignore the next `dblclick`. */
export function markPaneDoubleClickSequenceDragTainted(paneElement: HTMLElement): void {
  dragTaintedDoubleClickByPane.set(paneElement, true)
}

export function shouldSuppressChartObjectSettingsDoubleClick(
  paneElement: HTMLElement,
): boolean {
  if (!dragTaintedDoubleClickByPane.get(paneElement)) {
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
