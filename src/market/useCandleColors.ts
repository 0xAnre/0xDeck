import { useSyncExternalStore } from 'react'
import {
  getCandleColors,
  subscribeCandleColors,
  type CandleColors,
} from './candleColors.ts'

/** The global BTC Perp candle colors, shared by every panel and workspace. */
export function useCandleColors(): CandleColors {
  return useSyncExternalStore(subscribeCandleColors, getCandleColors, getCandleColors)
}
