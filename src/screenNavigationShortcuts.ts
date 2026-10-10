export type ScreenNavigationKeyEvent = {
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  code: string
  target: EventTarget | null
}

function screenIndexFromDigitCode(code: string): number | null {
  const match = /^Digit([1-5])$/.exec(code)
  if (!match) return null
  return Number.parseInt(match[1], 10) - 1
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

/**
 * Returns zero-based visible screen index for Cmd+Option+1…Cmd+Option+5, or null when the shortcut
 * does not apply. Option avoids macOS browser tab shortcuts (Cmd+1…5) and screenshot chords
 * (Cmd+Shift+3…5) that the OS handles before the page receives keydown.
 */
export function resolveScreenIndexFromShortcut(event: ScreenNavigationKeyEvent): number | null {
  if (isEditableKeyboardTarget(event.target)) return null
  if (!event.metaKey || !event.altKey) return null
  if (event.ctrlKey || event.shiftKey) return null
  return screenIndexFromDigitCode(event.code)
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
