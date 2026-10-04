let activeRectangleKeyboardPanelId: string | null = null

export function claimRectangleKeyboardPanel(panelId: string | null): void {
  activeRectangleKeyboardPanelId = panelId
}

export function isActiveRectangleKeyboardPanel(panelId: string): boolean {
  return activeRectangleKeyboardPanelId === panelId
}

export function getActiveRectangleKeyboardPanelId(): string | null {
  return activeRectangleKeyboardPanelId
}
