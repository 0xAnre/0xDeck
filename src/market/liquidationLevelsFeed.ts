/**
 * Shared, ref-counted live feed for the liquidation-level profile.
 *
 * One MarketLens socket serves every BTC Perp panel that has the indicator
 * enabled: the first subscriber starts the stream, the last one stops it, and
 * an unmount never interrupts a feed another panel is still drawing.
 *
 * Rules this module owns:
 *  - binary files are decoded strictly in arrival order (one promise chain), so
 *    a delta can never be applied before the snapshot it follows;
 *  - the protocol reducer decides snapshot/delta/duplicate/reset, including a
 *    non-zero snapshot sequence, epoch changes, gaps and removals;
 *  - a reset clears the book immediately and reconnects for a fresh snapshot,
 *    so a stale profile is never left on screen as if it were current;
 *  - a stopped feed discards in-flight decodes by generation, so no old async
 *    work can resurrect data after the last panel was turned off;
 *  - data listeners fire **once per applied file**, never once per position:
 *    React state does not re-render for individual book rows.
 *
 * Provenance: protocol/transport reused from PR #279
 * (`experiments/liquidations-l4`) as application modules; the sharing and
 * ordering rules are new to this feature.
 */
import { createLiquidationLevelsIndex, type LiquidationLevelsIndex } from './liquidationLevelsIndex.ts'
import { decodeLiquidationLevelsFile } from './liquidationLevelsDecode.ts'
import {
  applyLiquidationLevelsFile,
  LIQUIDATION_LEVELS_STREAM_URL,
  type LiquidationLevelBook,
} from './liquidationLevelsProtocol.ts'
import {
  createLiquidationLevelsStreamClient,
  type LiquidationLevelsStreamClient,
  type LiquidationLevelsStreamPhase,
  type LiquidationLevelsStreamStatus,
} from './liquidationLevelsStreamClient.ts'

export interface LiquidationLevelsFeedStatus {
  phase: LiquidationLevelsStreamPhase
  attempt: number
  reason: string | null
  retryInMs: number | null
  lastDataAt: number | null
  lastFrameAt: number | null
  /** Wall-clock time the last file was applied to the book. */
  lastAppliedAt: number | null
  /** Producer time (head `ts`) of the last applied file. */
  headTs: number | null
  epoch: string | null
  seq: number | null
  /** Positions in the current book. */
  positionCount: number
  /** A gap/epoch/protocol reset cleared the book and asked for a resync. */
  resyncing: boolean
  /** Last decode/apply error, if any (cleared by the next applied file). */
  error: string | null
}

export const INITIAL_LIQUIDATION_LEVELS_FEED_STATUS: LiquidationLevelsFeedStatus = {
  phase: 'idle',
  attempt: 0,
  reason: null,
  retryInMs: null,
  lastDataAt: null,
  lastFrameAt: null,
  lastAppliedAt: null,
  headTs: null,
  epoch: null,
  seq: null,
  positionCount: 0,
  resyncing: false,
  error: null,
}

export interface LiquidationLevelsFeed {
  /** Subscribe to applied-file notifications (one call per applied file). */
  subscribeData(listener: () => void): () => void
  /** Subscribe to phase changes only (never once per file). */
  subscribeStatus(listener: (status: LiquidationLevelsFeedStatus) => void): () => void
  status(): LiquidationLevelsFeedStatus
  index(): LiquidationLevelsIndex
  /** Book revision: incremented for every applied file and every reset. */
  revision(): number
  /** Live subscriber count (diagnostics and tests). */
  consumerCount(): number
}

export interface LiquidationLevelsFeedDependencies {
  url?: string
  decode?: typeof decodeLiquidationLevelsFile
  createClient?: (options: {
    url: string
    onData: (buffer: ArrayBuffer) => void
    onStatus: (status: LiquidationLevelsStreamStatus) => void
  }) => LiquidationLevelsStreamClient
  now?: () => number
  /** Queued files before the feed gives up and requests a fresh snapshot. */
  maxPendingFiles?: number
}

const DEFAULT_MAX_PENDING_FILES = 24

