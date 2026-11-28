import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createTpslLevelsFeed, type TpslFeedStatus } from './tpslLevelsFeed.ts'
import type { DecodedTpslFile } from './liquidationLevelsDecode.ts'
import type {
  TpslChannel,
  TpslHead,
  TpslRawRow,
} from './liquidationLevelsProtocol.ts'
import type {
  LiquidationLevelsStreamClient,
  LiquidationLevelsStreamStatus,
} from './liquidationLevelsStreamClient.ts'

const flush = () => new Promise((resolve) => setImmediate(resolve))

function head(over: Partial<TpslHead> = {}): TpslHead {
  return {
    snapshot: false,
    channel: 'stop_losses',
    coin: 'BTC',
    epoch: 'e1',
    seq: 1,
    ts: 1_700_000_000_000,
    ...over,
  }
}

function row(
  id: string,
  price: number,
  size: number,
  positionSize: number | null = size,
): TpslRawRow {
  return { id, ts: 1_700_000_000_000, price, size, user: '0xabc', positionSize }
}

const removal = (id: string): TpslRawRow => ({
  id,
  ts: null,
  price: null,
  size: null,
  user: null,
  positionSize: null,
})

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

  send(): void {
    this.options.onData(new ArrayBuffer(1))
  }
}

interface Harness {
  feed: ReturnType<typeof createTpslLevelsFeed>
  clients: FakeClient[]
  pending: Array<{
    resolve: (file: DecodedTpslFile) => void
    reject: (error: Error) => void
  }>
  statuses: TpslFeedStatus[]
  data: Record<TpslChannel, number>
  subscribe: (channel: TpslChannel) => () => void
  deliver: (file: DecodedTpslFile) => Promise<void>
}

function harness(): Harness {
  const clients: FakeClient[] = []
  const pending: Harness['pending'] = []
  const statuses: TpslFeedStatus[] = []
  const data: Record<TpslChannel, number> = { take_profits: 0, stop_losses: 0 }
  const feed = createTpslLevelsFeed({
    createClient: (options) => {
      const client = new FakeClient(options)
      clients.push(client)
      return client
    },
    decode: () =>
      new Promise<DecodedTpslFile>((resolve, reject) => {
        pending.push({ resolve, reject })
      }),
    now: () => 2_000,
  })
  return {
    feed,
    clients,
    pending,
    statuses,
    data,
    subscribe(channel) {
      const unsubscribeData = feed.subscribeData(channel, () => {
        data[channel] += 1
      })
      const unsubscribeStatus = feed.subscribeStatus((status) => statuses.push(status))
      return () => {
        unsubscribeData()
        unsubscribeStatus()
      }
    },
    async deliver(file) {
      const client = clients[clients.length - 1]
      const before = pending.length
      client.send()
      await flush()
      pending[before].resolve(file)
      await flush()
    },
  }
}

