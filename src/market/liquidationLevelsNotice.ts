/**
 * Honest status text for the live liquidation-level profile.
 *
 * The profile is a network feed: a live chart must never look current when it
 * is not. This module turns the feed state into one short panel notice — or
 * `null` when the profile is live and its own on-chart label is enough.
 */
import { isIndicatorSupportedOnExchange } from './indicators.ts'
import type { LiquidationLevelsFeedStatus } from './liquidationLevelsFeed.ts'
import type { TpslFeedStatus } from './tpslLevelsFeed.ts'
import {
  PRICE_LEVEL_KIND_INDICATOR,
  PRICE_LEVEL_KIND_LABEL,
  TPSL_KIND_CHANNEL,
  type TpslKind,
} from './priceLevelsKind.ts'
import type { MarketExchange } from './types.ts'

function formatClock(timeMs: number): string {
  const date = new Date(timeMs)
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${hours}:${minutes}:${seconds}`
}

/** Price band of one hovered row, in chart price units. */
export function formatLiquidationLevelsPriceRange(
  priceLow: number,
  priceHigh: number,
): string {
  const format = (value: number) =>
    value.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })
  return `${format(priceLow)} – ${format(priceHigh)}`
}

export function describeLiquidationLevelsStatus(params: {
  enabled: boolean
  exchange: MarketExchange
  status: LiquidationLevelsFeedStatus
}): string | null {
  const { enabled, exchange, status } = params
  if (!enabled) return null
  if (!isIndicatorSupportedOnExchange('liquidation-levels', exchange)) {
    return 'Liquidation Levels · Hyperliquid BTC only — not available on Binance'
  }
  if (status.error !== null) {
    return `Liquidation Levels · feed error — ${status.error}`
  }
  if (status.resyncing) {
    return 'Liquidation Levels · resyncing with MarketLens for a fresh snapshot'
  }
  switch (status.phase) {
    case 'idle':
    case 'connecting':
    case 'reconnecting':
      return status.attempt > 1
        ? `Liquidation Levels · reconnecting to MarketLens (attempt ${status.attempt})`
        : 'Liquidation Levels · connecting to MarketLens'
    case 'stale':
      return status.lastAppliedAt === null
        ? 'Liquidation Levels · stale — no data received yet'
        : `Liquidation Levels · stale — last update ${formatClock(status.lastAppliedAt)}`
    case 'stopped':
      return 'Liquidation Levels · feed stopped'
    case 'live':
      return null
    default:
      return null
  }
}

/** One trigger-order profile's honest status notice, or `null` when live. */
export function describeTpslPriceLevelStatus(params: {
  kind: TpslKind
  enabled: boolean
  exchange: MarketExchange
  status: TpslFeedStatus
  /** Optional clock for the quiet-channel check; omitted keeps render pure. */
  nowMs?: number
}): string | null {
  const { kind, enabled, exchange, status } = params
  const nowMs = params.nowMs ?? null
  if (!enabled) return null
  const label = PRICE_LEVEL_KIND_LABEL[kind]
  if (!isIndicatorSupportedOnExchange(PRICE_LEVEL_KIND_INDICATOR[kind], exchange)) {
    return `${label} · Hyperliquid BTC only — not available on Binance`
  }
  const channel = status.channels[TPSL_KIND_CHANNEL[kind]]
  if (channel.error !== null) {
    return `${label} · feed error — ${channel.error}`
  }
  if (channel.resyncing) {
    return `${label} · resyncing with MarketLens for a fresh snapshot`
  }
  switch (status.phase) {
    case 'idle':
    case 'connecting':
    case 'reconnecting':
      return status.attempt > 1
        ? `${label} · reconnecting to MarketLens (attempt ${status.attempt})`
        : `${label} · connecting to MarketLens`
    case 'stale':
      return channel.lastAppliedAt === null
        ? `${label} · stale — no data received yet`
        : `${label} · stale — last update ${formatClock(channel.lastAppliedAt)}`
    case 'stopped':
      return `${label} · feed stopped`
    case 'live': {
      if (
        nowMs !== null &&
        channel.lastFileAt !== null &&
        nowMs - channel.lastFileAt > 15_000
      ) {
        return channel.lastAppliedAt === null
          ? `${label} · stale — no data received yet`
          : `${label} · stale — last update ${formatClock(channel.lastAppliedAt)}`
      }
      return null
    }
    default:
      return null
  }
}
