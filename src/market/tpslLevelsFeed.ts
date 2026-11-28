/**
 * Shared, ref-counted live feed for the stop-loss and take-profit profiles.
 *
 * One MarketLens `tpsl` socket carries **both** channels (`take_profits`,
 * `stop_losses`), each with its own snapshot, epoch and delta sequence. The feed
 * therefore reduces two independent books on one connection:
 *
 *  - the first subscriber (a panel with either trigger-order indicator enabled)
 *    opens the socket; enabling both indicators on the same panel or across
 *    panels still opens exactly one connection;
 *  - a file is applied only to its own channel's book, and a gap/epoch/protocol
 *    reset clears **only that channel** before the socket reconnects; the other
 *    channel keeps serving until its own fresh snapshot arrives;
 *  - disabling one indicator never affects the sibling: the feed stays open
 *    while any consumer remains, and the last one closes it;
 *  - binary files are decoded strictly in arrival order through one promise
 *    chain, and a stopped feed invalidates in-flight decodes by generation, so
 *    no old async work can resurrect a disposed panel;
 *  - data listeners fire once per applied file per channel (never per order),
 *    so React state does not update per order.
 *
 * The liquidation feed stays a separate module on its own endpoint.
 */
import { createLiquidationLevelsIndex, type LiquidationLevelsIndex } from './liquidationLevelsIndex.ts'
import { decodeTpslFile, TpslDecodeError } from './liquidationLevelsDecode.ts'
import {
  applyTpslFile,
  TPSL_CHANNELS,
  TPSL_STREAM_URL,
  type LiquidationLevelPosition,
  type TpslBook,
  type TpslChannel,
  type TpslOrder,
} from './liquidationLevelsProtocol.ts'
import {
  createLiquidationLevelsStreamClient,
  type LiquidationLevelsStreamClient,
  type LiquidationLevelsStreamPhase,
  type LiquidationLevelsStreamStatus,
} from './liquidationLevelsStreamClient.ts'

export interface TpslChannelState {
  epoch: string | null
  seq: number | null
  headTs: number | null
  /** Orders in the channel's current book (priced or not). */
  orderCount: number
  /** Wall-clock time this channel's last file was applied. */
  lastAppliedAt: number | null
  /** Wall-clock time this channel last received a file (even a duplicate). */
  lastFileAt: number | null
  /**
   * The channel has applied a snapshot (or a delta after one). A `live` socket
   * says nothing about this: the other channel's frames do not make this book
   * ready, and an empty snapshot still counts as applied/ready.
   */
  ready: boolean
  /** The channel's book was cleared and a fresh snapshot is required. */
  resyncing: boolean
  /** Last decode/apply failure attributed to this channel (cleared on apply). */
  error: string | null
}

export interface TpslFeedStatus {
  phase: LiquidationLevelsStreamPhase
  attempt: number
  reason: string | null
  retryInMs: number | null
  lastFrameAt: number | null
  /** Last failure that could not be attributed to one channel. */
  error: string | null
  channels: Record<TpslChannel, TpslChannelState>
}

export function emptyTpslChannelState(): TpslChannelState {
  return {
    epoch: null,
    seq: null,
    headTs: null,
    orderCount: 0,
    lastAppliedAt: null,
    lastFileAt: null,
    ready: false,
    resyncing: false,
    error: null,
  }
}

export const INITIAL_TPSL_FEED_STATUS: TpslFeedStatus = {
  phase: 'idle',
  attempt: 0,
  reason: null,
  retryInMs: null,
  lastFrameAt: null,
  error: null,
  channels: {
    take_profits: emptyTpslChannelState(),
    stop_losses: emptyTpslChannelState(),
  },
}

export interface TpslLevelsFeed {
  /** One call per applied file of `channel`. */
  subscribeData(channel: TpslChannel, listener: () => void): () => void
  /** Phase and per-channel state changes only (never once per order). */
  subscribeStatus(listener: (status: TpslFeedStatus) => void): () => void
  status(): TpslFeedStatus
  /** Price index over the channel's **position-covered** orders. */
  index(channel: TpslChannel): LiquidationLevelsIndex
  /** Every order of the channel, including uncovered ones (hover detail). */
  orders(channel: TpslChannel): ReadonlyMap<string, TpslOrder>
  revision(channel: TpslChannel): number
  consumerCount(): number
}

export interface TpslLevelsFeedDependencies {
  url?: string
  decode?: typeof decodeTpslFile
  createClient?: (options: {
    url: string
    onData: (buffer: ArrayBuffer) => void
    onStatus: (status: LiquidationLevelsStreamStatus) => void
  }) => LiquidationLevelsStreamClient
  now?: () => number
  maxPendingFiles?: number
}

const DEFAULT_MAX_PENDING_FILES = 24

function emptyIndexes(): Record<TpslChannel, LiquidationLevelsIndex> {
  return {
    take_profits: createLiquidationLevelsIndex(),
    stop_losses: createLiquidationLevelsIndex(),
  }
}

