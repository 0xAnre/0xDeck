export type ScreenNavigationKeyEvent = {
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  code: string
  target: EventTarget | null
}

export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined') return false
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  return target.closest('[contenteditable]') !== null
}

/** Returns zero-based visible screen index for Cmd+1…Cmd+5, or null when the shortcut does not apply. */
export function resolveScreenIndexFromShortcut(event: ScreenNavigationKeyEvent): number | null {
  if (isEditableKeyboardTarget(event.target)) return null
  if (!event.metaKey) return null
  if (event.ctrlKey || event.altKey || event.shiftKey) return null
  const digitMatch = /^Digit([1-5])$/.exec(event.code)
  if (!digitMatch) return null
  return Number.parseInt(digitMatch[1], 10) - 1
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
