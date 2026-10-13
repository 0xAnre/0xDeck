import type { IChartApi } from 'lightweight-charts'
import type { ChartSeriesBundle } from './applyChartLiveCandle.ts'
import {
  applyAnchoredVwapDrawingChartPresentation,
  applyAnchoredVwapDrawingLiveFromCandles,
  clearAnchoredVwapDrawingChartSeriesData,
  computeAnchoredVwapDrawingPointsForInstance,
  createAnchoredVwapDrawingChartSeriesBundle,
  removeAnchoredVwapDrawingChartSeriesBundle,
  setAnchoredVwapDrawingChartSeriesData,
  setAnchoredVwapDrawingInstanceSeriesVisibility,
  type AnchoredVwapDrawingChartSeriesBundle,
} from './anchoredVwapDrawingChartSeries.ts'
import {
  formatAnchoredVwapInstanceLabel,
  type AnchoredVwapInstance,
} from './anchoredVwapInstances.ts'
import type { MarketCandle } from './types.ts'

export type AnchoredVwapDrawingChartInstanceMap = Map<string, AnchoredVwapDrawingChartSeriesBundle>

export function createEmptyAnchoredVwapDrawingChartInstanceMap(): AnchoredVwapDrawingChartInstanceMap {
  return new Map()
}

export function reconcileAnchoredVwapDrawingChartBundles(
  chart: IChartApi,
  map: AnchoredVwapDrawingChartInstanceMap,
  instances: readonly AnchoredVwapInstance[],
): void {
  const desiredIds = new Set(instances.map((instance) => instance.id))
  for (const [id, bundle] of [...map.entries()]) {
    if (!desiredIds.has(id)) {
      removeAnchoredVwapDrawingChartSeriesBundle(chart, bundle)
      map.delete(id)
    }
  }

  for (const instance of instances) {
    const title = formatAnchoredVwapInstanceLabel(instance)
    let bundle = map.get(instance.id)
    if (!bundle) {
      bundle = createAnchoredVwapDrawingChartSeriesBundle(chart, instance.settings, title)
      map.set(instance.id, bundle)
    } else {
      applyAnchoredVwapDrawingChartPresentation(bundle, instance, title)
    }
    setAnchoredVwapDrawingInstanceSeriesVisibility(bundle, instance, title)
  }
}

export function applyAnchoredVwapDrawingInstancesHistory(
  bundle: ChartSeriesBundle,
  candles: readonly MarketCandle[],
  instances: readonly AnchoredVwapInstance[],
): void {
  if (candles.length === 0) {
    for (const instance of instances) {
      const chartBundle = bundle.anchoredVwaps.get(instance.id)
      if (chartBundle) clearAnchoredVwapDrawingChartSeriesData(chartBundle)
    }
    return
  }
  for (const instance of instances) {
    const chartBundle = bundle.anchoredVwaps.get(instance.id)
    if (!chartBundle) continue
    setAnchoredVwapDrawingChartSeriesData(
      chartBundle,
      computeAnchoredVwapDrawingPointsForInstance(candles, instance),
    )
  }
}

export function applyAnchoredVwapDrawingInstancesLive(
  candles: readonly MarketCandle[],
  bundle: ChartSeriesBundle,
  instances: readonly AnchoredVwapInstance[],
): void {
  for (const instance of instances) {
    const chartBundle = bundle.anchoredVwaps.get(instance.id)
    if (!chartBundle) continue
    applyAnchoredVwapDrawingLiveFromCandles(candles, chartBundle, instance)
  }
}

export function syncAnchoredVwapDrawingInstancesVisibility(
  bundle: ChartSeriesBundle,
  instances: readonly AnchoredVwapInstance[],
): void {
  for (const instance of instances) {
    const chartBundle = bundle.anchoredVwaps.get(instance.id)
    if (!chartBundle) continue
    setAnchoredVwapDrawingInstanceSeriesVisibility(
      chartBundle,
      instance,
      formatAnchoredVwapInstanceLabel(instance),
    )
  }
}
