import type { IChartApi } from 'lightweight-charts'
import {
  applyAnchoredVwapLiveFromCandles,
  clearAnchoredVwapLineSeriesData,
  createAnchoredVwapLineSeries,
  setAnchoredVwapLineSeriesData,
  setAnchoredVwapLineSeriesVisible,
  type AnchoredVwapLineSeriesBundle,
} from './anchoredVwapChartSeries.ts'
import { computeQuarterlyVwap, type QuarterlyVwapPoint } from './quarterlyVwap.ts'
import type { MarketCandle } from './types.ts'

export type QuarterlyVwapLineSeriesBundle = AnchoredVwapLineSeriesBundle

export const QUARTERLY_VWAP_CHART_SERIES_KEYS = [
  'previousLower1',
  'previousUpper1',
  'previousVwap',
  'lower1',
  'upper1',
  'vwap',
] as const

export function createQuarterlyVwapLineSeries(
  chart: IChartApi,
  visible: boolean,
): QuarterlyVwapLineSeriesBundle {
  return createAnchoredVwapLineSeries(chart, visible)
}

export function setQuarterlyVwapLineSeriesData(
  bundle: QuarterlyVwapLineSeriesBundle,
  points: readonly QuarterlyVwapPoint[],
): void {
  setAnchoredVwapLineSeriesData(bundle, points)
}

export function clearQuarterlyVwapLineSeriesData(bundle: QuarterlyVwapLineSeriesBundle): void {
  clearAnchoredVwapLineSeriesData(bundle)
}

export function setQuarterlyVwapLineSeriesVisible(
  bundle: QuarterlyVwapLineSeriesBundle,
  visible: boolean,
): void {
  setAnchoredVwapLineSeriesVisible(bundle, visible)
}

export function applyQuarterlyVwapLiveFromCandles(
  candles: readonly MarketCandle[],
  bundle: QuarterlyVwapLineSeriesBundle,
): void {
  applyAnchoredVwapLiveFromCandles(candles, bundle, computeQuarterlyVwap)
}
