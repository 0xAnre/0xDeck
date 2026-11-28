import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  createLiquidationLevelsFeed,
  type LiquidationLevelsFeed,
  type LiquidationLevelsFeedStatus,
} from './liquidationLevelsFeed.ts'
import type { DecodedLiquidationLevelsFile } from './liquidationLevelsDecode.ts'
import type {
  LiquidationLevelsHead,
  LiquidationLevelsRawRow,
} from './liquidationLevelsProtocol.ts'
import type {
  LiquidationLevelsStreamClient,
  LiquidationLevelsStreamStatus,
} from './liquidationLevelsStreamClient.ts'

const flush = () => new Promise((resolve) => setImmediate(resolve))

function head(over: Partial<LiquidationLevelsHead> = {}): LiquidationLevelsHead {
  return {
    snapshot: false,
    channel: 'liquidations',
    coin: 'BTC',
    epoch: 'e1',
    seq: 1,
    ts: 1_700_000_000_000,
    ...over,
  }
}

function row(user: string, price: number, size: number): LiquidationLevelsRawRow {
  return { user, price, size, ts: 1_700_000_000_000 }
}

class FakeClient implements LiquidationLevelsStreamClient {
  readonly options
  started = false
  stopped = false
  reconnects: string[] = []
  private _status: LiquidationLevelsStreamStatus = {
    phase: 'idle',
    attempt: 0,
    reason: null,
    retryInMs: null,
    lastDataAt: null,
    lastFrameAt: null,
  }

  constructor(options: {
    url: string
    onData: (buffer: ArrayBuffer) => void
    onStatus: (status: LiquidationLevelsStreamStatus) => void
  }) {
    this.options = options
  }

  start(): void {
    this.started = true
  }

  stop(): void {
    this.stopped = true
  }

  reconnect(reason: string): void {
    this.reconnects.push(reason)
  }

  status(): LiquidationLevelsStreamStatus {
    return this._status
  }

  live(): void {
    this._status = {
      ...this._status,
      phase: 'live',
      attempt: 1,
      lastDataAt: 1_000,
      lastFrameAt: 1_000,
    }
    this.options.onStatus(this._status)
  }

  stale(): void {
    this._status = { ...this._status, phase: 'stale', reason: 'no new data' }
    this.options.onStatus(this._status)
  }

  /** Push one binary file; its decode stays pending until the test resolves it. */
  send(): void {
    this.options.onData(new ArrayBuffer(1))
  }
}

interface Harness {
  feed: LiquidationLevelsFeed
  clients: FakeClient[]
  pending: Array<{
    resolve: (file: DecodedLiquidationLevelsFile) => void
    reject: (error: Error) => void
  }>
  statuses: LiquidationLevelsFeedStatus[]
  dataEvents: number
  subscribe: () => () => void
  sendAndDecode: (file: DecodedLiquidationLevelsFile) => Promise<void>
}

function harness(): Harness {
  const clients: FakeClient[] = []
  const pending: Harness['pending'] = []
  const statuses: LiquidationLevelsFeedStatus[] = []
  let dataEvents = 0
  const feed = createLiquidationLevelsFeed({
    createClient: (options) => {
      const client = new FakeClient(options)
      clients.push(client)
      return client
    },
    decode: () =>
      new Promise<DecodedLiquidationLevelsFile>((resolve, reject) => {
        pending.push({ resolve, reject })
      }),
    now: () => 2_000,
  })
  return {
    feed,
    clients,
    pending,
    statuses,
    get dataEvents() {
      return dataEvents
    },
    subscribe() {
      const unsubscribeData = feed.subscribeData(() => {
        dataEvents += 1
      })
      const unsubscribeStatus = feed.subscribeStatus((status) => statuses.push(status))
      return () => {
        unsubscribeData()
        unsubscribeStatus()
      }
    },
    async sendAndDecode(file) {
      const client = clients[clients.length - 1]
      const before = pending.length
      client.send()
      await flush()
      pending[before].resolve(file)
      await flush()
    },
  }
}

