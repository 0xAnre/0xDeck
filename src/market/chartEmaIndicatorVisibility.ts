import type { ISeriesApi } from 'lightweight-charts'
import type { MarketIndicatorId } from './indicators.ts'

export type EmaIndicatorSeriesBundle = {
  emas: ISeriesApi<'Line'>[]
  ema100: ISeriesApi<'Line'>
  ema200: ISeriesApi<'Line'>
}

export function getEmaIndicatorSeriesVisibility(activeIndicators: readonly MarketIndicatorId[]) {
  const dualEma = activeIndicators.includes('dual-ema')
  return {
    tripleEma: activeIndicators.includes('triple-ema'),
    dualEma,
  }
}

export function applyEmaIndicatorSeriesVisibility(
  bundle: EmaIndicatorSeriesBundle,
  activeIndicators: readonly MarketIndicatorId[],
): void {
  const { tripleEma, dualEma } = getEmaIndicatorSeriesVisibility(activeIndicators)
  bundle.emas.forEach((series) => {
    series.applyOptions({ visible: tripleEma })
  })
  bundle.ema100.applyOptions({ visible: dualEma })
  bundle.ema200.applyOptions({ visible: dualEma })
}
