let activeRectangleKeyboardPanelId: string | null = null

export function isRectangleKeyboardFocusOnOutsideControl(
  target: EventTarget | null,
  chartRoot: Node | null,
): boolean {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return false
  const doc = target.ownerDocument
  if (target === doc.body || target === doc.documentElement) return false
  if (chartRoot?.contains(target)) return false
  return true
}

export function claimRectangleKeyboardPanel(panelId: string | null): void {
  activeRectangleKeyboardPanelId = panelId
}

export function isActiveRectangleKeyboardPanel(panelId: string): boolean {
  return activeRectangleKeyboardPanelId === panelId
}

export function getActiveRectangleKeyboardPanelId(): string | null {
  return activeRectangleKeyboardPanelId
}
