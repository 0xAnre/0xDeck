import {
  DEFAULT_ORDER_BOOK_DEPTH_DISTANCE,
  ORDER_BOOK_DEPTH_DISTANCES,
  ORDER_BOOK_DEPTH_SOURCE,
  isOrderBookDepthDistance,
  sanitizeOrderBookDepthThresholds,
  type OrderBookDepthDistance,
} from './orderBookDepth.ts'

export const ORDER_BOOK_DEPTH_SOURCES = ['binance'] as const
export type OrderBookDepthSource = (typeof ORDER_BOOK_DEPTH_SOURCES)[number]

export type OrderBookDepthSettings = {
  source: OrderBookDepthSource
  distance: OrderBookDepthDistance
  positiveThreshold: number
  negativeThreshold: number
}

export const DEFAULT_ORDER_BOOK_DEPTH_POSITIVE_THRESHOLD = 25
export const DEFAULT_ORDER_BOOK_DEPTH_NEGATIVE_THRESHOLD = -25

export const DEFAULT_ORDER_BOOK_DEPTH_SETTINGS: OrderBookDepthSettings = {
  source: ORDER_BOOK_DEPTH_SOURCE,
  distance: DEFAULT_ORDER_BOOK_DEPTH_DISTANCE,
  positiveThreshold: DEFAULT_ORDER_BOOK_DEPTH_POSITIVE_THRESHOLD,
  negativeThreshold: DEFAULT_ORDER_BOOK_DEPTH_NEGATIVE_THRESHOLD,
}

export const ORDER_BOOK_DEPTH_DISTANCE_LABELS: Record<OrderBookDepthDistance, string> =
  Object.fromEntries(
    ORDER_BOOK_DEPTH_DISTANCES.map((distance) => [distance, `${distance}%`]),
  ) as Record<OrderBookDepthDistance, string>

/** Sanitize one saved settings object; V1 accepts only the Binance source. */
export function sanitizeOrderBookDepthSettings(
  value: unknown,
): OrderBookDepthSettings {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_ORDER_BOOK_DEPTH_SETTINGS }
  }
  const record = value as Record<string, unknown>
  const thresholds = sanitizeOrderBookDepthThresholds({
    positive: record.positiveThreshold,
    negative: record.negativeThreshold,
  })
  return {
    source:
      record.source === 'binance'
        ? 'binance'
        : DEFAULT_ORDER_BOOK_DEPTH_SETTINGS.source,
    distance: isOrderBookDepthDistance(record.distance)
      ? record.distance
      : DEFAULT_ORDER_BOOK_DEPTH_SETTINGS.distance,
    positiveThreshold: thresholds.positive,
    negativeThreshold: thresholds.negative,
  }
}