describe('shared liquidation-level feed', () => {
  it('opens one client for every subscriber and stops it with the last one', () => {
    const h = harness()
    const first = h.subscribe()
    const second = h.subscribe()
    assert.equal(h.clients.length, 1)
    assert.equal(h.clients[0].started, true)
    assert.equal(h.feed.consumerCount(), 4) // two data + two status listeners

    first()
    assert.equal(h.clients[0].stopped, false)
    second()
    assert.equal(h.clients[0].stopped, true)
    assert.equal(h.feed.consumerCount(), 0)
  })

  it('notifies once per applied file, not once per position', async () => {
    const h = harness()
    h.subscribe()
    // Subscribing itself publishes once so any stale drawing is cleared.
    const baseline = h.dataEvents
    const rows = Array.from({ length: 500 }, (_, index) =>
      row(`0x${index.toString(16).padStart(40, '0')}`, 100 + index, 1),
    )
    h.clients[0].live()
    await h.sendAndDecode({ head: head({ snapshot: true, seq: 28_356 }), rows })

    assert.equal(h.dataEvents - baseline, 1)
    assert.equal(h.feed.index().size(), 500)
    assert.equal(h.feed.status().seq, 28_356)
    assert.equal(h.feed.status().positionCount, 500)
    assert.equal(h.feed.status().phase, 'live')
  })

  it('adopts a non-zero snapshot sequence and applies the next delta', async () => {
    const h = harness()
    h.subscribe()
    h.clients[0].live()
    await h.sendAndDecode({
      head: head({ snapshot: true, seq: 28_356 }),
      rows: [row('0xa', 100, 1), row('0xb', 101, -2)],
    })
    await h.sendAndDecode({ head: head({ seq: 28_357 }), rows: [row('0xa', 102, 3)] })

    assert.deepEqual(
      h.feed.index().positionsInRange(0, 1_000).map((position) => [
        position.user,
        position.price,
        position.size,
      ]),
      [
        ['0xb', 101, -2],
        ['0xa', 102, 3],
      ],
    )
    assert.equal(h.feed.status().seq, 28_357)
    assert.equal(h.feed.status().resyncing, false)
  })

  it('ignores a re-delivered delta without a notification', async () => {
    const h = harness()
    h.subscribe()
    const baseline = h.dataEvents
    h.clients[0].live()
    await h.sendAndDecode({
      head: head({ snapshot: true, seq: 5 }),
      rows: [row('0xa', 100, 1)],
    })
    await h.sendAndDecode({ head: head({ seq: 5 }), rows: [row('0xa', 200, 1)] })
    assert.equal(h.dataEvents - baseline, 1)
    assert.equal(h.feed.index().positionsInRange(0, 1_000)[0].price, 100)
  })

  it('clears the book and reconnects on a sequence gap', async () => {
    const h = harness()
    h.subscribe()
    const baseline = h.dataEvents
    h.clients[0].live()
    await h.sendAndDecode({
      head: head({ snapshot: true, seq: 10 }),
      rows: [row('0xa', 100, 1)],
    })
    await h.sendAndDecode({ head: head({ seq: 12 }), rows: [row('0xb', 200, 1)] })

    assert.equal(h.feed.index().size(), 0)
    assert.equal(h.feed.status().resyncing, true)
    assert.equal(h.clients[0].reconnects.length, 1)
    assert.match(h.clients[0].reconnects[0], /expected seq 11, received 12/)
    // The reset is published so a stale profile is never left on screen.
    assert.equal(h.dataEvents - baseline, 2)
  })

  it('resets on an epoch change instead of mixing two books', async () => {
    const h = harness()
    h.subscribe()
    h.clients[0].live()
    await h.sendAndDecode({
      head: head({ snapshot: true, seq: 1, epoch: 'e1' }),
      rows: [row('0xa', 100, 1)],
    })
    await h.sendAndDecode({
      head: head({ seq: 2, epoch: 'e2' }),
      rows: [row('0xb', 200, 1)],
    })
    assert.equal(h.feed.index().size(), 0)
    assert.equal(h.feed.status().resyncing, true)
    assert.match(h.clients[0].reconnects[0], /epoch/)
  })

  it('decodes in arrival order even when the promises settle out of order', async () => {
    const h = harness()
    h.subscribe()
    h.clients[0].live()
    h.clients[0].send()
    h.clients[0].send()
    await flush()
    assert.equal(h.pending.length, 1) // the second file waits for the first

    h.pending[0].resolve({
      head: head({ snapshot: true, seq: 1 }),
      rows: [row('0xa', 100, 1)],
    })
    await flush()
    assert.equal(h.pending.length, 2)
    h.pending[1].resolve({ head: head({ seq: 2 }), rows: [row('0xb', 101, -1)] })
    await flush()

    assert.deepEqual(
      h.feed.index().positionsInRange(0, 1_000).map((position) => position.user),
      ['0xa', '0xb'],
    )
    assert.equal(h.clients[0].reconnects.length, 0)
  })

  it('never applies a decode that resolves after the last consumer left', async () => {
    const h = harness()
    const unsubscribe = h.subscribe()
    const baseline = h.dataEvents
    h.clients[0].live()
    h.clients[0].send()
    await flush()
    unsubscribe()
    h.pending[0].resolve({
      head: head({ snapshot: true, seq: 1 }),
      rows: [row('0xa', 100, 1)],
    })
    await flush()

    assert.equal(h.dataEvents, baseline)
    assert.equal(h.feed.index().size(), 0)
    assert.equal(h.feed.status().phase, 'stopped')
    assert.equal(h.clients[0].stopped, true)
  })

  it('restarts with an empty book for a new consumer', async () => {
    const h = harness()
    const first = h.subscribe()
    h.clients[0].live()
    await h.sendAndDecode({
      head: head({ snapshot: true, seq: 3 }),
      rows: [row('0xa', 100, 1)],
    })
    assert.equal(h.feed.index().size(), 1)
    first()

    const second = h.subscribe()
    assert.equal(h.clients.length, 2)
    assert.equal(h.feed.index().size(), 0)
    assert.equal(h.feed.status().positionCount, 0)
    second()
  })

  it('reports a decode failure without corrupting the applied book', async () => {
    const h = harness()
    h.subscribe()
    h.clients[0].live()
    await h.sendAndDecode({
      head: head({ snapshot: true, seq: 1 }),
      rows: [row('0xa', 100, 1)],
    })
    h.clients[0].send()
    await flush()
    h.pending[1].reject(new Error('not a parquet file'))
    await flush()

    assert.equal(h.feed.status().error, 'not a parquet file')
    assert.equal(h.feed.index().size(), 1)
    await h.sendAndDecode({ head: head({ seq: 2 }), rows: [row('0xb', 101, -1)] })
    assert.equal(h.feed.status().error, null)
    assert.equal(h.feed.index().size(), 2)
  })

  it('publishes stream phase changes for the honest stale state', async () => {
    const h = harness()
    h.subscribe()
    h.clients[0].live()
    assert.equal(h.statuses[h.statuses.length - 1].phase, 'live')
    h.clients[0].stale()
    assert.equal(h.statuses[h.statuses.length - 1].phase, 'stale')
  })
})
