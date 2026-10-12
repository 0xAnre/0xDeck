import { pointerMovementWithinClickTolerance } from './chartObjectState.ts'

/** Minimum window; browsers may use a longer OS-configured interval. */
const MIN_DOUBLE_CLICK_INTERVAL_MS = 500
/**
 * Conservative default until a native `click` with `detail >= 2` is observed on the pane
 * (matches common OS accessibility settings above 500 ms).
 */
export const FALLBACK_DOUBLE_CLICK_INTERVAL_MS = 1000
const DOUBLE_CLICK_INTERVAL_LEARN_SLACK_MS = 50
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
const observedDoubleClickIntervalMsByPane = new WeakMap<HTMLElement, number>()
/** Set from the pane `click` event (`detail === 1`) so pointer logic can follow the native sequence. */
const nativePrimaryClickByPane = new WeakMap<HTMLElement, PointerClickRecord>()
/** First native click of the current sequence; kept until interval is learned from `detail >= 2`. */
const nativeDoubleClickIntervalAnchorByPane = new WeakMap<
  HTMLElement,
  PointerClickRecord
>()

function getEffectiveDoubleClickIntervalMs(paneElement: HTMLElement): number {
  const observed = observedDoubleClickIntervalMsByPane.get(paneElement)
  if (observed === undefined) {
    return FALLBACK_DOUBLE_CLICK_INTERVAL_MS
  }
  // An observed cadence is only a lower bound on the OS threshold; never shrink below fallback.
  return Math.max(
    observed,
    MIN_DOUBLE_CLICK_INTERVAL_MS,
    FALLBACK_DOUBLE_CLICK_INTERVAL_MS,
  )
}

function noteNativeDoubleClickInterval(
  paneElement: HTMLElement,
  clientX: number,
  clientY: number,
  now: number,
): void {
  const firstNativeClick = nativeDoubleClickIntervalAnchorByPane.get(paneElement)
  if (
    !firstNativeClick ||
    !isWithinDoubleClickDistance(firstNativeClick, clientX, clientY)
  ) {
    return
  }
  const observed = now - firstNativeClick.time
  if (observed <= 0) {
    return
  }
  const nextInterval = observed + DOUBLE_CLICK_INTERVAL_LEARN_SLACK_MS
  const previous = observedDoubleClickIntervalMsByPane.get(paneElement) ?? 0
  observedDoubleClickIntervalMsByPane.set(
    paneElement,
    Math.max(
      previous,
      nextInterval,
      MIN_DOUBLE_CLICK_INTERVAL_MS,
      FALLBACK_DOUBLE_CLICK_INTERVAL_MS,
    ),
  )
  nativeDoubleClickIntervalAnchorByPane.delete(paneElement)
}

/**
 * Learn the pane's effective double-click interval from native `click` events so pointer
 * guards stay aligned with the browser/OS double-click threshold.
 */
export function attachPaneNativeDoubleClickIntervalObserver(
  paneElement: HTMLElement,
): () => void {
  const onClick = (event: MouseEvent) => {
    if (event.detail < 2) {
      return
    }
    noteNativeDoubleClickInterval(
      paneElement,
      event.clientX,
      event.clientY,
      event.timeStamp,
    )
    clearNativePrimaryClick(paneElement)
  }
  paneElement.addEventListener('click', onClick)
  return () => {
    paneElement.removeEventListener('click', onClick)
  }
}

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

export function notePaneNativePrimaryClick(
  paneElement: HTMLElement,
  clientX: number,
  clientY: number,
  now: number = performance.now(),
): void {
  const intervalMs = getEffectiveDoubleClickIntervalMs(paneElement)
  const priorNative = nativePrimaryClickByPane.get(paneElement)
  if (priorNative !== undefined) {
    if (now - priorNative.time > intervalMs) {
      clearNativePrimaryClick(paneElement)
      nativeDoubleClickIntervalAnchorByPane.delete(paneElement)
      lastCompletedClickByPane.delete(paneElement)
    } else if (
      now - priorNative.time > DOUBLE_CLICK_INTERVAL_LEARN_SLACK_MS &&
      isWithinDoubleClickDistance(priorNative, clientX, clientY)
    ) {
      lastCompletedClickByPane.delete(paneElement)
    }
  }
  const staleLast = lastCompletedClickByPane.get(paneElement)
  if (staleLast !== undefined && now - staleLast.time > intervalMs) {
    lastCompletedClickByPane.delete(paneElement)
  }
  const record = { time: now, clientX, clientY }
  nativePrimaryClickByPane.set(paneElement, record)
  nativeDoubleClickIntervalAnchorByPane.set(paneElement, record)
}

