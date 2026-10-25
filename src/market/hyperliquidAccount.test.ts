import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  clearHyperliquidAccountAddress,
  hyperliquidAccountFillsByTimePath,
  hyperliquidAccountFillsPath,
  hyperliquidAccountPositionPath,
  hyperliquidUserFillsChannel,
  HYPERLIQUID_ACCOUNT_CHANGED_EVENT,
  HYPERLIQUID_ACCOUNT_STORAGE_KEY,
  isValidHyperliquidAccountAddress,
  loadHyperliquidAccountAddress,
  normalizeHyperliquidAccountAddress,
  saveHyperliquidAccountAddress,
} from './hyperliquidAccount.ts'
import {
  parseHyperliquidAccountFillsResponse,
  parseHyperliquidAccountPositionResponse,
} from './hyperliquidAccountApi.ts'

const ADDRESS = '0xaf68caebaa151dd592112a07e2344b3950e13561'
const memory = new Map<string, string>()

beforeEach(() => {
  memory.clear()
  globalThis.localStorage = {
    get length() {
      return memory.size
    },
    clear() {
      memory.clear()
    },
    getItem(key: string) {
      return memory.get(key) ?? null
    },
    setItem(key: string, value: string) {
      memory.set(key, value)
    },
    removeItem(key: string) {
      memory.delete(key)
    },
    key(index: number) {
      return [...memory.keys()][index] ?? null
    },
  }
})

afterEach(() => {
  memory.clear()
})

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

  it('persists, reloads and removes the workspace-level address', () => {
    assert.equal(loadHyperliquidAccountAddress(), null)
    assert.equal(saveHyperliquidAccountAddress(`0x${ADDRESS.slice(2).toUpperCase()}`), ADDRESS)
    assert.equal(
      memory.get(HYPERLIQUID_ACCOUNT_STORAGE_KEY),
      ADDRESS,
    )
    assert.equal(loadHyperliquidAccountAddress(), ADDRESS)

    clearHyperliquidAccountAddress()
    assert.equal(loadHyperliquidAccountAddress(), null)
    assert.equal(memory.has(HYPERLIQUID_ACCOUNT_STORAGE_KEY), false)
  })

  it('does not overwrite storage with an invalid address', () => {
    saveHyperliquidAccountAddress(ADDRESS)
    assert.equal(saveHyperliquidAccountAddress('0x1234'), null)
    assert.equal(loadHyperliquidAccountAddress(), ADDRESS)
  })

  it('notifies other panels/tabs when the workspace account changes', () => {
    const events: string[] = []
    // @ts-expect-error minimal window stub for the notification assertion
    globalThis.window = {
      dispatchEvent: (event: Event) => {
        events.push(event.type)
        return true
      },
    }
    saveHyperliquidAccountAddress(ADDRESS)
    clearHyperliquidAccountAddress()
    // @ts-expect-error remove the stub
    delete globalThis.window
    assert.deepEqual(events, [
      HYPERLIQUID_ACCOUNT_CHANGED_EVENT,
      HYPERLIQUID_ACCOUNT_CHANGED_EVENT,
    ])
  })

  it('ignores corrupt saved values and unavailable storage', () => {
    memory.set(HYPERLIQUID_ACCOUNT_STORAGE_KEY, '{"not":"an-address"}')
    assert.equal(loadHyperliquidAccountAddress(), null)

    const original = globalThis.localStorage
    // @ts-expect-error intentionally simulate unavailable storage
    delete globalThis.localStorage
    assert.equal(loadHyperliquidAccountAddress(), null)
    assert.equal(saveHyperliquidAccountAddress(ADDRESS), ADDRESS)
    clearHyperliquidAccountAddress()
    globalThis.localStorage = original
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
