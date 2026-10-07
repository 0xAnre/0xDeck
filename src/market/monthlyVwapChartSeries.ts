import type { IChartApi } from 'lightweight-charts'
import {
  applyAnchoredVwapLiveFromCandles,
  clearAnchoredVwapLineSeriesData,
  createAnchoredVwapLineSeries,
  setAnchoredVwapLineSeriesData,
  setAnchoredVwapLineSeriesVisible,
  type AnchoredVwapLineSeriesBundle,
} from './anchoredVwapChartSeries.ts'
import { computeMonthlyVwap, type MonthlyVwapPoint } from './monthlyVwap.ts'
import type { MarketCandle } from './types.ts'

export type MonthlyVwapLineSeriesBundle = AnchoredVwapLineSeriesBundle

export { ANCHORED_VWAP_CHART_SERIES_KEYS as MONTHLY_VWAP_CHART_SERIES_KEYS } from './anchoredVwapChartSeries.ts'

export function createMonthlyVwapLineSeries(
  chart: IChartApi,
  visible: boolean,
): MonthlyVwapLineSeriesBundle {
  return createAnchoredVwapLineSeries(chart, visible)
}

export function setMonthlyVwapLineSeriesData(
  bundle: MonthlyVwapLineSeriesBundle,
  points: readonly MonthlyVwapPoint[],
): void {
  setAnchoredVwapLineSeriesData(bundle, points)
}

export function clearMonthlyVwapLineSeriesData(bundle: MonthlyVwapLineSeriesBundle): void {
  clearAnchoredVwapLineSeriesData(bundle)
}

export function setMonthlyVwapLineSeriesVisible(
  bundle: MonthlyVwapLineSeriesBundle,
  visible: boolean,
): void {
  setAnchoredVwapLineSeriesVisible(bundle, visible)
}

export function applyMonthlyVwapLiveFromCandles(
  candles: readonly MarketCandle[],
  bundle: MonthlyVwapLineSeriesBundle,
): void {
  applyAnchoredVwapLiveFromCandles(candles, bundle, computeMonthlyVwap)
}
