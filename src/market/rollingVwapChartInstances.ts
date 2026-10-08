import type { IChartApi } from 'lightweight-charts'
import type { ChartSeriesBundle } from './applyChartLiveCandle.ts'
import {
  applyRollingVwapChartBandColors,
  applyRollingVwapChartInstancePresentation,
  clearRollingVwapChartSeriesData,
  createRollingVwapChartSeriesBundle,
  removeRollingVwapChartSeriesBundle,
  setRollingVwapChartSeriesData,
  setRollingVwapInstanceSeriesVisibility,
  applyRollingVwapLiveFromCandles,
  type RollingVwapChartSeriesBundle,
} from './rollingVwapChartSeries.ts'
import { computeRollingVwapPointsForSettings } from './rollingVwapSettings.ts'
import { rollingVwapInstancePeriodLabel, type RollingVwapInstance } from './rollingVwapInstances.ts'
import type { CandleInterval, MarketCandle } from './types.ts'

export type RollingVwapChartInstanceMap = Map<string, RollingVwapChartSeriesBundle>

export function createEmptyRollingVwapChartInstanceMap(): RollingVwapChartInstanceMap {
  return new Map()
}

export function rollingVwapInstanceMenuLabel(
  instance: RollingVwapInstance,
  interval: CandleInterval,
): string {
  return `Rolling VWAP · ${rollingVwapInstancePeriodLabel(instance, interval)}`
}

export function reconcileRollingVwapChartBundles(
  chart: IChartApi,
  map: RollingVwapChartInstanceMap,
  instances: readonly RollingVwapInstance[],
  interval: CandleInterval,
): void {
  const desiredIds = new Set(instances.map((instance) => instance.id))
  for (const [id, bundle] of [...map.entries()]) {
    if (!desiredIds.has(id)) {
      removeRollingVwapChartSeriesBundle(chart, bundle)
      map.delete(id)
    }
  }

  for (const instance of instances) {
    let bundle = map.get(instance.id)
    if (!bundle) {
      bundle = createRollingVwapChartSeriesBundle(chart, instance.settings.bandColors, {
        title: rollingVwapInstancePeriodLabel(instance, interval),
        lineWidth: instance.settings.lineWidth,
        lineColor: instance.settings.lineColor,
        lineOpacity: instance.settings.lineOpacity,
        lineStyle: instance.settings.lineStyle,
      })
      map.set(instance.id, bundle)
    } else {
      applyRollingVwapChartInstancePresentation(bundle, instance, interval)
    }
    setRollingVwapInstanceSeriesVisibility(bundle, instance, interval)
  }
}

export function syncRollingVwapInstancesVisibility(
  bundle: ChartSeriesBundle,
  instances: readonly RollingVwapInstance[],
  interval: CandleInterval,
): void {
  for (const instance of instances) {
    const chartBundle = bundle.rollingVwaps.get(instance.id)
    if (!chartBundle) continue
    setRollingVwapInstanceSeriesVisibility(chartBundle, instance, interval)
  }
}

export function applyRollingVwapInstancesHistory(
  bundle: ChartSeriesBundle,
  candles: readonly MarketCandle[],
  instances: readonly RollingVwapInstance[],
): void {
  if (candles.length === 0) {
    for (const instance of instances) {
      const chartBundle = bundle.rollingVwaps.get(instance.id)
      if (chartBundle) clearRollingVwapChartSeriesData(chartBundle)
    }
    return
  }
  const interval = candles[candles.length - 1].interval
  for (const instance of instances) {
    const chartBundle = bundle.rollingVwaps.get(instance.id)
    if (!chartBundle) continue
    setRollingVwapChartSeriesData(
      chartBundle,
      computeRollingVwapPointsForSettings(candles, interval, instance.settings),
    )
  }
}

export function applyRollingVwapInstanceHistory(
  bundle: ChartSeriesBundle,
  candles: readonly MarketCandle[],
  instance: RollingVwapInstance,
): void {
  applyRollingVwapInstancesHistory(bundle, candles, [instance])
}

export function applyRollingVwapInstancesLive(
  candles: readonly MarketCandle[],
  bundle: ChartSeriesBundle,
  instances: readonly RollingVwapInstance[],
  interval: CandleInterval,
): void {
  for (const instance of instances) {
    const chartBundle = bundle.rollingVwaps.get(instance.id)
    if (!chartBundle) continue
    applyRollingVwapLiveFromCandles(candles, chartBundle, interval, instance.settings)
  }
}

export function clearAllRollingVwapChartInstanceData(
  bundle: ChartSeriesBundle,
  instances: readonly RollingVwapInstance[],
): void {
  for (const instance of instances) {
    const chartBundle = bundle.rollingVwaps.get(instance.id)
    if (chartBundle) clearRollingVwapChartSeriesData(chartBundle)
  }
}

export function applyRollingVwapInstanceSettingsToChart(
  chartBundle: RollingVwapChartSeriesBundle,
  instance: RollingVwapInstance,
  interval: CandleInterval,
): void {
  applyRollingVwapChartBandColors(chartBundle, instance.settings.bandColors)
  applyRollingVwapChartInstancePresentation(chartBundle, instance, interval)
  setRollingVwapInstanceSeriesVisibility(chartBundle, instance, interval)
}
