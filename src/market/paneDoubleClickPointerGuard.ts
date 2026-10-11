const DOUBLE_CLICK_INTERVAL_MS = 500
const DOUBLE_CLICK_MAX_POINTER_MOVE_PX = 10

type PointerClickRecord = {
  time: number
  clientX: number
  clientY: number
}

const lastCompletedClickByPane = new WeakMap<HTMLElement, PointerClickRecord>()
const pendingClickByPane = new WeakMap<HTMLElement, PointerClickRecord>()

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
 * Pointer Events sets `detail` to 0 on `pointerdown`, so double-click suppression
 * must track the click sequence independently of `event.detail`.
 */
export function shouldSuppressPanePointerDownForDoubleClick(
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
  }
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
