import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  LIGHTER_BTC_PERP_MARKET_ID,
  LIGHTER_TRADES_PAGE_LIMIT,
  lighterAccountLabel,
  lighterAccountPositionPath,
  lighterAccountTradesPath,
  lighterAccountsPath,
  parseLighterAccountResponse,
  parseLighterAccountsResponse,
  parseLighterTrade,
  parseLighterTradesResponse,
  resolveLighterAccountSelection,
} from './lighterAccount.ts'

const ADDRESS = '0xc899eeea7195fc839a2a987bbcc4c24d181e4b0b'

/** Sanitized 2026-11-21 mainnet reply for one wallet with master + sub-accounts. */
const accountsPayload = {
  code: 200,
  total: 3,
  accounts: [
    {
      code: 0,
      account_type: 0,
      index: 1483,
      l1_address: '0xCEA431A20cD70b0Aa6380B31835f4022E749529D',
      positions: [],
    },
    {
      code: 0,
      account_type: 2,
      index: 281474976689660,
      l1_address: '0xCEA431A20cD70b0Aa6380B31835f4022E749529D',
      positions: [],
    },
    {
      code: 0,
      account_type: 1,
      index: 281474976707511,
      l1_address: '0xCEA431A20cD70b0Aa6380B31835f4022E749529D',
      positions: [],
    },
  ],
}

const positionPayload = {
  code: 200,
  total: 1,
  accounts: [
    {
      code: 0,
      account_type: 0,
      index: 100833,
      l1_address: '0xc899EEeA7195fc839a2a987BBCc4c24d181e4b0B',
      positions: [
        { symbol: 'ETH', sign: 1, position: '0.0000', avg_entry_price: '0.00' },
        {
          symbol: 'BTC',
          sign: -1,
          position: '126.47708',
          avg_entry_price: '57312.9',
          position_value: '-7218918.4',
          unrealized_pnl: '1234.5',
          liquidation_price: '0',
        },
      ],
    },
  ],
}

const tradePayload = {
  code: 200,
  next_cursor: 'eyJpbmRleCI6NDE5NjgwMDE4OTN9',
  trades: [
    {
      trade_id: 41968002086,
      trade_id_str: '41968002086',
      tx_hash: 'e516661153fb6f44fc739a2420db46df7c3e7318b460f182fd4e6dc79ce0c0537662cd69901d996f',
      type: 'trade',
      market_id: 1,
      market_symbol: 'BTC',
      market_kind: 'perps',
      size: '0.07026',
      price: '56925.6',
      ask_account_id: 100833,
      bid_account_id: 768785,
      is_maker_ask: true,
      maker_position_size_before: '-126.54734',
      taker_position_size_before: '0',
      timestamp: 1795243344289,
    },
    {
      trade_id_str: '41968002019',
      type: 'liquidation',
      market_id: 1,
      size: '0.01756',
      price: '56925.6',
      ask_account_id: 760620,
      bid_account_id: 100833,
      is_maker_ask: false,
      maker_position_size_before: '2.5',
      taker_position_size_before: '-126.547',
      timestamp: 1795243344204,
    },
  ],
}

describe('Lighter account discovery', () => {
  it('parses every account of a wallet, sorted by index, with its account type', () => {
    assert.deepEqual(parseLighterAccountsResponse(accountsPayload), [
      { index: 1483, accountType: 0, l1Address: '0xCEA431A20cD70b0Aa6380B31835f4022E749529D' },
      { index: 281474976689660, accountType: 2, l1Address: '0xCEA431A20cD70b0Aa6380B31835f4022E749529D' },
      { index: 281474976707511, accountType: 1, l1Address: '0xCEA431A20cD70b0Aa6380B31835f4022E749529D' },
    ])
  })

  it('returns an empty list for an address without an account and null for a broken reply', () => {
    assert.deepEqual(parseLighterAccountsResponse({ code: 200, accounts: [] }), [])
    assert.equal(parseLighterAccountsResponse({ code: 20001, message: 'invalid param' }), null)
    assert.equal(parseLighterAccountsResponse(null), null)
    assert.equal(parseLighterAccountsResponse({ code: 200 }), null)
  })

  it('labels the master account and sub-accounts distinctly', () => {
    assert.equal(
      lighterAccountLabel({ index: 1483, accountType: 0, l1Address: ADDRESS }),
      'Master account · #1483',
    )
    assert.equal(
      lighterAccountLabel({ index: 281474976707511, accountType: 1, l1Address: ADDRESS }),
      'Sub-account · #281474976707511',
    )
  })
})

