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

function isSequenceMKey(event: ScreenNavigationKeyEvent): boolean {
  return isPlainKey(event) && event.key === 'm'
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
 * How long an animated (`smooth`) screen navigation may still be running. Until this window has
 * elapsed the requested screen — not the intermediate scroll offset — is the user's intent.
 */
export const WORKSPACE_SCREEN_NAVIGATION_SETTLE_WINDOW_MS = 1000

/** Screen a navigation is currently moving toward, valid until `expiresAtMs`. */
export type WorkspaceScreenNavigationIntent = {
  screenIndex: number
  expiresAtMs: number
}

/** Records the destination of a navigation that starts scrolling toward `screenIndex`. */
export function createWorkspaceScreenNavigationIntent(
  screenIndex: number,
  nowMs: number,
  settleWindowMs: number = WORKSPACE_SCREEN_NAVIGATION_SETTLE_WINDOW_MS,
): WorkspaceScreenNavigationIntent {
  return { screenIndex, expiresAtMs: nowMs + settleWindowMs }
}

/**
 * Screen index Screen Lock must align to when it turns ON: the destination of a navigation that may
 * still be animating, otherwise the screen nearest to the current offset. Without the intent, a
 * lock toggled on mid-scroll would snapshot an intermediate offset and lock to the wrong screen.
 */
export function resolveScreenLockAlignmentScreenIndex(
  container: WorkspaceScrollMetrics,
  scrollTop: number,
  options: { intent: WorkspaceScreenNavigationIntent | null; nowMs: number },
): number {
  const intent = options.intent
  if (intent && isValidScreenIndex(intent.screenIndex) && options.nowMs < intent.expiresAtMs) {
    return intent.screenIndex
  }
  return resolveNearestWorkspaceScreenIndex(container, scrollTop)
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

/**
 * `sessionStorage` key holding the active workspace screen index of **this tab** (0…8). The screen is
 * shared by every workspace in the tab, so the key is deliberately not workspace-scoped: a refresh
 * reopens the tab on the screen it was on, while another tab still opens on Screen 1.
 */
export const WORKSPACE_SCREEN_STORAGE_KEY = '0xdeck-workspace-screen'

/**
 * Delay between the last workspace scroll event and the screen-index write. Long enough for wheel
 * momentum, a scrollbar drag and the tail of an `m` + digit smooth jump to settle on one screen, so
 * the stored index is the screen the user actually stopped on.
 */
export const WORKSPACE_SCREEN_PERSIST_DEBOUNCE_MS = 150

/** Minimal `Storage` surface, so the screen-index helpers stay testable without a DOM. */
export type WorkspaceScreenStorage = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

/**
 * Parse a stored screen index. Anything but a plain decimal integer in 0…8 is rejected (`null`), so a
 * stale or hand-edited key falls back to Screen 1 instead of throwing or clamping unexpectedly.
 */
export function parseStoredWorkspaceScreenIndex(raw: string | null): number | null {
  // Exactly one digit 0…8: rejects out-of-range values, "03", "3.0", "1e1", signed and padded values.
  if (raw === null || !/^[0-8]$/.test(raw)) return null
  return Number.parseInt(raw, 10)
}

/**
 * Stored screen index of this tab, or `null` when the key is missing/invalid or storage is
 * unavailable (blocked cookies, sandboxed frame). Never throws.
 */
export function readStoredWorkspaceScreenIndex(
  storage: WorkspaceScreenStorage | null | undefined,
): number | null {
  if (!storage) return null
  try {
    return parseStoredWorkspaceScreenIndex(storage.getItem(WORKSPACE_SCREEN_STORAGE_KEY))
  } catch {
    return null
  }
}

/** Stores the active screen index; ignores unreachable indexes and storage that refuses writes. */
export function saveWorkspaceScreenIndex(
  storage: WorkspaceScreenStorage | null | undefined,
  screenIndex: number,
): void {
  if (!storage || !isValidScreenIndex(screenIndex)) return
  try {
    storage.setItem(WORKSPACE_SCREEN_STORAGE_KEY, String(screenIndex))
  } catch {
    // Storage is unavailable or full: the screen simply is not remembered after a refresh.
  }
}

/**
 * `sessionStorage` of this tab, or `null` where the browser blocks storage access (accessing
 * `window.sessionStorage` itself throws in that case, so it is read inside the guard).
 */
export function resolveWorkspaceScreenStorage(): WorkspaceScreenStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  } catch {
    return null
  }
}

export type ScreenNavigationSequenceHandler = {
  handleKeyDown: (event: ScreenNavigationKeyEvent) => number | null
  dispose: () => void
}

/**
 * Two-key screen navigation: `m` then `1`…`9` within a short timeout maps to workspace screen indexes 0…8.
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

    if (isSequenceMKey(event)) {
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
