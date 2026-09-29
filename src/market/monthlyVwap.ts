import { computeAnchoredVwap, type AnchoredVwapPoint } from './anchoredVwap.ts'
import type { MarketCandle } from './types.ts'

export type MonthlyVwapPoint = AnchoredVwapPoint

export function utcMonthKey(epochSeconds: number): string {
  const date = new Date(epochSeconds * 1000)
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth() + 1
  return `${year}-${month}`
}

export function computeMonthlyVwap(candles: readonly MarketCandle[]): MonthlyVwapPoint[] {
  return computeAnchoredVwap(candles, utcMonthKey)
}
