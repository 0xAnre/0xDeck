/**
 * Shares identical reads so one page never asks the same question twice.
 *
 * A chart panel re-runs data effects for reasons that do not change the
 * request itself (a notice refresh, a second panel on the same symbol and
 * interval, a remount, a socket handshake). Every one of those used to become
 * a new HTTP request for a payload that was already fetched or already in
 * flight (Issue #238 measured 2x `daily-context` for two panels on one
 * interval, 14x one identical `liquidations/buckets` URL in 60 s and 38
 * `liquidations/history` requests for a single page load).
 *
 * Two rules, no timers:
 *
 * - **In flight:** a second `share` with the same key joins the running
 *   promise instead of starting a second request.
 * - **Settled value:** a resolved value stays reusable for `ttlMs`. `ttlMs: 0`
 *   means "dedupe in flight only", which is what a live edge read needs.
 *
 * Cached values are shared by reference, so callers must treat a response as
 * immutable (the market clients only read and re-merge into new arrays).
 *
 * Pure and dependency-free so `node --experimental-strip-types` can execute
 * `requestCache.test.ts` (`npm run test:ui`).
 */

type CacheEntry = {
  promise: Promise<unknown>
  /** `null` while the request is in flight. */
  settledAt: number | null
  /** Reuse window from `settledAt`, in ms. `0` disables value reuse. */
  ttlMs: number
}

export type RequestCacheOptions = {
  /** Injected clock, so tests never wait wall-clock time. */
  now?: () => number
  /**
   * Upper bound on retained entries. The oldest inserted entry is evicted
   * first; a chart only ever holds a few dozen distinct reads.
   */
  maxEntries?: number
}

export type RequestCache = {
  /**
   * Returns the shared promise for `key`, running `run` only when no fresh
   * value and no in-flight request exists.
   */
  share<T>(key: string, ttlMs: number, run: () => Promise<T>): Promise<T>
  /** Drops every entry (in-flight requests still settle for their callers). */
  clear(): void
  /** Number of retained entries, in flight or settled. */
  size(): number
  /** Number of retained entries still in flight. */
  inFlightCount(): number
}

export function createRequestCache(options: RequestCacheOptions = {}): RequestCache {
  const now = options.now ?? (() => Date.now())
  const maxEntries = Math.max(1, Math.trunc(options.maxEntries ?? 256))
  const entries = new Map<string, CacheEntry>()

  function isReusable(entry: CacheEntry, at: number): boolean {
    if (entry.settledAt === null) return true
    return entry.ttlMs > 0 && at - entry.settledAt < entry.ttlMs
  }

  function prune(at: number): void {
    for (const [key, entry] of entries) {
      if (entry.settledAt !== null && !isReusable(entry, at)) entries.delete(key)
    }
    while (entries.size >= maxEntries) {
      const oldestKey = entries.keys().next().value
      if (oldestKey === undefined) return
      entries.delete(oldestKey)
    }
  }

  return {
    share<T>(key: string, ttlMs: number, run: () => Promise<T>): Promise<T> {
      const at = now()
      const existing = entries.get(key)
      if (existing && isReusable(existing, at)) {
        return existing.promise as Promise<T>
      }
      if (existing) entries.delete(key)

      prune(at)

      const entry: CacheEntry = {
        promise: Promise.resolve() as Promise<unknown>,
        settledAt: null,
        ttlMs: Math.max(0, ttlMs),
      }
      const promise = run()
      entry.promise = promise
      entries.set(key, entry)
      promise.then(
        () => {
          entry.settledAt = now()
        },
        () => {
          // A failed read must never be replayed; the next caller retries.
          if (entries.get(key) === entry) entries.delete(key)
        },
      )
      return promise
    },

    clear(): void {
      entries.clear()
    },

    size(): number {
      return entries.size
    },

    inFlightCount(): number {
      let count = 0
      for (const entry of entries.values()) {
        if (entry.settledAt === null) count += 1
      }
      return count
    },
  }
}
