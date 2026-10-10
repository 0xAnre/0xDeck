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

function isSequenceGKey(event: ScreenNavigationKeyEvent): boolean {
  return isPlainKey(event) && event.key === 'g'
}

function isDigitKeyWithoutUnrelatedModifiers(event: ScreenNavigationKeyEvent): boolean {
  return !event.metaKey && !event.ctrlKey && !event.altKey
}

export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined') return false
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  return target.closest('[contenteditable]') !== null
}

export const PANEL_NAV_ID_ATTR = 'data-panel-nav-id'

function escapePanelIdForAttributeSelector(panelId: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(panelId)
  }
  return panelId.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

export function findPanelNavigationElement(
  container: HTMLElement | null | undefined,
  panelId: string,
): HTMLElement | null {
  if (!container) return null
  const escapedId = escapePanelIdForAttributeSelector(panelId)
  return container.querySelector<HTMLElement>(
    `[${PANEL_NAV_ID_ATTR}="${escapedId}"]`,
  )
}

export type ScreenNavigationSequenceHandler = {
  handleKeyDown: (event: ScreenNavigationKeyEvent) => number | null
  dispose: () => void
}

/**
 * Two-key screen navigation: `g` then `1`…`5` within a short timeout maps to visible screen indexes 0…4.
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

    if (isSequenceGKey(event)) {
      armPending()
      return null
    }

    if (!pending) return null

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

export function scrollToVisibleScreenAtIndex(
  orderedPanelElements: readonly (HTMLElement | null | undefined)[],
  index: number,
  scrollIntoView: (element: HTMLElement) => void = (element) => {
    element.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'smooth' })
  },
): void {
  if (index < 0 || index >= orderedPanelElements.length) return
  const element = orderedPanelElements[index]
  if (!element) return
  scrollIntoView(element)
}
