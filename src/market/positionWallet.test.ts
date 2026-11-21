import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_POSITION_WALLET,
  POSITION_WALLET_ADDRESS_FORMAT_ERROR,
  POSITION_WALLET_ADDRESS_MISSING_ERROR,
  POSITION_WALLET_STORAGE_KEY,
  getPositionWallet,
  loadPositionWallet,
  positionWalletAddressError,
  positionWalletSelectionKey,
  positionWalletShortLabel,
  resetPositionWallet,
  sanitizePositionWalletSelection,
  savePositionWallet,
  setPositionWallet,
  subscribePositionWallet,
} from './positionWallet.ts'

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
    key(index: number) {
      return [...memory.keys()][index] ?? null
    },
    removeItem(key: string) {
      memory.delete(key)
    },
    setItem(key: string, value: string) {
      memory.set(key, value)
    },
  } as Storage
  setPositionWallet(DEFAULT_POSITION_WALLET)
})

describe('wallet address validation', () => {
  it('accepts an EVM address and rejects everything else with a readable message', () => {
    assert.equal(positionWalletAddressError('0xE8c1a8c7A94AC89b138FC8B2Bd8A09bfA2E1AcDe'), null)
    assert.equal(positionWalletAddressError('  '), POSITION_WALLET_ADDRESS_MISSING_ERROR)
    assert.equal(positionWalletAddressError('0x123'), POSITION_WALLET_ADDRESS_FORMAT_ERROR)
    assert.equal(
      positionWalletAddressError('0xE8c1a8c7A94AC89b138FC8B2Bd8A09bfA2E1AcDe00'),
      POSITION_WALLET_ADDRESS_FORMAT_ERROR,
    )
    assert.equal(positionWalletAddressError(null), POSITION_WALLET_ADDRESS_MISSING_ERROR)
  })
})

describe('selection sanitizing', () => {
  it('lower-cases a valid address and keeps the exchange', () => {
    assert.deepEqual(
      sanitizePositionWalletSelection({
        exchange: 'lighter',
        address: '0xAAAABBBBCCCCDDDDEEEEFFFF0000111122223333',
        lighterAccountIndex: 7,
      }),
      {
        exchange: 'lighter',
        address: '0xaaaabbbbccccddddeeeeffff0000111122223333',
        lighterAccountIndex: 7,
      },
    )
  })

  it('falls back to the built-in Hyperliquid wallet instead of failing', () => {
    for (const value of [null, undefined, 42, {}, { exchange: 'nope', address: 'nope' }]) {
      const sanitized = sanitizePositionWalletSelection(value)
      assert.equal(sanitized.exchange, 'hyperliquid')
      assert.equal(sanitized.address, DEFAULT_POSITION_WALLET.address)
      assert.equal(sanitized.lighterAccountIndex, null)
    }
  })

  it('drops an invalid or out-of-range Lighter account index', () => {
    const address = '0xAAAABBBBCCCCDDDDEEEEFFFF0000111122223333'
    assert.equal(
      sanitizePositionWalletSelection({
        exchange: 'lighter',
        address,
        lighterAccountIndex: -1,
      }).lighterAccountIndex,
      null,
    )
    assert.equal(
      sanitizePositionWalletSelection({
        exchange: 'lighter',
        address,
        lighterAccountIndex: 1.5,
      }).lighterAccountIndex,
      null,
    )
    assert.equal(
      sanitizePositionWalletSelection({
        exchange: 'lighter',
        address,
        lighterAccountIndex: Number.MAX_SAFE_INTEGER + 2,
      }).lighterAccountIndex,
      null,
    )
  })

  it('never keeps a Lighter index on a Hyperliquid selection', () => {
    assert.equal(
      sanitizePositionWalletSelection({
        exchange: 'hyperliquid',
        address: DEFAULT_POSITION_WALLET.address,
        lighterAccountIndex: 12,
      }).lighterAccountIndex,
      null,
    )
  })
})

describe('selection identity and label', () => {
  it('changes the key when exchange, address or Lighter account changes', () => {
    const base = { ...DEFAULT_POSITION_WALLET }
    const address = '0xaaaabbbbccccddddeeeeffff0000111122223333'
    assert.notEqual(
      positionWalletSelectionKey(base),
      positionWalletSelectionKey({ exchange: 'lighter', address, lighterAccountIndex: null }),
    )
    assert.notEqual(
      positionWalletSelectionKey({ exchange: 'lighter', address, lighterAccountIndex: null }),
      positionWalletSelectionKey({ exchange: 'lighter', address, lighterAccountIndex: 4 }),
    )
  })

  it('labels the exchange, a shortened address and an explicit account', () => {
    assert.equal(
      positionWalletShortLabel({
        exchange: 'lighter',
        address: '0x1234567890abcdef1234567890abcdef12345678',
        lighterAccountIndex: 42,
      }),
      'Lighter · 0x1234…5678 · #42',
    )
  })
})

describe('persistence', () => {
  it('round-trips the persisted record and defaults when the record is broken JSON', () => {
    const selection = {
      exchange: 'lighter' as const,
      address: '0xaaaabbbbccccddddeeeeffff0000111122223333',
      lighterAccountIndex: 9,
    }
    savePositionWallet(selection)
    assert.deepEqual(loadPositionWallet(), selection)

    memory.set(POSITION_WALLET_STORAGE_KEY, '{not json')
    assert.deepEqual(loadPositionWallet(), DEFAULT_POSITION_WALLET)

    memory.clear()
    assert.deepEqual(loadPositionWallet(), DEFAULT_POSITION_WALLET)
  })

  it('persists on set and notifies subscribers, and reset restores the built-in wallet', () => {
    let notifications = 0
    const unsubscribe = subscribePositionWallet(() => {
      notifications += 1
    })
    const next = setPositionWallet({
      exchange: 'lighter',
      address: '0xAAAABBBBCCCCDDDDEEEEFFFF0000111122223333',
      lighterAccountIndex: 3,
    })
    assert.equal(getPositionWallet().exchange, 'lighter')
    assert.equal(notifications, 1)
    assert.equal(memory.get(POSITION_WALLET_STORAGE_KEY), JSON.stringify(next))

    resetPositionWallet()
    assert.deepEqual(getPositionWallet(), DEFAULT_POSITION_WALLET)
    assert.equal(notifications, 2)
    unsubscribe()
  })

  it('still works in memory when localStorage is unavailable', () => {
    // @ts-expect-error simulate a host without localStorage
    delete globalThis.localStorage
    assert.deepEqual(loadPositionWallet(), DEFAULT_POSITION_WALLET)
    const saved = setPositionWallet({
      exchange: 'lighter',
      address: '0xAAAABBBBCCCCDDDDEEEEFFFF0000111122223333',
      lighterAccountIndex: null,
    })
    assert.deepEqual(getPositionWallet(), saved)
  })
})