function clearNativePrimaryClick(paneElement: HTMLElement): void {
  nativePrimaryClickByPane.delete(paneElement)
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

function matchesSecondPressTiming(
  paneElement: HTMLElement,
  last: PointerClickRecord,
  clientX: number,
  clientY: number,
  now: number,
): boolean {
  const intervalMs = getEffectiveDoubleClickIntervalMs(paneElement)
  if (now - last.time <= intervalMs) {
    return true
  }
  const nativePrimary = nativePrimaryClickByPane.get(paneElement)
  if (nativePrimary === undefined) {
    return false
  }
  if (now - nativePrimary.time > intervalMs) {
    clearNativePrimaryClick(paneElement)
    return false
  }
  const nativeToLastMs = nativePrimary.time - last.time
  if (
    nativeToLastMs < -DOUBLE_CLICK_INTERVAL_LEARN_SLACK_MS ||
    nativeToLastMs > intervalMs
  ) {
    return false
  }
  return (
    isWithinDoubleClickDistance(nativePrimary, clientX, clientY) &&
    isWithinDoubleClickDistance(last, clientX, clientY) &&
    isWithinDoubleClickDistance(nativePrimary, last.clientX, last.clientY)
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
    isWithinDoubleClickDistance(last, clientX, clientY) &&
    matchesSecondPressTiming(paneElement, last, clientX, clientY, now)
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

/**
 * Pointer wobble within the double-click distance keeps the pending click until release.
 * Drag taint is applied only when the gesture commits as a drag.
 */
export function invalidatePanePointerClickForDoubleClickOnDrag(
  paneElement: HTMLElement,
  startClientX: number,
  startClientY: number,
  clientX: number,
  clientY: number,
): void {
  if (
    pointerMovementWithinClickTolerance(
      startClientX,
      startClientY,
      clientX,
      clientY,
    )
  ) {
    return
  }
  if (
    Math.hypot(clientX - startClientX, clientY - startClientY) <=
    DOUBLE_CLICK_MAX_POINTER_MOVE_PX
  ) {
    return
  }
  pendingClickByPane.delete(paneElement)
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
  clearNativePrimaryClick(paneElement)
  nativeDoubleClickIntervalAnchorByPane.delete(paneElement)
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
  if (now - tainted.time > getEffectiveDoubleClickIntervalMs(paneElement)) {
    dragTaintedDoubleClickByPane.delete(paneElement)
    return false
  }
  if (!isWithinDoubleClickDistance(tainted, clientX, clientY)) {
    return false
  }
  dragTaintedDoubleClickByPane.delete(paneElement)
  return true
}

export type PanePointerClickRelease = {
  clientX: number
  clientY: number
  time?: number
}

function clickCommitCouldBelongToTaintedDragSequence(
  paneElement: HTMLElement,
  clientX: number,
  clientY: number,
  now: number,
): boolean {
  const tainted = dragTaintedDoubleClickByPane.get(paneElement)
  if (tainted === undefined) {
    return false
  }
  if (now - tainted.time > getEffectiveDoubleClickIntervalMs(paneElement)) {
    return false
  }
  return isWithinDoubleClickDistance(tainted, clientX, clientY)
}

export function commitPanePointerClickForDoubleClick(
  paneElement: HTMLElement,
  release?: PanePointerClickRelease,
): void {
  let pending = pendingClickByPane.get(paneElement)
  if (!pending && release) {
    pending = {
      time: release.time ?? performance.now(),
      clientX: release.clientX,
      clientY: release.clientY,
    }
  }
  if (!pending) {
    return
  }
  const now = release?.time ?? pending.time
  const clientX = release?.clientX ?? pending.clientX
  const clientY = release?.clientY ?? pending.clientY
  if (!clickCommitCouldBelongToTaintedDragSequence(paneElement, clientX, clientY, now)) {
    dragTaintedDoubleClickByPane.delete(paneElement)
  }
  lastCompletedClickByPane.set(paneElement, { time: now, clientX, clientY })
  pendingClickByPane.delete(paneElement)
}

export function cancelPanePointerClickForDoubleClick(paneElement: HTMLElement): void {
  pendingClickByPane.delete(paneElement)
}
