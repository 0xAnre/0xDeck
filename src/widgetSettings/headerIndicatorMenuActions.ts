import type { MarketIndicatorId } from '@/market/indicators'

export function toggleMarketIndicatorSelection(
  activeIndicators: readonly MarketIndicatorId[],
  indicatorId: MarketIndicatorId,
  checked: boolean,
): MarketIndicatorId[] {
  if (checked) {
    if (activeIndicators.includes(indicatorId)) return [...activeIndicators]
    return [...activeIndicators, indicatorId]
  }
  return activeIndicators.filter((item) => item !== indicatorId)
}

/**
 * Shared gear-click sequence for every header menu row: close the dropdown
 * first, then open the settings surface it belongs to, so the dialog never
 * fights the menu for focus and `Esc`.
 */
export function runMenuSettingsClick(params: {
  closeDropdown: () => void
  onSettingsClick?: () => void
}): void {
  params.closeDropdown()
  params.onSettingsClick?.()
}

export function runIndicatorSettingsGearClick(params: {
  indicatorId: MarketIndicatorId
  closeDropdown: () => void
  onIndicatorSettingsClick?: (indicatorId: MarketIndicatorId) => void
}): void {
  runMenuSettingsClick({
    closeDropdown: params.closeDropdown,
    onSettingsClick: () => params.onIndicatorSettingsClick?.(params.indicatorId),
  })
}
