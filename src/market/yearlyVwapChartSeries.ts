import type { IChartApi } from 'lightweight-charts'
import {
  applyAnchoredVwapLiveFromCandles,
  clearAnchoredVwapLineSeriesData,
  createAnchoredVwapLineSeries,
  setAnchoredVwapLineSeriesData,
  setAnchoredVwapLineSeriesVisible,
  type AnchoredVwapLineSeriesBundle,
} from './anchoredVwapChartSeries.ts'
import { computeYearlyVwap, type YearlyVwapPoint } from './yearlyVwap.ts'
import type { MarketCandle } from './types.ts'

export type YearlyVwapLineSeriesBundle = AnchoredVwapLineSeriesBundle

export const YEARLY_VWAP_CHART_SERIES_KEYS = [
  'previousLower1',
  'previousUpper1',
  'previousVwap',
  'lower1',
  'upper1',
  'vwap',
] as const

export function createYearlyVwapLineSeries(
  chart: IChartApi,
  visible: boolean,
): YearlyVwapLineSeriesBundle {
  return createAnchoredVwapLineSeries(chart, visible)
}

export function setYearlyVwapLineSeriesData(
  bundle: YearlyVwapLineSeriesBundle,
  points: readonly YearlyVwapPoint[],
): void {
  setAnchoredVwapLineSeriesData(bundle, points)
}

export function clearYearlyVwapLineSeriesData(bundle: YearlyVwapLineSeriesBundle): void {
  clearAnchoredVwapLineSeriesData(bundle)
}

export function setYearlyVwapLineSeriesVisible(
  bundle: YearlyVwapLineSeriesBundle,
  visible: boolean,
): void {
  setAnchoredVwapLineSeriesVisible(bundle, visible)
}

export function applyYearlyVwapLiveFromCandles(
  candles: readonly MarketCandle[],
  bundle: YearlyVwapLineSeriesBundle,
): void {
  applyAnchoredVwapLiveFromCandles(candles, bundle, computeYearlyVwap)
}
