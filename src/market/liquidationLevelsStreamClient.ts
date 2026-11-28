/**
 * WebSocket lifecycle for the MarketLens L4 liquidations channel.
 *
 * Responsibilities kept here (and tested without a network):
 *  - connect, answer the server's text pings with the same number as a pong,
 *  - hand every binary message to `onData` as an ArrayBuffer,
 *  - report a live/stale/reconnecting state from real message activity,
 *  - reconnect with exponential backoff after a network failure, and
 *    immediately when the application asks for it (epoch change, seq gap),
 *  - tear everything down without leaving timers or sockets behind.
 *
 * Decoding and book state live outside: the caller applies each file and calls
 * `reconnect()` when the protocol says the book can no longer be trusted.
 *
 * Provenance: PR #279 (`experiments/liquidations-l4/src/client.ts` at
 * 25b6b4dbe6f913a3f8b794e77770ea4035a5b8b6), reused as an application module.
 */

export type LiquidationLevelsStreamPhase =
  | 'idle'
  | 'connecting'
  | 'live'
  | 'stale'
  | 'reconnecting'
  | 'stopped'

export interface LiquidationLevelsStreamStatus {
  phase: LiquidationLevelsStreamPhase
  /** Consecutive connection attempts (1 = first). */
  attempt: number
  /** Why the client is reconnecting, if it is. */
  reason: string | null
  /** Delay before the next attempt while reconnecting. */
  retryInMs: number | null
  /** Timestamp of the last binary (data) message. */
  lastDataAt: number | null
  /** Timestamp of the last frame of any kind, including pings. */
  lastFrameAt: number | null
}

/** Minimal structural socket, so tests can drive a fake one. */
export interface LiquidationLevelsSocketLike {
  binaryType: string
  onopen: (() => void) | null
  onmessage: ((event: { data: unknown }) => void) | null
  onclose: ((event: { code?: number; reason?: string }) => void) | null
  onerror: ((event: unknown) => void) | null
  send(data: string): void
  close(): void
}

export interface LiquidationLevelsScheduler {
  schedule(fn: () => void, delayMs: number): number
  cancel(id: number): void
}

export const liquidationLevelsDefaultScheduler: LiquidationLevelsScheduler = {
  schedule: (fn, delayMs) =>
    globalThis.setTimeout(fn, delayMs) as unknown as number,
  cancel: (id) => globalThis.clearTimeout(id),
}

export interface LiquidationLevelsStreamClientOptions {
  url: string
  onData: (buffer: ArrayBuffer) => void
  onStatus: (status: LiquidationLevelsStreamStatus) => void
  createSocket?: (url: string) => LiquidationLevelsSocketLike
  scheduler?: LiquidationLevelsScheduler
  now?: () => number
  random?: () => number
  /** No new data for this long switches the status to `stale`. */
  staleAfterMs?: number
  /** No frame at all (not even a ping) for this long forces a reconnect. */
  deadAfterMs?: number
  backoffBaseMs?: number
  backoffMaxMs?: number
}

export interface LiquidationLevelsStreamClient {
  start(): void
  stop(reason?: string): void
  /** Drop the socket and reconnect at once (book cannot be trusted any more). */
  reconnect(reason: string): void
  status(): LiquidationLevelsStreamStatus
}

const DEFAULT_STALE_MS = 6_000
const DEFAULT_DEAD_MS = 30_000
const WATCHDOG_MS = 500

