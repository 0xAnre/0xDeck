import { computeAnchoredVwap, type AnchoredVwapPoint } from './anchoredVwap.ts'
import type { MarketCandle } from './types.ts'

export type YearlyVwapPoint = AnchoredVwapPoint

export function utcYearKey(epochSeconds: number): string {
  const date = new Date(epochSeconds * 1000)
  return String(date.getUTCFullYear())
}

export function computeYearlyVwap(candles: readonly MarketCandle[]): YearlyVwapPoint[] {
  return computeAnchoredVwap(candles, utcYearKey)
}
