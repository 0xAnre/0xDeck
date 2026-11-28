import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  describeLiquidationLevelsStatus,
  formatLiquidationLevelsPriceRange,
} from './liquidationLevelsNotice.ts'
import {
  INITIAL_LIQUIDATION_LEVELS_FEED_STATUS,
  type LiquidationLevelsFeedStatus,
} from './liquidationLevelsFeed.ts'

function status(
  over: Partial<LiquidationLevelsFeedStatus> = {},
): LiquidationLevelsFeedStatus {
  return { ...INITIAL_LIQUIDATION_LEVELS_FEED_STATUS, ...over }
}

describe('live liquidation level status notice', () => {
  it('stays silent while the indicator is off', () => {
    assert.equal(
      describeLiquidationLevelsStatus({
        enabled: false,
        exchange: 'hyperliquid',
        status: status({ phase: 'reconnecting', attempt: 4 }),
      }),
      null,
    )
  })

  it('says explicitly that Binance has no liquidation-level data', () => {
    const text = describeLiquidationLevelsStatus({
      enabled: true,
      exchange: 'binance',
      status: status({ phase: 'live' }),
    })
    assert.ok(text)
    assert.match(text, /Hyperliquid BTC only/)
    assert.match(text, /not available on Binance/)
  })

  it('is silent when live on Hyperliquid', () => {
    assert.equal(
      describeLiquidationLevelsStatus({
        enabled: true,
        exchange: 'hyperliquid',
        status: status({ phase: 'live', lastAppliedAt: 1_000 }),
      }),
      null,
    )
  })

  it('reports connecting, reconnecting and resyncing honestly', () => {
    const connecting = describeLiquidationLevelsStatus({
      enabled: true,
      exchange: 'hyperliquid',
      status: status({ phase: 'connecting', attempt: 1 }),
    })
    assert.match(connecting ?? '', /connecting/)
    const reconnecting = describeLiquidationLevelsStatus({
      enabled: true,
      exchange: 'hyperliquid',
      status: status({ phase: 'reconnecting', attempt: 3 }),
    })
    assert.match(reconnecting ?? '', /reconnecting/)
    assert.match(reconnecting ?? '', /attempt 3/)
    const resyncing = describeLiquidationLevelsStatus({
      enabled: true,
      exchange: 'hyperliquid',
      status: status({ phase: 'live', resyncing: true }),
    })
    assert.match(resyncing ?? '', /resyncing/)
  })

  it('never claims freshness while stale', () => {
    const stale = describeLiquidationLevelsStatus({
      enabled: true,
      exchange: 'hyperliquid',
      status: status({ phase: 'stale', lastAppliedAt: null }),
    })
    assert.match(stale ?? '', /stale/)
    const withTime = describeLiquidationLevelsStatus({
      enabled: true,
      exchange: 'hyperliquid',
      status: status({
        phase: 'stale',
        lastAppliedAt: new Date(2026, 0, 2, 3, 4, 5).getTime(),
      }),
    })
    assert.match(withTime ?? '', /last update 03:04:05/)
  })

  it('surfaces a decode/apply error instead of looking live', () => {
    const text = describeLiquidationLevelsStatus({
      enabled: true,
      exchange: 'hyperliquid',
      status: status({ phase: 'live', error: 'parquet decode produced no rows' }),
    })
    assert.match(text ?? '', /feed error/)
    assert.match(text ?? '', /parquet decode produced no rows/)
  })

  it('formats a hovered row price band', () => {
    assert.equal(formatLiquidationLevelsPriceRange(91234.5, 91235), '91,234.5 – 91,235')
  })
})
