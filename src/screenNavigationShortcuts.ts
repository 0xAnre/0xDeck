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

/**
 * Returns zero-based visible screen index for Cmd+Shift+1…Cmd+Shift+5, or null when the shortcut
 * does not apply. Uses Shift so the chord is not reserved by macOS browsers (Cmd+1…5 select tabs).
 */
export function resolveScreenIndexFromShortcut(event: ScreenNavigationKeyEvent): number | null {
  if (isEditableKeyboardTarget(event.target)) return null
  if (!event.metaKey || !event.shiftKey) return null
  if (event.ctrlKey || event.altKey) return null
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
