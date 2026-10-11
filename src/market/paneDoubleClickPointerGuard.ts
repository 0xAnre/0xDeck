const DOUBLE_CLICK_INTERVAL_MS = 500
const DOUBLE_CLICK_MAX_POINTER_MOVE_PX = 10

type PointerClickRecord = {
  time: number
  clientX: number
  clientY: number
}

const lastPointerDownByPane = new WeakMap<HTMLElement, PointerClickRecord>()

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
  const last = lastPointerDownByPane.get(paneElement)
  if (
    last &&
    now - last.time <= DOUBLE_CLICK_INTERVAL_MS &&
    Math.hypot(clientX - last.clientX, clientY - last.clientY) <=
      DOUBLE_CLICK_MAX_POINTER_MOVE_PX
  ) {
    lastPointerDownByPane.delete(paneElement)
    return true
  }
  lastPointerDownByPane.set(paneElement, { time: now, clientX, clientY })
  return false
}
