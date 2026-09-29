import { computeAnchoredVwap, type AnchoredVwapPoint } from './anchoredVwap.ts'
import type { MarketCandle } from './types.ts'

export type QuarterlyVwapPoint = AnchoredVwapPoint

export function utcQuarterKey(epochSeconds: number): string {
  const date = new Date(epochSeconds * 1000)
  const year = date.getUTCFullYear()
  const quarter = Math.floor(date.getUTCMonth() / 3) + 1
  return `${year}-Q${quarter}`
}

export function computeQuarterlyVwap(candles: readonly MarketCandle[]): QuarterlyVwapPoint[] {
  return computeAnchoredVwap(candles, utcQuarterKey)
}
