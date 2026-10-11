export function isChartObjectHidden(hidden?: boolean): boolean {
  return hidden === true
}

export function setChartObjectHidden<T extends { hidden?: boolean }>(
  instance: T,
  hidden: boolean,
): T {
  if (!hidden) {
    const next = { ...instance }
    delete next.hidden
    return next
  }
  return { ...instance, hidden: true }
}

export function setChartObjectLocked<T extends { locked?: boolean }>(
  instance: T,
  locked: boolean,
): T {
  if (!locked) {
    const next = { ...instance }
    delete next.locked
    return next
  }
  return { ...instance, locked: true }
}

export function isChartObjectLocked(locked?: boolean): boolean {
  return locked === true
}

/** Ignore tiny pointer movement when distinguishing click from drag. */
export const CHART_OBJECT_SETTINGS_CLICK_TOLERANCE_PX = 4

export function pointerMovementWithinClickTolerance(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  tolerancePx: number = CHART_OBJECT_SETTINGS_CLICK_TOLERANCE_PX,
): boolean {
  const dx = endX - startX
  const dy = endY - startY
  return dx * dx + dy * dy <= tolerancePx * tolerancePx
}