export function createLiquidationLevelsStreamClient(
  options: LiquidationLevelsStreamClientOptions,
): LiquidationLevelsStreamClient {
  const {
    url,
    onData,
    onStatus,
    createSocket = (target: string) =>
      new WebSocket(target) as unknown as LiquidationLevelsSocketLike,
    scheduler = liquidationLevelsDefaultScheduler,
    now = () => Date.now(),
    random = () => Math.random(),
    staleAfterMs = DEFAULT_STALE_MS,
    deadAfterMs = DEFAULT_DEAD_MS,
    backoffBaseMs = 500,
    backoffMaxMs = 15_000,
  } = options

  let status: LiquidationLevelsStreamStatus = {
    phase: 'idle',
    attempt: 0,
    reason: null,
    retryInMs: null,
    lastDataAt: null,
    lastFrameAt: null,
  }
  let socket: LiquidationLevelsSocketLike | null = null
  let started = false
  let stopped = false
  let watchdogId: number | null = null
  let retryId: number | null = null
  let stale = false
  let socketGeneration = 0

  function emit(patch: Partial<LiquidationLevelsStreamStatus>): void {
    status = { ...status, ...patch }
    onStatus(status)
  }

  function clearRetry(): void {
    if (retryId !== null) {
      scheduler.cancel(retryId)
      retryId = null
    }
  }

  function clearWatchdog(): void {
    if (watchdogId !== null) {
      scheduler.cancel(watchdogId)
      watchdogId = null
    }
  }

  function closeSocket(): void {
    socketGeneration += 1
    const current = socket
    socket = null
    if (current) {
      current.onopen = null
      current.onmessage = null
      current.onclose = null
      current.onerror = null
      try {
        current.close()
      } catch {
        // A socket already closing is not an error worth surfacing.
      }
    }
  }

  function scheduleReconnect(reason: string, delayMs: number): void {
    if (stopped) return
    clearRetry()
    const attempt = status.attempt + 1
    emit({
      phase: 'reconnecting',
      attempt,
      reason,
      retryInMs: delayMs,
      lastDataAt: status.lastDataAt,
    })
    retryId = scheduler.schedule(() => {
      retryId = null
      connect()
    }, delayMs)
  }

  function backoffDelay(attempt: number): number {
    const exponential = Math.min(
      backoffMaxMs,
      backoffBaseMs * 2 ** Math.max(0, attempt - 1),
    )
    const jitter = 0.8 + 0.4 * Math.min(1, Math.max(0, random()))
    return Math.round(exponential * jitter)
  }

  function connect(): void {
    if (stopped) return
    clearRetry()
    closeSocket()
    const generation = socketGeneration
    const previous = status
    emit({
      phase: 'connecting',
      attempt: Math.max(1, previous.attempt),
      reason: previous.phase === 'reconnecting' ? previous.reason : null,
      retryInMs: null,
      lastDataAt: previous.lastDataAt,
      lastFrameAt: previous.lastFrameAt,
    })

    let current: LiquidationLevelsSocketLike
    try {
      current = createSocket(url)
    } catch (error) {
      scheduleReconnect(
        `could not open socket: ${describe(error)}`,
        backoffDelay(status.attempt || 1),
      )
      return
    }
    socket = current
    current.binaryType = 'arraybuffer'

    current.onopen = () => {
      if (generation !== socketGeneration || stopped) return
      emit({ phase: 'connecting', reason: null, retryInMs: null })
    }

    current.onmessage = (event) => {
      if (generation !== socketGeneration || stopped) return
      status.lastFrameAt = now()
      const data = event.data
      if (typeof data === 'string') {
        handleText(data, current)
        return
      }
      if (data instanceof ArrayBuffer) {
        handleBinary(data)
        return
      }
      if (typeof Blob !== 'undefined' && data instanceof Blob) {
        void data.arrayBuffer().then((buffer) => {
          if (generation !== socketGeneration || stopped) return
          handleBinary(buffer)
        })
        return
      }
      // Unknown frame shape: count the activity, ignore the payload.
      onStatus(status)
    }

    current.onclose = (event) => {
      if (generation !== socketGeneration || stopped) return
      socket = null
      const detail =
        event?.code !== undefined
          ? `socket closed (${event.code}${event.reason ? ` ${event.reason}` : ''})`
          : 'socket closed'
      scheduleReconnect(detail, backoffDelay(status.attempt))
    }

    current.onerror = () => {
      if (generation !== socketGeneration || stopped) return
      socket = null
      socketGeneration += 1
      scheduleReconnect('socket error', backoffDelay(status.attempt))
    }
  }

  function handleText(raw: string, current: LiquidationLevelsSocketLike): void {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      onStatus(status)
      return
    }
    if (
      parsed &&
      typeof parsed === 'object' &&
      'ping' in parsed &&
      typeof (parsed as { ping: unknown }).ping === 'number'
    ) {
      const value = (parsed as { ping: number }).ping
      try {
        current.send(JSON.stringify({ pong: value }))
      } catch {
        // A failed pong write shows up as a closed socket; nothing else to do.
      }
    }
    onStatus(status)
  }

  function handleBinary(buffer: ArrayBuffer): void {
    const at = now()
    stale = false
    emit({
      phase: 'live',
      attempt: 1,
      lastDataAt: at,
      lastFrameAt: at,
      reason: null,
      retryInMs: null,
    })
    onData(buffer)
  }

  function tick(): void {
    watchdogId = null
    if (stopped) return
    const current = now()
    const lastFrame = status.lastFrameAt
    const lastData = status.lastDataAt

    if (lastFrame !== null && current - lastFrame > deadAfterMs) {
      closeSocket()
      scheduleReconnect('no messages from the stream', backoffDelay(status.attempt))
      return
    }
    if (
      status.phase === 'live' &&
      !stale &&
      lastData !== null &&
      current - lastData > staleAfterMs
    ) {
      stale = true
      emit({ phase: 'stale', reason: 'no new data' })
    }
    watchdogId = scheduler.schedule(tick, WATCHDOG_MS)
  }

  return {
    start() {
      if (started && !stopped) return
      started = true
      stopped = false
      status = {
        phase: 'idle',
        attempt: 0,
        reason: null,
        retryInMs: null,
        lastDataAt: null,
        lastFrameAt: null,
      }
      clearWatchdog()
      watchdogId = scheduler.schedule(tick, WATCHDOG_MS)
      connect()
    },
    stop(reason = 'stopped') {
      stopped = true
      started = false
      clearRetry()
      clearWatchdog()
      closeSocket()
      emit({ phase: 'stopped', reason, retryInMs: null })
    },
    reconnect(reason: string) {
      if (stopped) return
      clearRetry()
      closeSocket()
      scheduleReconnect(reason, 0)
    },
    status() {
      return status
    },
  }
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'unknown error'
}