describe('Lighter account resolution', () => {
  const accounts = parseLighterAccountsResponse(accountsPayload) ?? []

  it('resolves the only account automatically', () => {
    assert.deepEqual(resolveLighterAccountSelection([accounts[0]], null), {
      kind: 'resolved',
      index: 1483,
    })
  })

  it('never picks one of several accounts silently', () => {
    assert.deepEqual(resolveLighterAccountSelection(accounts, null), { kind: 'ambiguous' })
    assert.deepEqual(resolveLighterAccountSelection(accounts, 999999), { kind: 'ambiguous' })
  })

  it('honors the explicit account choice and reports a wallet without accounts', () => {
    assert.deepEqual(
      resolveLighterAccountSelection(accounts, 281474976707511),
      { kind: 'resolved', index: 281474976707511 },
    )
    assert.deepEqual(resolveLighterAccountSelection([], null), { kind: 'missing' })
  })
})

describe('Lighter BTC position', () => {
  it('reads the signed BTC position and ignores other symbols', () => {
    assert.deepEqual(parseLighterAccountResponse(positionPayload), {
      accountIndex: 100833,
      btcPosition: {
        symbol: 'BTC',
        sign: -1,
        size: 126.47708,
        avgEntryPrice: 57312.9,
        positionValue: -7218918.4,
        unrealizedPnl: 1234.5,
        liquidationPrice: 0,
      },
    })
  })

  it('treats "no BTC position" as an empty state, not an error', () => {
    const payload = {
      code: 200,
      accounts: [
        {
          index: 7,
          l1_address: ADDRESS,
          positions: [{ symbol: 'BTC', sign: 1, position: '0.0000' }],
        },
      ],
    }
    assert.deepEqual(parseLighterAccountResponse(payload), {
      accountIndex: 7,
      btcPosition: null,
    })
    assert.equal(
      parseLighterAccountResponse({ code: 200, accounts: [{ index: 7, positions: [] }] })
        ?.btcPosition,
      null,
    )
    assert.equal(parseLighterAccountResponse({ code: 20001 }), null)
  })
})

describe('Lighter trades', () => {
  it('parses a page with millisecond timestamps and string amounts', () => {
    const page = parseLighterTradesResponse(tradePayload)
    assert.ok(page)
    assert.equal(page.nextCursor, 'eyJpbmRleCI6NDE5NjgwMDE4OTN9')
    assert.equal(page.trades.length, 2)
    assert.deepEqual(page.trades[0], {
      tradeId: '41968002086',
      marketId: 1,
      price: 56925.6,
      size: 0.07026,
      timestamp: 1795243344289,
      type: 'trade',
      askAccountId: 100833,
      bidAccountId: 768785,
      isMakerAsk: true,
      txHash:
        'e516661153fb6f44fc739a2420db46df7c3e7318b460f182fd4e6dc79ce0c0537662cd69901d996f',
      makerPositionSizeBefore: -126.54734,
      takerPositionSizeBefore: 0,
    })
    assert.equal(page.trades[1].type, 'liquidation')
    assert.equal(page.trades[1].isMakerAsk, false)
  })

  it('drops malformed rows instead of shifting a marker', () => {
    assert.equal(parseLighterTrade({ market_id: 1 }), null)
    assert.equal(
      parseLighterTrade({ ...tradePayload.trades[0], price: '0' }),
      null,
    )
    assert.equal(
      parseLighterTrade({ ...tradePayload.trades[0], is_maker_ask: 'yes' }),
      null,
    )
    const page = parseLighterTradesResponse({
      code: 200,
      next_cursor: null,
      trades: [tradePayload.trades[0], { trade_id: 1 }],
    })
    assert.equal(page?.trades.length, 1)
    assert.equal(page?.nextCursor, null)

    assert.equal(parseLighterTradesResponse({ code: 20001, message: 'invalid param' }), null)
  })

  it('builds public paths for the BTC perpetual market only', () => {
    assert.equal(
      lighterAccountsPath(ADDRESS),
      `https://mainnet.zklighter.elliot.ai/api/v1/account?by=l1_address&value=${ADDRESS}`,
    )
    assert.equal(
      lighterAccountPositionPath(100833),
      'https://mainnet.zklighter.elliot.ai/api/v1/account?by=index&value=100833',
    )
    const pageUrl = new URL(lighterAccountTradesPath(100833))
    assert.equal(pageUrl.pathname, '/api/v1/trades')
    assert.equal(pageUrl.searchParams.get('sort_by'), 'timestamp')
    assert.equal(pageUrl.searchParams.get('limit'), String(LIGHTER_TRADES_PAGE_LIMIT))
    assert.equal(pageUrl.searchParams.get('account_index'), '100833')
    assert.equal(pageUrl.searchParams.get('market_id'), String(LIGHTER_BTC_PERP_MARKET_ID))
    assert.equal(pageUrl.searchParams.get('cursor'), null)

    const cursorUrl = new URL(lighterAccountTradesPath(100833, 'abc/def'))
    assert.equal(cursorUrl.searchParams.get('cursor'), 'abc/def')
  })
})