describe('shared tpsl feed', () => {
  it('opens one socket for both channels and stops it with the last consumer', () => {
    const h = harness()
    const stop = h.feed.subscribeData('stop_losses', () => {})
    const status = h.feed.subscribeStatus(() => {})
    assert.equal(h.clients.length, 1)
    assert.equal(h.clients[0].started, true)
    const take = h.feed.subscribeData('take_profits', () => {})
    assert.equal(h.clients.length, 1, 'enabling the sibling must reuse the socket')

    stop()
    status()
    assert.equal(h.clients[0].stopped, false, 'take profits still has a consumer')
    take()
    assert.equal(h.clients[0].stopped, true)
  })

  it('reduces each channel independently from interleaved files', async () => {
    const h = harness()
    h.subscribe('stop_losses')
    h.subscribe('take_profits')
    // Subscribing publishes one clear per channel so stale drawings vanish.
    const baseline = { ...h.data }
    h.clients[0].live()

    await h.deliver({
      head: head({ snapshot: true, channel: 'stop_losses', seq: 15_272 }),
      rows: [row('1', 95_000, 0, -1.5), row('2', 96_000, -0.25, -0.25)],
    })
    await h.deliver({
      head: head({ snapshot: true, channel: 'take_profits', seq: 11_758 }),
      rows: [row('3', 105_000, 0, 2), row('1', 120_000, 0.4, 0.4)],
    })
    await h.deliver({
      head: head({ channel: 'stop_losses', seq: 15_273 }),
      rows: [removal('2')],
    })
    await h.deliver({
      head: head({ channel: 'take_profits', seq: 11_759 }),
      rows: [row('3', 106_000, 0.5, 0.5)],
    })

    assert.equal(h.feed.status().channels.stop_losses.seq, 15_273)
    assert.equal(h.feed.status().channels.take_profits.seq, 11_759)
    assert.equal(h.feed.status().channels.stop_losses.orderCount, 1)
    assert.equal(h.feed.status().channels.take_profits.orderCount, 2)
    assert.equal(h.data.stop_losses - baseline.stop_losses, 2)
    assert.equal(h.data.take_profits - baseline.take_profits, 2)
    // The same order id lives independently in both channels.
    assert.equal(h.feed.orders('stop_losses').has('3'), false)
    assert.equal(h.feed.orders('take_profits').get('1')?.price, 120_000)

    // The index carries position-covered size on the closing side: a
    // whole-position sell (closes a long) is a positive/`long` level.
    const stopLevels = h.feed.index('stop_losses').positionsInRange(0, 200_000)
    assert.deepEqual(
      stopLevels.map((level) => [level.user, level.size]),
      [['1', 1.5]],
    )
    const takeLevels = h.feed.index('take_profits').positionsInRange(0, 200_000)
    assert.deepEqual(
      takeLevels.map((level) => [level.user, level.size]).sort(),
      [
        ['1', -0.4],
        ['3', -0.5],
      ],
    )
  })

  it('resets only the channel with the gap and keeps the sibling current', async () => {
    const h = harness()
    h.subscribe('stop_losses')
    h.subscribe('take_profits')
    h.clients[0].live()
    await h.deliver({
      head: head({ snapshot: true, channel: 'stop_losses', seq: 10 }),
      rows: [row('1', 95_000, 0, -1)],
    })
    await h.deliver({
      head: head({ snapshot: true, channel: 'take_profits', seq: 4 }),
      rows: [row('2', 105_000, 0, 2)],
    })

    await h.deliver({
      head: head({ channel: 'stop_losses', seq: 12 }),
      rows: [row('9', 90_000, 0, -1)],
    })

    assert.equal(h.feed.index('stop_losses').size(), 0)
    assert.equal(h.feed.status().channels.stop_losses.resyncing, true)
    assert.equal(h.feed.status().channels.take_profits.resyncing, false)
    assert.equal(h.feed.index('take_profits').size(), 1, 'the sibling keeps its book')
    assert.equal(h.feed.status().channels.take_profits.seq, 4)
    assert.equal(h.clients[0].reconnects.length, 1)
    assert.match(h.clients[0].reconnects[0], /expected seq 11, received 12/)
    // The fresh snapshot of the reset channel clears resyncing again.
    await h.deliver({
      head: head({ snapshot: true, channel: 'stop_losses', seq: 20 }),
      rows: [row('1', 94_000, 0, -1)],
    })
    assert.equal(h.feed.status().channels.stop_losses.resyncing, false)
    assert.equal(h.feed.status().channels.stop_losses.seq, 20)
  })

  it('keeps uncovered orders in the book but out of the painted index', async () => {
    const h = harness()
    h.subscribe('stop_losses')
    h.clients[0].live()
    await h.deliver({
      head: head({ snapshot: true, seq: 1 }),
      rows: [
        row('1', 95_000, 0, -1),
        row('2', 96_000, 0.5, 0),
        row('3', 97_000, 0.25, null),
      ],
    })
    assert.equal(h.feed.orders('stop_losses').size, 3)
    assert.equal(h.feed.orders('stop_losses').get('2')?.effectiveSize, 0)
    assert.equal(h.feed.index('stop_losses').size(), 1)
  })

  it('ignores a duplicate delta and a foreign channel without touching any book', async () => {
    const h = harness()
    h.subscribe('stop_losses')
    h.clients[0].live()
    await h.deliver({
      head: head({ snapshot: true, seq: 5 }),
      rows: [row('1', 95_000, 0, -1)],
    })
    const afterSnapshot = { ...h.data }
    await h.deliver({ head: head({ seq: 5 }), rows: [removal('1')] })
    assert.deepEqual(h.data, afterSnapshot)
    assert.equal(h.feed.index('stop_losses').size(), 1)

    await h.deliver({
      head: head({ channel: 'liquidations', seq: 6 }),
      rows: [row('1', 90_000, 0, -1)],
    })
    assert.equal(h.feed.status().channels.stop_losses.seq, 5)
    assert.equal(h.feed.index('stop_losses').positionsInRange(0, 200_000)[0].price, 95_000)
    assert.match(h.feed.status().reason ?? '', /foreign channel/)
  })

  it('decodes in arrival order even when the promises settle out of order', async () => {
    const h = harness()
    h.subscribe('stop_losses')
    h.clients[0].live()
    h.clients[0].send()
    h.clients[0].send()
    await flush()
    assert.equal(h.pending.length, 1)
    h.pending[0].resolve({
      head: head({ snapshot: true, seq: 1 }),
      rows: [row('1', 95_000, 0, -1)],
    })
    await flush()
    assert.equal(h.pending.length, 2)
    h.pending[1].resolve({ head: head({ seq: 2 }), rows: [row('2', 96_000, 0, -2)] })
    await flush()
    assert.equal(h.feed.index('stop_losses').size(), 2)
    assert.equal(h.clients[0].reconnects.length, 0)
  })

  it('never applies a decode that resolves after the last consumer left', async () => {
    const h = harness()
    const unsubscribe = h.subscribe('stop_losses')
    h.clients[0].live()
    h.clients[0].send()
    await flush()
    const before = h.data.stop_losses
    unsubscribe()
    h.pending[0].resolve({
      head: head({ snapshot: true, seq: 1 }),
      rows: [row('1', 95_000, 0, -1)],
    })
    await flush()
    assert.equal(h.data.stop_losses, before)
    assert.equal(h.feed.index('stop_losses').size(), 0)
    assert.equal(h.feed.status().phase, 'stopped')
    assert.equal(h.clients[0].stopped, true)
  })

  it('surfaces a decode error without corrupting the applied books', async () => {
    const h = harness()
    h.subscribe('stop_losses')
    h.clients[0].live()
    await h.deliver({
      head: head({ snapshot: true, seq: 1 }),
      rows: [row('1', 95_000, 0, -1)],
    })
    h.clients[0].send()
    await flush()
    h.pending[1].reject(new Error('not a parquet file'))
    await flush()
    assert.match(h.feed.status().reason ?? '', /decode error/)
    assert.equal(h.feed.index('stop_losses').size(), 1)
  })
})
