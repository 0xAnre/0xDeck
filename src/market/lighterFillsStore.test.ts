import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  getLighterPositionMarkersSnapshot,
  subscribeLighterPositionMarkers,
} from './lighterFillsStore.ts'
import type { PositionWalletSelection } from './positionWallet.ts'

const ADDRESS = '0xaaaabbbbccccddddeeeeffff0000111122223333'

const selection: PositionWalletSelection = {
  exchange: 'lighter',
  address: ADDRESS,
  lighterAccountIndex: null,
}

type FetchInit = RequestInit | undefined

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function accountsPayload(accounts: Array<{ index: number; account_type?: number }>) {
  return {
    code: 200,
    total: accounts.length,
    accounts: accounts.map((account) => ({
      code: 0,
      index: account.index,
      account_type: account.account_type ?? 0,
      l1_address: ADDRESS,
      positions: [],
    })),
  }
}

function tradesPayload(tradeIds: string[], nextCursor: string | null = null) {
  return {
    code: 200,
    next_cursor: nextCursor,
    trades: tradeIds.map((tradeId, index) => ({
      trade_id_str: tradeId,
      type: 'trade',
      market_id: 1,
      size: '0.01',
      price: '56000',
      ask_account_id: 42,
      bid_account_id: 1000 + index,
      is_maker_ask: true,
      maker_position_size_before: '-0.01',
      taker_position_size_before: '0',
      timestamp: 1795243344000 + index,
    })),
  }
}

type ScriptedResponse = unknown | ((url: string) => Response)

function installFetch(script: ScriptedResponse[] | ((url: string, init: FetchInit) => Response)) {
  const requests: string[] = []
  const original = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    requests.push(url)
    if (typeof script === 'function') return script(url, init)
    const next = script.length > 1 ? script.shift() : script[0]
    if (next instanceof Error) throw next
    return next as Response
  }) as typeof fetch
  return {
    requests,
    restore() {
      globalThis.fetch = original
    },
  }
}

