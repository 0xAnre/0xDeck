import {
  MARKET_SEMANTIC_NEGATIVE_COLOR,
  MARKET_SEMANTIC_POSITIVE_COLOR,
} from './marketSemanticColors.ts'

/**
 * Fixed Aggregated Liquidations colors (same in every theme).
 *
 * Long liquidations are red and short liquidations are green; both are
 * positive USD notional values.
 */
export const LIQUIDATION_LONG_COLOR = MARKET_SEMANTIC_NEGATIVE_COLOR
export const LIQUIDATION_SHORT_COLOR = MARKET_SEMANTIC_POSITIVE_COLOR

/** Fraction of available bar spacing each candle's two half-bars may use. */
export const LIQUIDATION_BAR_WIDTH_FRACTION = 0.7
