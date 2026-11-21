import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  lighterTradeAccountSide,
  lighterTradePositionBefore,
  lighterTradeToAccountFill,
  lighterTradesToAccountFills,
} from './lighterFills.ts'
import {
  bucketHyperliquidFills,
  filterHyperliquidFillsToLoadedCandles,
  groupHyperliquidFillMarkers,
  mergeAccountFills,
} from './hyperliquidFills.ts'
import { hyperliquidFillGroupsToMarkers } from './hyperliquidMarkers.ts'
import {
  POSITION_MARKER_BUY_COLOR,
  POSITION_MARKER_SELL_COLOR,
} from './positionMarkers.ts'
import type { LighterTrade } from './lighterAccount.ts'

const ACCOUNT = 100833

function trade(overrides: Partial<LighterTrade> = {}): LighterTrade {
  return {
    tradeId: '41968002086',
    marketId: 1,
    price: 56925.6,
    size: 0.07026,
    timestamp: 1795243344289,
    type: 'trade',
    askAccountId: ACCOUNT,
    bidAccountId: 768785,
    isMakerAsk: true,
    txHash: '0xabc',
    makerPositionSizeBefore: -126.54734,
    takerPositionSizeBefore: 0,
    ...overrides,
  }
}

describe('Lighter trade side mapping', () => {
  it('maps the ask side to sell (A) and the bid side to buy (B)', () => {
    assert.equal(lighterTradeAccountSide(trade(), ACCOUNT), 'A')
    assert.equal(lighterTradeAccountSide(trade(), 768785), 'B')
  })

  it('rejects a trade that does not involve the account, or involves it on both sides', () => {
    assert.equal(lighterTradeAccountSide(trade(), 42), null)
    assert.equal(
      lighterTradeAccountSide(
        trade({ askAccountId: ACCOUNT, bidAccountId: ACCOUNT }),
        ACCOUNT,
      ),
      null,
    )
  })

  it('reads the signed position before the match for the account role', () => {
    // Ask + maker ask: the account made the ask, so the maker row is its own.
    assert.equal(lighterTradePositionBefore(trade(), ACCOUNT), -126.54734)
    // Ask + taker: the account took the bid, so its position is the taker row.
    assert.equal(
      lighterTradePositionBefore(trade({ isMakerAsk: false }), ACCOUNT),
      0,
    )
    // Bid side, maker ask (bid is the taker).
    assert.equal(
      lighterTradePositionBefore(
        trade({ bidAccountId: ACCOUNT, askAccountId: 9, isMakerAsk: true }),
        ACCOUNT,
      ),
      trade({ isMakerAsk: true }).takerPositionSizeBefore,
    )
    // Bid side, maker bid.
    assert.equal(
      lighterTradePositionBefore(
        trade({ bidAccountId: ACCOUNT, askAccountId: 9, isMakerAsk: false }),
        ACCOUNT,
      ),
      trade().makerPositionSizeBefore,
    )
  })
})

describe('Lighter trade → account fill', () => {
  it('normalizes a real trade into the shared fill shape', () => {
    assert.deepEqual(lighterTradeToAccountFill(trade(), ACCOUNT), {
      coin: 'BTC',
      price: 56925.6,
      size: 0.07026,
      side: 'A',
      time: 1795243344289,
      startPosition: -126.54734,
      direction: null,
      closedPnl: null,
      fee: null,
      hash: 'lighter:trade:41968002086',
      oid: null,
      tid: null,
    })
  })

  it('skips other markets, unrelated accounts and self-matches', () => {
    assert.equal(lighterTradeToAccountFill(trade({ marketId: 2 }), ACCOUNT), null)
    assert.equal(lighterTradeToAccountFill(trade(), 42), null)
    assert.equal(
      lighterTradeToAccountFill(
        trade({ askAccountId: ACCOUNT, bidAccountId: ACCOUNT }),
        ACCOUNT,
      ),
      null,
    )
  })

  it('merges REST page overlap without duplicating a fill', () => {
    const page = [trade(), trade({ tradeId: '41968002019', askAccountId: 9, bidAccountId: ACCOUNT })]
    const fills = lighterTradesToAccountFills(page, ACCOUNT)
    assert.equal(fills.length, 2)
    const merged = mergeAccountFills(fills, lighterTradesToAccountFills(page, ACCOUNT))
    assert.equal(merged.length, 2)
    assert.deepEqual(
      merged.map((fill) => fill.time),
      [...merged.map((fill) => fill.time)].sort((left, right) => left - right),
    )
  })
})

describe('Lighter trades through the shared marker pipeline', () => {
  it('buckets, computes position after and groups into one buy and one sell marker', () => {
    const sell = trade()
    const buy = trade({
      tradeId: '41968003000',
      askAccountId: 9,
      bidAccountId: ACCOUNT,
      isMakerAsk: true,
      takerPositionSizeBefore: -126.47708,
      timestamp: sell.timestamp + 1_000,
    })
    const fills = lighterTradesToAccountFills([buy, sell], ACCOUNT)
    const bucketed = bucketHyperliquidFills(fills, '1m')
    assert.equal(bucketed.length, 2)
    const sellFill = bucketed.find((fill) => fill.side === 'A')
    assert.ok(sellFill)
    assert.equal(sellFill.bucketTime, Math.floor(Math.floor(sell.timestamp / 1000) / 60) * 60)
    assert.equal(sellFill.positionBefore, -126.54734)
    assert.ok(Math.abs((sellFill.positionAfter ?? 0) - -126.6176) < 1e-9)
    const buyFill = bucketed.find((fill) => fill.side === 'B')
    assert.ok(buyFill)
    assert.equal(buyFill.positionBefore, -126.47708)
    assert.ok(Math.abs((buyFill.positionAfter ?? 0) - -126.40682) < 1e-9)

    const visible = filterHyperliquidFillsToLoadedCandles(
      bucketed,
      bucketed.map((fill) => fill.bucketTime),
    )
    const groups = groupHyperliquidFillMarkers(visible)
    assert.equal(groups.length, 2)
    assert.deepEqual(
      groups.map((group) => group.side).sort(),
      ['A', 'B'],
    )

    const markers = hyperliquidFillGroupsToMarkers(
      groups,
      { buy: POSITION_MARKER_BUY_COLOR, sell: POSITION_MARKER_SELL_COLOR },
      1,
    )
    assert.equal(markers.length, 2)
    const buyMarker = markers.find((marker) => marker.id === groups.find((group) => group.side === 'B')?.key)
    assert.ok(buyMarker)
    assert.equal(buyMarker.position, 'belowBar')
    assert.equal(buyMarker.shape, 'arrowUp')
    assert.equal(buyMarker.color, POSITION_MARKER_BUY_COLOR)
    const sellMarker = markers.find((marker) => marker.id === groups.find((group) => group.side === 'A')?.key)
    assert.ok(sellMarker)
    assert.equal(sellMarker.position, 'aboveBar')
    assert.equal(sellMarker.shape, 'arrowDown')
    assert.equal(sellMarker.color, POSITION_MARKER_SELL_COLOR)
  })

  it('drops fills whose candle is not loaded', () => {
    const fills = lighterTradesToAccountFills([trade()], ACCOUNT)
    const bucketed = bucketHyperliquidFills(fills, '1m')
    assert.equal(filterHyperliquidFillsToLoadedCandles(bucketed, []).length, 0)
  })
})
