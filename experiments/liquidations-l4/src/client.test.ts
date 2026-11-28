import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  createStreamClient,
  type SocketLike,
  type StreamStatus,
} from './client.ts'

/** Deterministic timer queue: lets the watchdog/backoff logic be driven by hand. */
class FakeScheduler {
  private time: number
  private nextId = 0
  private timers = new Map<number, { at: number; fn: () => void }>()

  now = (): number => this.time

  schedule = (fn: () => void, delayMs: number): number => {
    const id = this.nextId++
    this.timers.set(id, { at: this.time + Math.max(0, delayMs), fn })
    return id
  }

  cancel = (id: number): void => {
    this.timers.delete(id)
  }

  advance(ms: number): void {
    const target = this.time + ms
    for (;;) {
      const due = [...this.timers.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort((a, b) => a[1].at - b[1].at)[0]
      if (!due) break
      const [id, timer] = due
      this.timers.delete(id)
      this.time = timer.at
      timer.fn()
    }
    this.time = target
  }

  pendingDelays(): number[] {
    return [...this.timers.values()].map((timer) => timer.at - this.time)
  }

  constructor(start = 1_000) {
    this.time = start
  }
}

class FakeSocket implements SocketLike {
  binaryType = 'blob'
  onopen: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onclose: ((event: { code?: number; reason?: string }) => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  sent: string[] = []
  closed = false
  url: string

  constructor(url: string) {
    this.url = url
  }

  send(data: string): void {
    this.sent.push(data)
  }

  close(): void {
    this.closed = true
  }

  open(): void {
    this.onopen?.()
  }

  message(data: unknown): void {
    this.onmessage?.({ data })
  }

  drop(code = 1006): void {
    this.onclose?.({ code })
  }
}

interface Harness {
  scheduler: FakeScheduler
  sockets: FakeSocket[]
  statuses: StreamStatus[]
  data: ArrayBuffer[]
  client: ReturnType<typeof createStreamClient>
}

function harness(): Harness {
  const scheduler = new FakeScheduler()
  const sockets: FakeSocket[] = []
  const statuses: StreamStatus[] = []
  const data: ArrayBuffer[] = []
  const client = createStreamClient({
    url: 'wss://example.invalid/liquidations/BTC',
    createSocket: (url) => {
      const socket = new FakeSocket(url)
      sockets.push(socket)
      return socket
    },
    scheduler,
    now: scheduler.now,
    random: () => 0.5,
    staleAfterMs: 6_000,
    deadAfterMs: 30_000,
    backoffBaseMs: 500,
    backoffMaxMs: 8_000,
    onData: (buffer) => data.push(buffer),
    onStatus: (status) => statuses.push({ ...status }),
  })
  return { scheduler, sockets, statuses, data, client }
}

const binary = (): ArrayBuffer => new Uint8Array([1, 2, 3]).buffer

describe('stream client lifecycle', () => {
  it('opens one socket on start and asks for binary frames', () => {
    const { client, sockets, statuses } = harness()
    client.start()
    assert.equal(sockets.length, 1)
    assert.equal(sockets[0].binaryType, 'arraybuffer')
    assert.equal(statuses.at(-1)?.phase, 'connecting')
  })

  it('hands binary messages to onData and reports live', () => {
    const { client, sockets, data, statuses } = harness()
    client.start()
    sockets[0].message(binary())
    assert.equal(data.length, 1)
    assert.equal(statuses.at(-1)?.phase, 'live')
    assert.equal(statuses.at(-1)?.lastDataAt, 1_000)
  })

  it('answers a server ping with a pong carrying the same number', () => {
    const { client, sockets } = harness()
    client.start()
    sockets[0].message('{"ping":1795844223633}')
    assert.deepEqual(sockets[0].sent, ['{"pong":1795844223633}'])
  })

  it('ignores a non-ping text frame and unparseable text', () => {
    const { client, sockets, data } = harness()
    client.start()
    sockets[0].message('{"other":1}')
    sockets[0].message('not json')
    assert.deepEqual(sockets[0].sent, [])
    assert.equal(data.length, 0)
  })

  it('turns stale when data stops, without dropping the socket', () => {
    const { client, sockets, statuses, scheduler } = harness()
    client.start()
    sockets[0].message(binary())
    scheduler.advance(5_900)
    assert.equal(statuses.at(-1)?.phase, 'live')
    scheduler.advance(1_000)
    assert.equal(statuses.at(-1)?.phase, 'stale')
    assert.equal(sockets.length, 1)
    assert.equal(sockets[0].closed, false)
  })

  it('returns to live when data resumes after a stale period', () => {
    const { client, sockets, statuses, scheduler } = harness()
    client.start()
    sockets[0].message(binary())
    scheduler.advance(7_000)
    assert.equal(statuses.at(-1)?.phase, 'stale')
    sockets[0].message(binary())
    assert.equal(statuses.at(-1)?.phase, 'live')
  })

  it('keeps pings from hiding a data stall (pings are not data)', () => {
    const { client, sockets, statuses, scheduler } = harness()
    client.start()
    sockets[0].message(binary())
    for (let i = 0; i < 4; i += 1) {
      scheduler.advance(2_000)
      sockets[0].message('{"ping":1}')
    }
    assert.equal(statuses.at(-1)?.phase, 'stale')
    assert.equal(sockets.length, 1)
  })

  it('reconnects with exponential backoff after a socket closes', () => {
    const { client, sockets, statuses, scheduler } = harness()
    client.start()
    sockets[0].message(binary())
    sockets[0].drop(1006)
    assert.equal(statuses.at(-1)?.phase, 'reconnecting')
    assert.equal(statuses.at(-1)?.retryInMs, 500)
    scheduler.advance(499)
    assert.equal(sockets.length, 1)
    scheduler.advance(1)
    assert.equal(sockets.length, 2)
    // Second consecutive failure doubles the wait.
    sockets[1].drop(1006)
    assert.equal(statuses.at(-1)?.retryInMs, 1_000)
  })

  it('reconnects immediately when the application distrusts the book', () => {
    const { client, sockets, statuses, scheduler } = harness()
    client.start()
    sockets[0].message(binary())
    client.reconnect('sequence gap')
    assert.equal(sockets[0].closed, true)
    assert.equal(statuses.at(-1)?.phase, 'reconnecting')
    assert.equal(statuses.at(-1)?.reason, 'sequence gap')
    scheduler.advance(0)
    assert.equal(sockets.length, 2)
  })

  it('forces a reconnect when nothing at all arrives for too long', () => {
    const { client, scheduler, sockets, statuses } = harness()
    client.start()
    sockets[0].message(binary())
    const before = sockets.length
    scheduler.advance(31_000)
    assert.ok(
      statuses.some(
        (status) =>
          status.phase === 'reconnecting' &&
          /no messages/.test(status.reason ?? ''),
      ),
      'the silent watchdog must ask for a reconnect',
    )
    scheduler.advance(2_000)
    assert.ok(sockets.length > before)
  })

  it('recovers from a socket that throws while opening', () => {
    const scheduler = new FakeScheduler()
    const statuses: StreamStatus[] = []
    let attempts = 0
    const client = createStreamClient({
      url: 'wss://example.invalid/x',
      createSocket: () => {
        attempts += 1
        if (attempts === 1) throw new Error('blocked')
        return new FakeSocket('wss://example.invalid/x')
      },
      scheduler,
      now: scheduler.now,
      random: () => 0.5,
      onData: () => {},
      onStatus: (status) => statuses.push({ ...status }),
    })
    client.start()
    assert.equal(statuses.at(-1)?.phase, 'reconnecting')
    assert.match(statuses.at(-1)?.reason ?? '', /could not open socket: blocked/)
    scheduler.advance(1_000)
    assert.equal(attempts, 2)
  })

  it('stop() leaves no timers and no live socket behind', () => {
    const { client, sockets, scheduler, statuses } = harness()
    client.start()
    sockets[0].message(binary())
    client.stop()
    assert.equal(sockets[0].closed, true)
    assert.deepEqual(scheduler.pendingDelays(), [])
    assert.equal(statuses.at(-1)?.phase, 'stopped')
    // A late frame from the dead socket must not resurrect the client.
    sockets[0].onmessage = null
    client.reconnect('ignored while stopped')
    assert.deepEqual(scheduler.pendingDelays(), [])
  })

  it('does not schedule anything after stop even if a close arrives late', () => {
    const { client, sockets, scheduler } = harness()
    client.start()
    const socket = sockets[0]
    client.stop()
    socket.drop(1006)
    assert.deepEqual(scheduler.pendingDelays(), [])
  })
})
