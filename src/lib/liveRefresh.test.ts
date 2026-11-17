import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { nextLiveRefreshDelayMs } from './liveRefresh.ts'

describe('nextLiveRefreshDelayMs', () => {
  it('always lands on the next wall-clock period boundary', () => {
    const period = 15_000
    for (const now of [0, 1, 12, 14_999, 15_000, 15_001, 29_999, 1_795_000_000_123]) {
      const delay = nextLiveRefreshDelayMs(now, period)
      assert.equal((now + delay) % period, 0, `now=${now}`)
      assert.ok(delay > 0 && delay <= period, `delay=${delay} for now=${now}`)
    }
  })

  it('waits a whole period when the timer starts exactly on a boundary', () => {
    assert.equal(nextLiveRefreshDelayMs(0, 15_000), 15_000)
    assert.equal(nextLiveRefreshDelayMs(30_000, 15_000), 15_000)
  })

  it('keeps two timers started a moment apart in the same phase', () => {
    const period = 15_000
    const first = nextLiveRefreshDelayMs(1_000, period)
    const second = nextLiveRefreshDelayMs(1_040, period)
    assert.equal(first - second, 40)
    assert.equal((1_000 + first) % period, (1_040 + second) % period)
  })

  it('returns zero for a non-positive or non-finite period', () => {
    assert.equal(nextLiveRefreshDelayMs(1, 0), 0)
    assert.equal(nextLiveRefreshDelayMs(1, -15_000), 0)
    assert.equal(nextLiveRefreshDelayMs(1, Number.NaN), 0)
  })
})
