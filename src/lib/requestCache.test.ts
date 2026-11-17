import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createRequestCache } from './requestCache.ts'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('createRequestCache', () => {
  it('joins an in-flight request instead of starting a second one', async () => {
    const cache = createRequestCache()
    const first = deferred<string>()
    let runs = 0
    const run = () => {
      runs += 1
      return first.promise
    }

    const a = cache.share('key', 1_000, run)
    const b = cache.share('key', 1_000, run)
    assert.equal(runs, 1)
    assert.equal(cache.inFlightCount(), 1)

    first.resolve('payload')
    assert.deepEqual(await Promise.all([a, b]), ['payload', 'payload'])
    assert.equal(cache.inFlightCount(), 0)
  })

  it('reuses a settled value for its ttl and refetches afterwards', async () => {
    let now = 0
    const cache = createRequestCache({ now: () => now })
    let runs = 0
    const run = () => {
      runs += 1
      return Promise.resolve(runs)
    }

    assert.equal(await cache.share('key', 1_000, run), 1)
    assert.equal(await cache.share('key', 1_000, run), 1)
    assert.equal(runs, 1)

    now = 1_000
    assert.equal(await cache.share('key', 1_000, run), 2)
    assert.equal(runs, 2)
  })

  it('dedupes only in flight when the ttl is zero', async () => {
    let now = 0
    const cache = createRequestCache({ now: () => now })
    let runs = 0
    const run = () => {
      runs += 1
      return Promise.resolve(runs)
    }

    const shared = deferred<void>()
    void shared

    assert.equal(await cache.share('key', 0, run), 1)
    now = 1
    assert.equal(await cache.share('key', 0, run), 2)
    assert.equal(runs, 2)
  })

  it('never replays a failed read', async () => {
    const cache = createRequestCache()
    let runs = 0
    const failing = () => {
      runs += 1
      return Promise.reject(new Error('boom'))
    }

    await assert.rejects(() => cache.share('key', 60_000, failing), /boom/)
    assert.equal(cache.size(), 0)

    const recovered = await cache.share('key', 60_000, () => {
      runs += 1
      return Promise.resolve('ok')
    })
    assert.equal(recovered, 'ok')
    assert.equal(runs, 2)
  })

  it('keeps separate keys apart and evicts the oldest entry at the cap', async () => {
    const cache = createRequestCache({ maxEntries: 2 })
    const run = (value: string) => () => Promise.resolve(value)

    await cache.share('a', 60_000, run('a'))
    await cache.share('b', 60_000, run('b'))
    await cache.share('c', 60_000, run('c'))
    assert.equal(cache.size(), 2)

    let refetched = false
    await cache.share('a', 60_000, () => {
      refetched = true
      return Promise.resolve('a2')
    })
    assert.equal(refetched, true)
  })

  it('clears every entry without breaking the callers already waiting', async () => {
    const cache = createRequestCache()
    const pending = deferred<string>()
    const shared = cache.share('key', 60_000, () => pending.promise)

    cache.clear()
    assert.equal(cache.size(), 0)

    pending.resolve('late')
    assert.equal(await shared, 'late')
  })
})
