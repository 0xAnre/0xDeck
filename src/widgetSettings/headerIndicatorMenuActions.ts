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

export function runIndicatorSettingsGearClick(params: {
  indicatorId: MarketIndicatorId
  closeDropdown: () => void
  onIndicatorSettingsClick?: (indicatorId: MarketIndicatorId) => void
}): void {
  params.closeDropdown()
  params.onIndicatorSettingsClick?.(params.indicatorId)
}
