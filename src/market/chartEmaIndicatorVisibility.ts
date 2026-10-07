import type { ISeriesApi } from 'lightweight-charts'
import type { MarketIndicatorId } from './indicators.ts'

export type EmaIndicatorSeriesBundle = {
  emas: ISeriesApi<'Line'>[]
  ema200: ISeriesApi<'Line'>
}

export function getEmaIndicatorSeriesVisibility(activeIndicators: readonly MarketIndicatorId[]) {
  return {
    tripleEma: activeIndicators.includes('triple-ema'),
    ema200: activeIndicators.includes('ema-200'),
  }
}

export function applyEmaIndicatorSeriesVisibility(
  bundle: EmaIndicatorSeriesBundle,
  activeIndicators: readonly MarketIndicatorId[],
): void {
  const { tripleEma, ema200 } = getEmaIndicatorSeriesVisibility(activeIndicators)
  bundle.emas.forEach((series) => {
    series.applyOptions({ visible: tripleEma })
  })
  bundle.ema200.applyOptions({ visible: ema200 })
}