async function waitFor(condition: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 6_000
  while (Date.now() < deadline) {
    if (condition()) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  assert.fail(`timed out waiting for ${label}`)
}

let cleanup: (() => void) | null = null
const trackedUnsubscribes: Array<() => void> = []
const originalFetch = globalThis.fetch

/** Every subscription is torn down even when an assertion fails mid-test. */
function trackSubscribe(listener: () => void): () => void {
  const unsubscribe = subscribeLighterPositionMarkers(selection, listener)
  trackedUnsubscribes.push(unsubscribe)
  return unsubscribe
}

afterEach(() => {
  while (trackedUnsubscribes.length > 0) trackedUnsubscribes.pop()?.()
  cleanup?.()
  cleanup = null
  globalThis.fetch = originalFetch
})

describe('shared Lighter position-markers session', () => {
  it('resolves the single account, loads its BTC trades and reads its position once', async () => {
    const fetchStub = installFetch((url) => {
      if (url.includes('/account?by=l1_address')) return jsonResponse(accountsPayload([{ index: 42 }]))
      if (url.includes('/trades?')) return jsonResponse(tradesPayload(['1', '2']))
      throw new Error(`unexpected request ${url}`)
    })
    cleanup = fetchStub.restore

    const unsubscribe = trackSubscribe(() => {})
    await waitFor(() => getLighterPositionMarkersSnapshot().status === 'ready', 'ready snapshot')

    const snapshot = getLighterPositionMarkersSnapshot()
    assert.equal(snapshot.accountIndex, 42)
    assert.equal(snapshot.fills.length, 2)
    assert.equal(snapshot.error, null)
    assert.equal(snapshot.notice, null)
    assert.equal(fetchStub.requests.filter((url) => url.includes('/trades?')).length, 1)

    unsubscribe()
    assert.equal(getLighterPositionMarkersSnapshot().status, 'idle')
  })

  it('serves several widgets from one session instead of one request per widget', async () => {
    const fetchStub = installFetch((url) => {
      if (url.includes('/account?by=l1_address')) return jsonResponse(accountsPayload([{ index: 42 }]))
      if (url.includes('/trades?')) return jsonResponse(tradesPayload(['1']))
      throw new Error(`unexpected request ${url}`)
    })
    cleanup = fetchStub.restore

    const first = trackSubscribe(() => {})
    const second = trackSubscribe(() => {})
    await waitFor(() => getLighterPositionMarkersSnapshot().status === 'ready', 'ready snapshot')

    assert.equal(fetchStub.requests.filter((url) => url.includes('/account?')).length, 1)
    assert.equal(fetchStub.requests.filter((url) => url.includes('/trades?')).length, 1)

    second()
    // The session survives while a panel still listens; it stops with the last one.
    assert.notEqual(getLighterPositionMarkersSnapshot().status, 'idle')
    first()
    assert.equal(getLighterPositionMarkersSnapshot().status, 'idle')
  })

  it('never mixes accounts when a wallet owns several — the user must choose', async () => {
    const fetchStub = installFetch((url) => {
      if (url.includes('/account?by=l1_address')) {
        return jsonResponse(accountsPayload([{ index: 7 }, { index: 42, account_type: 1 }]))
      }
      throw new Error(`unexpected request ${url}`)
    })
    cleanup = fetchStub.restore

    const unsubscribe = trackSubscribe(() => {})
    await waitFor(() => getLighterPositionMarkersSnapshot().status === 'ready', 'ready snapshot')
    const snapshot = getLighterPositionMarkersSnapshot()
    assert.equal(snapshot.accountIndex, null)
    assert.equal(snapshot.fills.length, 0)
    assert.match(snapshot.notice ?? '', /owns 2 Lighter accounts/)
    assert.equal(fetchStub.requests.filter((url) => url.includes('/trades?')).length, 0)
    unsubscribe()
  })

  it('treats a wallet without a Lighter account as an empty state', async () => {
    const fetchStub = installFetch((url) => {
      if (url.includes('/account?by=l1_address')) return jsonResponse(accountsPayload([]))
      throw new Error(`unexpected request ${url}`)
    })
    cleanup = fetchStub.restore

    const unsubscribe = trackSubscribe(() => {})
    await waitFor(() => getLighterPositionMarkersSnapshot().status === 'ready', 'ready snapshot')
    const snapshot = getLighterPositionMarkersSnapshot()
    assert.equal(snapshot.fills.length, 0)
    assert.match(snapshot.notice ?? '', /No Lighter account/)
    unsubscribe()
  })

  it('retries a transient start failure with backoff and recovers without a user action', async () => {
    let accountCalls = 0
    const fetchStub = installFetch((url) => {
      if (url.includes('/account?by=l1_address')) {
        accountCalls += 1
        if (accountCalls === 1) {
          // Network-level failure on the first attempt.
          throw new Error('offline')
        }
        return jsonResponse(accountsPayload([{ index: 42 }]))
      }
      if (url.includes('/trades?')) return jsonResponse(tradesPayload(['1']))
      throw new Error(`unexpected request ${url}`)
    })
    cleanup = fetchStub.restore

    const unsubscribe = trackSubscribe(() => {})
    await waitFor(() => getLighterPositionMarkersSnapshot().status === 'error', 'first failure')
    assert.match(getLighterPositionMarkersSnapshot().error ?? '', /Could not reach Lighter/)
    // The retry is scheduled by the session itself (1s base delay).
    await waitFor(() => getLighterPositionMarkersSnapshot().status === 'ready', 'recovered session')
    assert.equal(getLighterPositionMarkersSnapshot().fills.length, 1)
    assert.equal(getLighterPositionMarkersSnapshot().error, null)
    assert.ok(accountCalls >= 2)
    unsubscribe()
    assert.equal(getLighterPositionMarkersSnapshot().status, 'idle')
  })

  it('reports a provider rate limit instead of pretending the history is empty', async () => {
    const fetchStub = installFetch(() =>
      jsonResponse({ code: 429, message: 'rate limited' }, 429),
    )
    cleanup = fetchStub.restore

    const unsubscribe = trackSubscribe(() => {})
    await waitFor(() => getLighterPositionMarkersSnapshot().status === 'error', 'error snapshot')
    assert.match(getLighterPositionMarkersSnapshot().error ?? '', /rate limit/)
    unsubscribe()
  })
})
