export type ScreenNavigationKeyEvent = {
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  key: string
  code: string
  target: EventTarget | null
}

export const SCREEN_NAVIGATION_SEQUENCE_TIMEOUT_MS = 500

/** Number of reachable workspace screens (Screen 1…9, zero-based indexes 0…8). */
export const WORKSPACE_SCREEN_COUNT = 9

const LAST_WORKSPACE_SCREEN_INDEX = WORKSPACE_SCREEN_COUNT - 1

function isValidScreenIndex(screenIndex: number): boolean {
  return Number.isInteger(screenIndex) && screenIndex >= 0 && screenIndex <= LAST_WORKSPACE_SCREEN_INDEX
}

function screenIndexFromDigitKey(key: string): number | null {
  const match = /^([1-9])$/.exec(key)
  if (!match) return null
  return Number.parseInt(match[1], 10) - 1
}

function isPlainKey(event: ScreenNavigationKeyEvent): boolean {
  return !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey
}

function isSequencePKey(event: ScreenNavigationKeyEvent): boolean {
  return isPlainKey(event) && event.key === 'p'
}

function isDigitKeyWithoutUnrelatedModifiers(event: ScreenNavigationKeyEvent): boolean {
  return !event.metaKey && !event.ctrlKey && !event.altKey
}

/** Modifier-only keydown (e.g. Shift before AZERTY shift+digit) must not cancel a pending sequence. */
function isModifierOnlyKeyEvent(event: ScreenNavigationKeyEvent): boolean {
  switch (event.key) {
    case 'Shift':
    case 'Control':
    case 'Alt':
    case 'Meta':
      return true
    default:
      return false
  }
}

export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined') return false
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  return target.closest('[contenteditable]') !== null
}

export type WorkspaceScrollMetrics = {
  clientHeight: number
  scrollHeight: number
}

export type WorkspaceScroller = WorkspaceScrollMetrics & {
  scrollTop: number
  scrollTo: (options: { top: number; behavior?: ScrollBehavior }) => void
}

function resolveMaxScrollTop(container: WorkspaceScrollMetrics): number {
  return Math.max(0, container.scrollHeight - container.clientHeight)
}

/**
 * Minimum content height that exposes all {@link WORKSPACE_SCREEN_COUNT} screens as scroll pages,
 * even when the grid content is shorter. Apply it to a wrapper inside the scroller so the virtual
 * extent never moves, resizes or reorders widgets.
 */
export function resolveWorkspaceScreenExtentHeight(clientHeight: number): number {
  if (clientHeight <= 0) return 0
  return clientHeight * WORKSPACE_SCREEN_COUNT
}

/**
 * Scroll offset for workspace screen index 0…8 (Screen 1…9), or null when unreachable.
 * Based on viewport page height inside the scroll container, not panel/widget order.
 */
export function resolveWorkspaceScreenScrollTop(
  container: WorkspaceScrollMetrics,
  screenIndex: number,
): number | null {
  if (!isValidScreenIndex(screenIndex)) return null
  const pageHeight = container.clientHeight
  if (pageHeight <= 0) return null
  const targetTop = screenIndex * pageHeight
  if (targetTop >= container.scrollHeight) return null
  return Math.min(targetTop, resolveMaxScrollTop(container))
}

/**
 * Screen index closest to the current scroll offset. Used when Screen Lock turns on from an
 * arbitrary offset so the workspace deterministically snaps to one screen.
 */
export function resolveNearestWorkspaceScreenIndex(
  container: WorkspaceScrollMetrics,
  scrollTop: number,
): number {
  const pageHeight = container.clientHeight
  if (pageHeight <= 0) return 0
  const reachableIndex = Math.min(
    LAST_WORKSPACE_SCREEN_INDEX,
    Math.floor(resolveMaxScrollTop(container) / pageHeight),
  )
  const nearest = Math.round(scrollTop / pageHeight)
  return Math.min(Math.max(nearest, 0), Math.max(reachableIndex, 0))
}

/**
 * Scroll offset Screen Lock must hold for `screenIndex`: the exact page top (never a mid-screen
 * offset), clamped into the scrollable range so the workspace can always be returned to it.
 */
export function resolveLockedWorkspaceScreenScrollTop(
  container: WorkspaceScrollMetrics,
  screenIndex: number,
): number | null {
  if (!isValidScreenIndex(screenIndex)) return null
  const pageHeight = container.clientHeight
  if (pageHeight <= 0) return null
  return Math.min(screenIndex * pageHeight, resolveMaxScrollTop(container))
}

export function scrollToWorkspaceScreenAtIndex(
  container: WorkspaceScroller,
  screenIndex: number,
  options: { behavior?: ScrollBehavior } = {},
): void {
  const targetTop = resolveWorkspaceScreenScrollTop(container, screenIndex)
  if (targetTop === null) return
  container.scrollTo({ top: targetTop, behavior: options.behavior ?? 'smooth' })
}

export type ScreenNavigationSequenceHandler = {
  handleKeyDown: (event: ScreenNavigationKeyEvent) => number | null
  dispose: () => void
}

/**
 * Two-key screen navigation: `p` then `1`…`9` within a short timeout maps to workspace screen indexes 0…8.
 */
export function createScreenNavigationSequenceHandler(
  options: { timeoutMs?: number } = {},
): ScreenNavigationSequenceHandler {
  const timeoutMs = options.timeoutMs ?? SCREEN_NAVIGATION_SEQUENCE_TIMEOUT_MS
  let pending = false
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  const clear = () => {
    pending = false
    if (timeoutId !== null) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
  }

  const armPending = () => {
    pending = true
    if (timeoutId !== null) clearTimeout(timeoutId)
    timeoutId = setTimeout(clear, timeoutMs)
  }

  const handleKeyDown = (event: ScreenNavigationKeyEvent): number | null => {
    if (isEditableKeyboardTarget(event.target)) {
      clear()
      return null
    }

    if (isSequencePKey(event)) {
      armPending()
      return null
    }

    if (!pending) return null

    if (isModifierOnlyKeyEvent(event)) return null

    const index = isDigitKeyWithoutUnrelatedModifiers(event)
      ? screenIndexFromDigitKey(event.key)
      : null
    if (index === null) {
      clear()
      return null
    }

    clear()
    return index
  }

  return { handleKeyDown, dispose: clear }
}
