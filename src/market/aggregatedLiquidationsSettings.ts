export const AGGREGATED_LIQUIDATIONS_SOURCES = ['binance', 'hyperliquid', 'both'] as const
export type AggregatedLiquidationsSource = (typeof AGGREGATED_LIQUIDATIONS_SOURCES)[number]

export const AGGREGATED_LIQUIDATIONS_POSITIONS = ['bottom', 'top'] as const
export type AggregatedLiquidationsPosition = (typeof AGGREGATED_LIQUIDATIONS_POSITIONS)[number]

export type AggregatedLiquidationsSettings = {
  source: AggregatedLiquidationsSource
  position: AggregatedLiquidationsPosition
}

export const DEFAULT_AGGREGATED_LIQUIDATIONS_SETTINGS: AggregatedLiquidationsSettings = {
  source: 'binance',
  position: 'bottom',
}

function isAggregatedLiquidationsSource(
  value: unknown,
): value is AggregatedLiquidationsSource {
  return (
    typeof value === 'string' &&
    (AGGREGATED_LIQUIDATIONS_SOURCES as readonly string[]).includes(value)
  )
}

export function isAggregatedLiquidationsPosition(
  value: unknown,
): value is AggregatedLiquidationsPosition {
  return (
    typeof value === 'string' &&
    (AGGREGATED_LIQUIDATIONS_POSITIONS as readonly string[]).includes(value)
  )
}

/**
 * Sanitize one saved settings object. Only Binance data exists in V1, so any
 * other source falls back to the default instead of silently showing nothing.
 */
export function sanitizeAggregatedLiquidationsSettings(
  value: unknown,
): AggregatedLiquidationsSettings {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_AGGREGATED_LIQUIDATIONS_SETTINGS }
  }
  const record = value as Record<string, unknown>
  return {
    source: isAggregatedLiquidationsSource(record.source) && record.source === 'binance'
      ? record.source
      : DEFAULT_AGGREGATED_LIQUIDATIONS_SETTINGS.source,
    position: isAggregatedLiquidationsPosition(record.position)
      ? record.position
      : DEFAULT_AGGREGATED_LIQUIDATIONS_SETTINGS.position,
  }
}