function emptyOrders(): Record<TpslChannel, Map<string, TpslOrder>> {
  return {
    take_profits: new Map(),
    stop_losses: new Map(),
  }
}

export function createTpslLevelsFeed(
  dependencies: TpslLevelsFeedDependencies = {},
): TpslLevelsFeed {
  const {
    url = TPSL_STREAM_URL,
    decode = decodeTpslFile,
    createClient = (options) =>
      createLiquidationLevelsStreamClient({
        url: options.url,
        onData: options.onData,
        onStatus: options.onStatus,
      }),
    now = () => Date.now(),
    maxPendingFiles = DEFAULT_MAX_PENDING_FILES,
  } = dependencies

  const dataListeners: Record<TpslChannel, Set<() => void>> = {
    take_profits: new Set(),
    stop_losses: new Set(),
  }
  const statusListeners = new Set<(status: TpslFeedStatus) => void>()
  const indexes = emptyIndexes()
  const orderMaps = emptyOrders()
  const books: Record<TpslChannel, TpslBook | null> = {
    take_profits: null,
    stop_losses: null,
  }
  const revisions: Record<TpslChannel, number> = { take_profits: 0, stop_losses: 0 }

  let consumers = 0
  let client: LiquidationLevelsStreamClient | null = null
  let status: TpslFeedStatus = cloneStatus(INITIAL_TPSL_FEED_STATUS)
  let publishedStatusKey = statusKeyOf(status)
  let generation = 0
  let decodeChain: Promise<void> = Promise.resolve()
  let pendingFiles = 0

  function cloneStatus(source: TpslFeedStatus): TpslFeedStatus {
    return {
      ...source,
      channels: {
        take_profits: { ...source.channels.take_profits },
        stop_losses: { ...source.channels.stop_losses },
      },
    }
  }

  function statusKeyOf(next: TpslFeedStatus): string {
    const channelKey = (channel: TpslChannel) => {
      const state = next.channels[channel]
      return [
        state.epoch ?? '',
        state.seq ?? '',
        state.orderCount,
        state.ready ? '1' : '0',
        state.resyncing ? '1' : '0',
        state.error ?? '',
      ].join('/')
    }
    return [
      next.phase,
      next.attempt,
      next.reason ?? '',
      next.retryInMs ?? '',
      channelKey('take_profits'),
      channelKey('stop_losses'),
    ].join('|')
  }

  function publishStatus(): void {
    const key = statusKeyOf(status)
    if (key === publishedStatusKey) return
    publishedStatusKey = key
    for (const listener of [...statusListeners]) listener(status)
  }

  function publishData(channel: TpslChannel): void {
    for (const listener of [...dataListeners[channel]]) listener()
  }

  function updateStatus(patch: Partial<TpslFeedStatus>): void {
    status = { ...status, ...patch }
    publishStatus()
  }

  function updateChannel(
    channel: TpslChannel,
    patch: Partial<TpslChannelState>,
  ): void {
    status = {
      ...status,
      channels: {
        ...status.channels,
        [channel]: { ...status.channels[channel], ...patch },
      },
    }
    publishStatus()
  }

  function applyStreamStatus(next: LiquidationLevelsStreamStatus): void {
    updateStatus({
      phase: next.phase,
      attempt: next.attempt,
      reason: next.reason,
      retryInMs: next.retryInMs,
      lastFrameAt: next.lastFrameAt,
    })
  }

  /** Replace the channel's derived price index from its book (on updates). */
  function rebuildIndex(channel: TpslChannel): void {
    const book = books[channel]
    const positions = new Map<string, LiquidationLevelPosition>()
    const orders = new Map<string, TpslOrder>()
    if (book) {
      for (const order of book.orders.values()) {
        orders.set(order.id, order)
        if (order.side === null || order.effectiveSize <= 0) continue
        positions.set(order.id, {
          user: order.id,
          price: order.price,
          size: order.side === 'long' ? order.effectiveSize : -order.effectiveSize,
          ts: order.ts,
        })
      }
    }
    orderMaps[channel] = orders
    indexes[channel].replaceBook({
      epoch: book?.epoch ?? '',
      seq: book?.seq ?? 0,
      headTs: book?.headTs ?? 0,
      positions,
    })
    revisions[channel] += 1
  }

  function handleReset(
    channel: TpslChannel | null,
    detail: string,
  ): void {
    const channels: TpslChannel[] = channel === null ? [...TPSL_CHANNELS] : [channel]
    for (const target of channels) {
      books[target] = null
      indexes[target].applyOutcome({ status: 'reset', reason: 'gap', detail })
      orderMaps[target] = new Map()
      revisions[target] += 1
      updateChannel(target, {
        resyncing: true,
        ready: false,
        orderCount: 0,
        epoch: null,
        seq: null,
        headTs: null,
      })
    }
    updateStatus({ reason: detail })
    for (const target of channels) publishData(target)
    client?.reconnect(detail)
  }

  function queueDecode(buffer: ArrayBuffer, fileGeneration: number): void {
    if (fileGeneration !== generation) return
    if (pendingFiles >= maxPendingFiles) {
      handleReset(null, 'decode backlog exceeded; resyncing both channels')
      return
    }
    pendingFiles += 1
    decodeChain = decodeChain
      .then(async () => {
        if (fileGeneration !== generation) return
        let decoded: Awaited<ReturnType<typeof decode>>
        try {
          decoded = await decode(buffer)
        } catch (error) {
          if (fileGeneration !== generation) return
          const detail = `decode error: ${describeError(error)}`
          const channel =
            error instanceof TpslDecodeError &&
            (error.channel === 'take_profits' || error.channel === 'stop_losses')
              ? error.channel
              : null
          updateStatus(
            channel === null
              ? { reason: detail, error: detail }
              : // A channel-attributed failure belongs to that profile only: the
                // ready sibling keeps its clean notice.
                { reason: detail, error: null },
          )
          if (channel !== null) {
            updateChannel(channel, { error: detail })
          }
          return
        }
        if (fileGeneration !== generation) return
        const channel = decoded.head.channel
        if (channel !== 'take_profits' && channel !== 'stop_losses') {
          // A foreign channel (or a liquidation file on this socket) never
          // touches either trigger-order book.
          updateStatus({ reason: `ignored foreign channel "${channel}"` })
          return
        }
        const appliedAt = now()
        const outcome = applyTpslFile(books[channel], decoded.head, decoded.rows)
        if (outcome.status === 'reset') {
          handleReset(outcome.channel, outcome.detail)
          return
        }
        if (outcome.status === 'duplicate') {
          updateChannel(channel, { lastFileAt: appliedAt })
          return
        }
        books[channel] = outcome.book
        rebuildIndex(channel)
        updateChannel(channel, {
          epoch: outcome.book.epoch,
          seq: outcome.book.seq,
          headTs: outcome.book.headTs,
          orderCount: outcome.book.orders.size,
          lastAppliedAt: appliedAt,
          lastFileAt: appliedAt,
          ready: true,
          resyncing: false,
          error: null,
        })
        if (status.error !== null) updateStatus({ error: null })
        publishData(channel)
      })
      .catch(() => {
        // Keep the decode chain alive; a throwing listener must not stall it.
      })
      .finally(() => {
        pendingFiles = Math.max(0, pendingFiles - 1)
      })
  }

  function start(): void {
    generation += 1
    const startGeneration = generation
    books.take_profits = null
    books.stop_losses = null
    indexes.take_profits.clear()
    indexes.stop_losses.clear()
    orderMaps.take_profits = new Map()
    orderMaps.stop_losses = new Map()
    revisions.take_profits += 1
    revisions.stop_losses += 1
    status = {
      ...cloneStatus(INITIAL_TPSL_FEED_STATUS),
      phase: 'connecting',
      attempt: 1,
    }
    publishedStatusKey = statusKeyOf(status)
    const nextClient = createClient({
      url,
      onData: (buffer) => queueDecode(buffer, startGeneration),
      onStatus: (next) => {
        if (startGeneration !== generation) return
        applyStreamStatus(next)
      },
    })
    client = nextClient
    nextClient.start()
    for (const listener of [...statusListeners]) listener(status)
    for (const channel of TPSL_CHANNELS) publishData(channel)
  }

  function stop(): void {
    generation += 1
    const previous = client
    client = null
    previous?.stop('no consumer')
    books.take_profits = null
    books.stop_losses = null
    indexes.take_profits.clear()
    indexes.stop_losses.clear()
    orderMaps.take_profits = new Map()
    orderMaps.stop_losses = new Map()
    revisions.take_profits += 1
    revisions.stop_losses += 1
    pendingFiles = 0
    decodeChain = Promise.resolve()
    status = { ...cloneStatus(INITIAL_TPSL_FEED_STATUS), phase: 'stopped' }
    publishedStatusKey = statusKeyOf(status)
    for (const listener of [...statusListeners]) listener(status)
    for (const channel of TPSL_CHANNELS) publishData(channel)
  }

  function release(): void {
    consumers = Math.max(0, consumers - 1)
    if (consumers === 0) stop()
  }

  function ensureOpen(): void {
    consumers += 1
    if (consumers === 1) start()
  }

  return {
    subscribeData(channel, listener) {
      dataListeners[channel].add(listener)
      ensureOpen()
      return () => {
        if (!dataListeners[channel].delete(listener)) return
        release()
      }
    },
    subscribeStatus(listener) {
      statusListeners.add(listener)
      ensureOpen()
      listener(status)
      return () => {
        if (!statusListeners.delete(listener)) return
        release()
      }
    },
    status() {
      return status
    },
    index(channel) {
      return indexes[channel]
    },
    orders(channel) {
      return orderMaps[channel]
    },
    revision(channel) {
      return revisions[channel]
    },
    consumerCount() {
      return consumers
    },
  }
}

/** Page-wide TPSL feed shared by the stop-loss and take-profit profiles. */
export const tpslLevelsFeed = createTpslLevelsFeed()

export function tpslFeedHasConsumer(): boolean {
  return tpslLevelsFeed.consumerCount() > 0
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'unknown decode error'
}
