import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createSharedStreamHub,
  type SharedStreamClient,
  type SharedStreamHandlers,
} from './streamSubscriptionRegistry.ts'

type Message = { channel: string; payload: string }
type State = 'idle' | 'connecting' | 'open' | 'closed'

class FakeClient implements SharedStreamClient<State> {
  readonly channel: string
  readonly handlers: SharedStreamHandlers<Message, State>
  connects = 0
  disconnects = 0
  private state: State = 'idle'

  constructor(channel: string, handlers: SharedStreamHandlers<Message, State>) {
    this.channel = channel
    this.handlers = handlers
  }

  connect(): void {
    this.connects += 1
    this.state = 'open'
    this.handlers.onStateChange?.('open')
  }

  disconnect(): void {
    this.disconnects += 1
    this.state = 'closed'
    this.handlers.onStateChange?.('closed')
  }

  getConnectionState(): State {
    return this.state
  }

  emit(payload: string): void {
    this.handlers.onMessage({ channel: this.channel, payload })
  }

  fail(message: string): void {
    this.handlers.onError?.(new Error(message))
  }
}

function createHarness() {
  const clients: FakeClient[] = []
  const hub = createSharedStreamHub<Message, State>({
    createClient: (channel, handlers) => {
      const client = new FakeClient(channel, handlers)
      clients.push(client)
      return client
    },
  })
  return { hub, clients }
}

describe('createSharedStreamHub', () => {
  it('opens one connection for every subscriber of the same channel', () => {
    const { hub, clients } = createHarness()
    const statesA: State[] = []
    const statesB: State[] = []

    const offA = hub.subscribe('kline.30m', {
      onMessage: () => {},
      onStateChange: (state) => statesA.push(state),
    })
    const offB = hub.subscribe('kline.30m', {
      onMessage: () => {},
      onStateChange: (state) => statesB.push(state),
    })

    assert.equal(clients.length, 1)
    assert.equal(clients[0].connects, 1)
    assert.equal(hub.subscriberCount('kline.30m'), 2)
    assert.equal(hub.openConnectionCount(), 1)
    // The first subscriber is told by connect(); the second is replayed the state.
    assert.deepEqual(statesA, ['open'])
    assert.deepEqual(statesB, ['open'])

    offA()
    offB()
  })

  it('fans messages, states and errors out to every subscriber', () => {
    const { hub, clients } = createHarness()
    const messages: string[] = []
    const states: State[] = []
    const errors: string[] = []

    const subscriptions = [1, 2, 3].map(() =>
      hub.subscribe('kline.30m', {
        onMessage: (message) => messages.push(message.payload),
        onStateChange: (state) => states.push(state),
        onError: (error) => errors.push(error.message),
      }),
    )

    clients[0].emit('candle')
    clients[0].fail('socket error')

    assert.deepEqual(messages, ['candle', 'candle', 'candle'])
    assert.deepEqual(errors, ['socket error', 'socket error', 'socket error'])
    assert.deepEqual(states, ['open', 'open', 'open'])

    for (const off of subscriptions) off()
  })

  it('keeps the connection while a subscriber remains and closes it with the last', () => {
    const { hub, clients } = createHarness()
    const offA = hub.subscribe('kline.30m', { onMessage: () => {} })
    const offB = hub.subscribe('kline.30m', { onMessage: () => {} })

    offA()
    assert.equal(clients[0].disconnects, 0)
    assert.equal(hub.subscriberCount('kline.30m'), 1)

    offB()
    assert.equal(clients[0].disconnects, 1)
    assert.equal(hub.subscriberCount('kline.30m'), 0)
    assert.equal(hub.openConnectionCount(), 0)

    // A later subscriber dials a fresh connection instead of reusing a closed one.
    const offC = hub.subscribe('kline.30m', { onMessage: () => {} })
    assert.equal(clients.length, 2)
    assert.equal(clients[1].connects, 1)
    offC()
  })

  it('ignores a repeated unsubscribe', () => {
    const { hub, clients } = createHarness()
    const off = hub.subscribe('kline.15m', { onMessage: () => {} })

    off()
    off()

    assert.equal(clients[0].disconnects, 1)
    assert.equal(hub.openConnectionCount(), 0)
  })

  it('keeps one connection per channel', () => {
    const { hub, clients } = createHarness()
    const offA = hub.subscribe('kline.30m', { onMessage: () => {} })
    const offB = hub.subscribe('liquidations', { onMessage: () => {} })

    assert.equal(clients.length, 2)
    assert.equal(hub.openConnectionCount(), 2)

    offA()
    assert.equal(hub.openConnectionCount(), 1)
    assert.equal(clients[0].disconnects, 1)
    assert.equal(clients[1].disconnects, 0)

    offB()
  })
})
