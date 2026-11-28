/**
 * Price index over the live liquidation-price book.
 *
 * The book holds tens of thousands of open positions, so neither the paint path
 * nor hover may walk it. `LiquidationLevelsIndex` keeps the positions in a
 * price-sorted array that is rebuilt lazily, at most once per read after the
 * book changed (snapshot or delta), and answers "which positions are inside
 * this visible price range" with a binary search. The paint path is therefore
 * bounded by the rows it draws and the positions inside the visible price band,
 * not by the whole book and not by loaded candle history.
 *
 * A rebuild is price-domain derived state on stream updates, which the project
 * performance contract explicitly allows; no coordinate or screen position is
 * cached here.
 */
import type {
  LiquidationLevelBook,
  LiquidationLevelPosition,
  LiquidationLevelsApplyOutcome,
} from './liquidationLevelsProtocol.ts'

export interface LiquidationLevelsTotals {
  count: number
  long: number
  short: number
}

export interface LiquidationLevelsIndex {
  /** Positions currently in the book. */
  size(): number
  /** Absolute size per side across the whole book, counted on rebuild. */
  totals(): LiquidationLevelsTotals
  /** Positions inside `[min, max]`, ascending by price. */
  positionsInRange(
    min: number,
    max: number,
  ): readonly LiquidationLevelPosition[]
  /**
   * Lazy iterator over `[min, max]`, ascending by price. The paint path uses
   * this so a wide viewport never materializes the whole visible slice first.
   */
  iterateRange(min: number, max: number): Iterable<LiquidationLevelPosition>
  /** Replace the whole book (snapshot, or the feed going away). */
  replaceBook(book: LiquidationLevelBook | null): void
  /** Apply a reducer outcome; duplicate/reset outcomes change nothing here. */
  applyOutcome(outcome: LiquidationLevelsApplyOutcome | null): void
  /** Monotonic revision of the indexed contents. */
  revision(): number
  clear(): void
}

export function createLiquidationLevelsIndex(): LiquidationLevelsIndex {
  let book: LiquidationLevelBook | null = null
  let sorted: LiquidationLevelPosition[] = []
  let dirty = false
  let totalsCache: LiquidationLevelsTotals = { count: 0, long: 0, short: 0 }
  let revision = 0

  function ensureSorted(): void {
    if (!dirty) return
    dirty = false
    const values = book === null ? [] : [...book.positions.values()]
    values.sort((a, b) => a.price - b.price)
    sorted = values
    let long = 0
    let short = 0
    for (const position of values) {
      if (position.size > 0) long += position.size
      else short -= position.size
    }
    totalsCache = { count: values.length, long, short }
  }

  /** First index whose price is >= `price`. */
  function lowerBound(price: number): number {
    let low = 0
    let high = sorted.length
    while (low < high) {
      const middle = (low + high) >>> 1
      if (sorted[middle].price < price) low = middle + 1
      else high = middle
    }
    return low
  }

  function nextBook(next: LiquidationLevelBook | null): void {
    book = next
    dirty = true
    revision += 1
  }

  return {
    size() {
      return book?.positions.size ?? 0
    },
    totals() {
      ensureSorted()
      return totalsCache
    },
    positionsInRange(min, max) {
      if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) return []
      ensureSorted()
      if (sorted.length === 0) return []
      const start = lowerBound(min)
      if (start >= sorted.length) return []
      let end = start
      while (end < sorted.length && sorted[end].price <= max) end += 1
      return end === start ? [] : sorted.slice(start, end)
    },
    iterateRange(min, max) {
      if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) return []
      ensureSorted()
      if (sorted.length === 0) return []
      const start = lowerBound(min)
      if (start >= sorted.length) return []
      return {
        *[Symbol.iterator]() {
          for (let index = start; index < sorted.length; index += 1) {
            const position = sorted[index]
            if (position.price > max) return
            yield position
          }
        },
      }
    },
    replaceBook(next) {
      nextBook(next)
    },
    applyOutcome(outcome) {
      if (!outcome) return
      if (outcome.status === 'snapshot' || outcome.status === 'delta') {
        nextBook(outcome.book)
        return
      }
      if (outcome.status === 'reset') {
        // The book cannot be trusted any more: the feed reconnects for a fresh
        // snapshot, and a stale profile must never stay on screen meanwhile.
        nextBook(null)
      }
    },
    revision() {
      return revision
    },
    clear() {
      book = null
      sorted = []
      dirty = false
      totalsCache = { count: 0, long: 0, short: 0 }
      revision += 1
    },
  }
}
