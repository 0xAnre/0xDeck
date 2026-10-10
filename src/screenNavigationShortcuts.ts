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

function screenIndexFromDigitKey(key: string): number | null {
  const match = /^([1-5])$/.exec(key)
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

/**
 * Scroll offset for workspace screen index 0…4 (Screen 1…5), or null when unreachable.
 * Based on viewport page height inside the scroll container, not panel/widget order.
 */
export function resolveWorkspaceScreenScrollTop(
  container: WorkspaceScrollMetrics,
  screenIndex: number,
): number | null {
  if (screenIndex < 0 || screenIndex > 4) return null
  const pageHeight = container.clientHeight
  if (pageHeight <= 0) return null
  const targetTop = screenIndex * pageHeight
  if (targetTop >= container.scrollHeight) return null
  const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight)
  return Math.min(targetTop, maxScrollTop)
}

export function scrollToWorkspaceScreenAtIndex(
  container: WorkspaceScrollMetrics & { scrollTo: (options: { top: number; behavior?: ScrollBehavior }) => void },
  screenIndex: number,
): void {
  const targetTop = resolveWorkspaceScreenScrollTop(container, screenIndex)
  if (targetTop === null) return
  container.scrollTo({ top: targetTop, behavior: 'smooth' })
}

export type ScreenNavigationSequenceHandler = {
  handleKeyDown: (event: ScreenNavigationKeyEvent) => number | null
  dispose: () => void
}

/**
 * Two-key screen navigation: `p` then `1`…`5` within a short timeout maps to workspace screen indexes 0…4.
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
