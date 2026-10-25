import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_HYPERLIQUID_ACCOUNT_ADDRESS,
  hyperliquidAccountFillsByTimePath,
  hyperliquidAccountFillsPath,
  hyperliquidAccountPositionPath,
  hyperliquidUserFillsChannel,
  isValidHyperliquidAccountAddress,
  normalizeHyperliquidAccountAddress,
  resolveHyperliquidAccountAddress,
} from './hyperliquidAccount.ts'
import {
  parseHyperliquidAccountFillsResponse,
  parseHyperliquidAccountPositionResponse,
} from './hyperliquidAccountApi.ts'

const ADDRESS = '0xaf68caebaa151dd592112a07e2344b3950e13561'
const DEFAULT_LOWER = '0x01567befc20aa7d5d1a8eb2107efae633ff090f5'

describe('Hyperliquid account address', () => {
  it('accepts exactly 0x + 40 hex chars and lower-cases the value', () => {
    const mixed = `0x${ADDRESS.slice(2).toUpperCase()}`
    assert.equal(isValidHyperliquidAccountAddress(mixed), true)
    assert.equal(normalizeHyperliquidAccountAddress(`  ${mixed}  `), ADDRESS)
  })

  it('rejects malformed addresses', () => {
    for (const value of [
      '',
      '0x1234',
      ADDRESS.slice(2),
      `${ADDRESS}00`,
      '0xaf68caebaa151dd592112a07e2344b3950e1356z',
      null,
      undefined,
      42,
    ]) {
      assert.equal(isValidHyperliquidAccountAddress(value), false)
      assert.equal(normalizeHyperliquidAccountAddress(value), null)
    }
  })

  it('keeps a valid built-in default address and normalizes it for API use', () => {
    assert.equal(isValidHyperliquidAccountAddress(DEFAULT_HYPERLIQUID_ACCOUNT_ADDRESS), true)
    assert.equal(
      normalizeHyperliquidAccountAddress(DEFAULT_HYPERLIQUID_ACCOUNT_ADDRESS),
      DEFAULT_LOWER,
    )
  })

  it('uses the default constant when no address is supplied', () => {
    assert.equal(resolveHyperliquidAccountAddress(), DEFAULT_LOWER)
    assert.equal(resolveHyperliquidAccountAddress(undefined), DEFAULT_LOWER)
    assert.equal(resolveHyperliquidAccountAddress(null), DEFAULT_LOWER)
    assert.equal(resolveHyperliquidAccountAddress('0x1234'), DEFAULT_LOWER)
    assert.equal(
      resolveHyperliquidAccountAddress(`0x${ADDRESS.slice(2).toUpperCase()}`),
      ADDRESS,
    )
  })
})

describe('Hyperliquid account API contract', () => {
  it('builds the documented read-only paths', () => {
    assert.equal(
      hyperliquidAccountPositionPath(ADDRESS),
      `/market/hyperliquid/account/${ADDRESS}/position`,
    )
    assert.equal(
      hyperliquidAccountFillsPath(ADDRESS),
      `/market/hyperliquid/account/${ADDRESS}/fills`,
    )
    assert.equal(
      hyperliquidAccountFillsByTimePath(ADDRESS),
      `/market/hyperliquid/account/${ADDRESS}/fills/by-time`,
    )
    assert.equal(
      hyperliquidUserFillsChannel(ADDRESS),
      `hyperliquid.account.${ADDRESS}.userfills`,
    )
  })

  it('parses position responses defensively', () => {
    assert.equal(parseHyperliquidAccountPositionResponse(null), null)
    assert.equal(parseHyperliquidAccountPositionResponse({}), null)

    const parsed = parseHyperliquidAccountPositionResponse({
      address: ADDRESS,
      positions: [],
      btc_position: null,
    })
    assert.deepEqual(parsed, {
      address: ADDRESS,
      positions: [],
      btc_position: null,
    })
  })

  it('parses fill responses and keeps truncation honest', () => {
    assert.equal(parseHyperliquidAccountFillsResponse({}), null)

    const parsed = parseHyperliquidAccountFillsResponse({
      address: ADDRESS,
      fills: [],
      count: 0,
      truncated: true,
      complete: false,
    })
    assert.equal(parsed?.truncated, true)
    assert.equal(parsed?.complete, false)
  })
})
