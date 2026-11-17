/**
 * Ref-counted stream subscriptions: one connection per channel, shared by every
 * consumer, for exactly as long as someone needs it.
 *
 * Issue #238 measured two chart panels on the same symbol+interval opening two
 * `kline` sockets and two `liquidations` sockets, plus a third duplicate for
 * every remount. A panel is not a connection: the channel name already is the
 * subscription identity, so the same channel must not be dialed twice.
 *
 * The registry owns only the sharing rules. Socket behaviour, reconnect
 * backoff and message parsing stay in the client it is given, which keeps this
 * module pure and testable without a browser (`node --experimental-strip-types`,
 * see `streamSubscriptionRegistry.test.ts`).
 */

export type SharedStreamHandlers<Message, State> = {
  onMessage: (message: Message) => void
  onStateChange?: (state: State) => void
  onError?: (error: Error) => void
}

export type SharedStreamClient<State> = {
  connect(): void
  disconnect(): void
  getConnectionState(): State
}

export type SharedStreamHubOptions<Message, State> = {
  /** Builds the one client a channel owns. Handlers are re-broadcast by the hub. */
  createClient: (
    channel: string,
    handlers: SharedStreamHandlers<Message, State>,
  ) => SharedStreamClient<State>
}

export type SharedStreamHub<Message, State> = {
  /**
   * Joins the channel (opening it when it is the first subscriber) and returns
   * the matching unsubscribe. Calling the returned function twice is a no-op.
   */
  subscribe: (channel: string, handlers: SharedStreamHandlers<Message, State>) => () => void
  /** Live subscribers on one channel. */
  subscriberCount: (channel: string) => number
  /** Open connections; one per channel that currently has subscribers. */
  openConnectionCount: () => number
}

type ChannelGroup<Message, State> = {
  client: SharedStreamClient<State>
  subscribers: Set<SharedStreamHandlers<Message, State>>
  state: State
}

export function createSharedStreamHub<Message, State>(
  options: SharedStreamHubOptions<Message, State>,
): SharedStreamHub<Message, State> {
  const groups = new Map<string, ChannelGroup<Message, State>>()

  function broadcast(group: ChannelGroup<Message, State>, message: Message): void {
    for (const subscriber of [...group.subscribers]) subscriber.onMessage(message)
  }

  function broadcastState(group: ChannelGroup<Message, State>, state: State): void {
    group.state = state
    for (const subscriber of [...group.subscribers]) {
      subscriber.onStateChange?.(state)
    }
  }

  function broadcastError(group: ChannelGroup<Message, State>, error: Error): void {
    for (const subscriber of [...group.subscribers]) subscriber.onError?.(error)
  }

  return {
    subscribe(channel, handlers) {
      let group = groups.get(channel)

      if (!group) {
        const created: ChannelGroup<Message, State> = {
          client: null as unknown as SharedStreamClient<State>,
          subscribers: new Set(),
          state: null as unknown as State,
        }
        created.client = options.createClient(channel, {
          onMessage: (message) => broadcast(created, message),
          onStateChange: (state) => broadcastState(created, state),
          onError: (error) => broadcastError(created, error),
        })
        created.state = created.client.getConnectionState()
        group = created
        groups.set(channel, group)
        group.subscribers.add(handlers)
        group.client.connect()
      } else {
        group.subscribers.add(handlers)
        // A second consumer of an already-open channel must see the state it
        // joined, otherwise its status label stays "connecting" forever.
        handlers.onStateChange?.(group.state)
      }

      const joined = group
      let active = true
      return () => {
        if (!active) return
        active = false
        joined.subscribers.delete(handlers)
        if (joined.subscribers.size > 0) return
        groups.delete(channel)
        joined.client.disconnect()
      }
    },

    subscriberCount(channel) {
      return groups.get(channel)?.subscribers.size ?? 0
    },

    openConnectionCount() {
      return groups.size
    },
  }
}