export function createLiquidationLevelsFeed(
  dependencies: LiquidationLevelsFeedDependencies = {},
): LiquidationLevelsFeed {
  const {
    url = LIQUIDATION_LEVELS_STREAM_URL,
    decode = decodeLiquidationLevelsFile,
    createClient = (options) =>
      createLiquidationLevelsStreamClient({
        url: options.url,
        onData: options.onData,
        onStatus: options.onStatus,
      }),
    now = () => Date.now(),
    maxPendingFiles = DEFAULT_MAX_PENDING_FILES,
  } = dependencies

  const dataListeners = new Set<() => void>()
  const statusListeners = new Set<(status: LiquidationLevelsFeedStatus) => void>()
  const index = createLiquidationLevelsIndex()

  let consumers = 0
  let client: LiquidationLevelsStreamClient | null = null
  let status: LiquidationLevelsFeedStatus = { ...INITIAL_LIQUIDATION_LEVELS_FEED_STATUS }
  let publishedStatusKey = statusKeyOf(status)
  let book: LiquidationLevelBook | null = null
  let revision = 0
  let generation = 0
  let decodeChain: Promise<void> = Promise.resolve()
  let pendingFiles = 0

  /**
   * Published-state key. Phase/attempt/resync/error drive the notices, and the
   * book size and sequence are the honest "the profile changed" signal — they
   * change per applied file, never per position, so React re-renders stay tied
   * to file boundaries instead of book rows.
   */
  function statusKeyOf(next: LiquidationLevelsFeedStatus): string {
    return `${next.phase}|${next.attempt}|${next.resyncing}|${next.error ?? ''}|${next.positionCount}|${next.seq ?? ''}`
  }

  function publishStatus(): void {
    const key = statusKeyOf(status)
    if (key === publishedStatusKey) return
    publishedStatusKey = key
    for (const listener of [...statusListeners]) listener(status)
  }

  function publishData(): void {
    for (const listener of [...dataListeners]) listener()
  }

  function updateStatus(patch: Partial<LiquidationLevelsFeedStatus>): void {
    status = { ...status, ...patch }
    publishStatus()
  }

  function applyStreamStatus(next: LiquidationLevelsStreamStatus): void {
    updateStatus({
      phase: next.phase,
      attempt: next.attempt,
      reason: next.reason,
      retryInMs: next.retryInMs,
      lastDataAt: next.lastDataAt,
      lastFrameAt: next.lastFrameAt,
    })
  }

  function handleReset(detail: string): void {
    book = null
    index.applyOutcome({ status: 'reset', reason: 'gap', detail })
    revision += 1
    updateStatus({
      resyncing: true,
      positionCount: 0,
      epoch: null,
      seq: null,
      headTs: null,
      reason: detail,
    })
    publishData()
    client?.reconnect(detail)
  }

  function queueDecode(buffer: ArrayBuffer, fileGeneration: number): void {
    if (fileGeneration !== generation) return
    if (pendingFiles >= maxPendingFiles) {
      // The decoder cannot keep up: request a fresh snapshot instead of
      // applying an unbounded backlog (which could also hide a gap).
      handleReset('decode backlog exceeded; resyncing')
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
          updateStatus({ error: describeError(error) })
          return
        }
        if (fileGeneration !== generation) return
        const outcome = applyLiquidationLevelsFile(book, decoded.head, decoded.rows)
        if (outcome.status === 'reset') {
          handleReset(outcome.detail)
          return
        }
        if (outcome.status === 'duplicate') return
        book = outcome.book
        index.applyOutcome(outcome)
        revision += 1
        updateStatus({
          lastAppliedAt: now(),
          headTs: book.headTs,
          epoch: book.epoch,
          seq: book.seq,
          positionCount: book.positions.size,
          resyncing: false,
          error: null,
        })
        publishData()
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
    book = null
    index.clear()
    revision += 1
    status = {
      ...INITIAL_LIQUIDATION_LEVELS_FEED_STATUS,
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
    publishData()
  }

  function stop(): void {
    generation += 1
    const previous = client
    client = null
    previous?.stop('no consumer')
    book = null
    index.clear()
    revision += 1
    pendingFiles = 0
    decodeChain = Promise.resolve()
    status = { ...INITIAL_LIQUIDATION_LEVELS_FEED_STATUS, phase: 'stopped' }
    publishedStatusKey = statusKeyOf(status)
    for (const listener of [...statusListeners]) listener(status)
    publishData()
  }

  function release(): void {
    consumers = Math.max(0, consumers - 1)
    if (consumers === 0) stop()
  }

  return {
    subscribeData(listener) {
      dataListeners.add(listener)
      consumers += 1
      if (consumers === 1) start()
      return () => {
        if (!dataListeners.delete(listener)) return
        release()
      }
    },
    subscribeStatus(listener) {
      statusListeners.add(listener)
      consumers += 1
      if (consumers === 1) start()
      listener(status)
      return () => {
        if (!statusListeners.delete(listener)) return
        release()
      }
    },
    status() {
      return status
    },
    index() {
      return index
    },
    revision() {
      return revision
    },
    consumerCount() {
      return consumers
    },
  }
}

/** Page-wide feed shared by every enabled supported panel. */
export const liquidationLevelsFeed = createLiquidationLevelsFeed()

export function subscribeLiquidationLevelsData(listener: () => void): () => void {
  return liquidationLevelsFeed.subscribeData(listener)
}

export function subscribeLiquidationLevelsStatus(
  listener: (status: LiquidationLevelsFeedStatus) => void,
): () => void {
  return liquidationLevelsFeed.subscribeStatus(listener)
}

export function liquidationLevelsFeedConnectionCount(): number {
  return liquidationLevelsFeed.consumerCount() > 0 ? 1 : 0
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'unknown decode error'
}
