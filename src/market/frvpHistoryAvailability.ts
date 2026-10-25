/**
 * Explicit fixed-range volume profile availability notices.
 *
 * A provider with a recent-history horizon (Hyperliquid keeps only the most
 * recent 5000 candles per interval) can serve a profile request only partially
 * or not at all. The volume-profile response carries `history_unavailable` /
 * `available_from`, and the runtime keeps both, so the panel can show an
 * explicit "history unavailable / available from <time>" state instead of an
 * empty profile.
 */

import type { FixedRangeVolumeProfileRuntimeSnapshot } from './fixedRangeVolumeProfileRuntimeTypes.ts'
import type { MarketExchange } from './types.ts'

const EXCHANGE_LABELS: Record<MarketExchange, string> = {
  binance: 'Binance',
  hyperliquid: 'Hyperliquid',
}

/** Deterministic UTC label (`2026-10-01 00:00 UTC`), independent of locale. */
export function formatAvailabilityTimestamp(epochSeconds: number): string {
  const iso = new Date(epochSeconds * 1000).toISOString()
  return `${iso.slice(0, 16).replace('T', ' ')} UTC`
}

export type FixedRangeVolumeProfileAvailabilityParams = {
  exchange: MarketExchange
  historyUnavailable: boolean
  availableFrom: number | null
  candleCount: number
}

export function fixedRangeVolumeProfileAvailabilityNotice({
  exchange,
  historyUnavailable,
  availableFrom,
  candleCount,
}: FixedRangeVolumeProfileAvailabilityParams): string | null {
  if (!historyUnavailable) return null
  if (availableFrom === null || !Number.isFinite(availableFrom) || availableFrom <= 0) {
    return null
  }

  const label = EXCHANGE_LABELS[exchange]
  const timestamp = formatAvailabilityTimestamp(availableFrom)
  if (candleCount <= 0) {
    return `${label} volume profile history is unavailable; data starts ${timestamp}`
  }
  return `${label} volume profile is partial; history starts ${timestamp}`
}

/**
 * Deduplicated notices for every ready profile whose request predates the
 * provider horizon. Loading/error instances contribute nothing here (their
 * states are handled by the runtime itself).
 */
export function fixedRangeVolumeProfileAvailabilityNotices(
  runtime: FixedRangeVolumeProfileRuntimeSnapshot,
  exchange: MarketExchange,
): string[] {
  const notices: string[] = []
  for (const state of Object.values(runtime)) {
    if (state.status !== 'ready') continue
    const notice = fixedRangeVolumeProfileAvailabilityNotice({
      exchange,
      historyUnavailable: state.historyUnavailable,
      availableFrom: state.availableFrom,
      candleCount: state.profile.candleCount,
    })
    if (notice !== null && !notices.includes(notice)) notices.push(notice)
  }
  return notices
}
