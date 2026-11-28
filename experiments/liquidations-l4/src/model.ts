/**
 * Aggregate the position book into the per-screen-row profile the ladder draws.
 *
 * Hundreds of positions can share the same liquidation price, and a single row
 * of pixels can hold dozens of them. Binning by screen row keeps the paint cost
 * bounded by the viewport instead of by the book (which is ~33k positions on
 * BTC), while the raw positions stay available for hover details.
 */
import type { Position } from './protocol.ts'
import { priceToY, spanOf, type View } from './view.ts'

export interface ProfileOptions {
  view: View
  /** Plot top in CSS px. */
  top: number
  /** Plot bottom in CSS px. */
  bottom: number
  /** Row height in CSS px (1 = one bar per pixel row). */
  rowHeight?: number
}

export interface Profile {
  view: View
  top: number
  bottom: number
  rowHeight: number
  rowCount: number
  /** Absolute position size per row, split by side. */
  long: Float64Array
  short: Float64Array
  /** Number of positions behind each row. */
  count: Uint32Array
  maxLong: number
  maxShort: number
  maxMagnitude: number
  totalLong: number
  totalShort: number
  visibleCount: number
}

export function buildProfile(
  positions: Iterable<Position>,
  options: ProfileOptions,
): Profile {
  const { view, top, bottom } = options
  const rowHeight =
    options.rowHeight && options.rowHeight > 0 ? options.rowHeight : 1
  const height = Math.max(1, bottom - top)
  const rowCount = Math.max(1, Math.ceil(height / rowHeight))
  const long = new Float64Array(rowCount)
  const short = new Float64Array(rowCount)
  const count = new Uint32Array(rowCount)

  let maxLong = 0
  let maxShort = 0
  let totalLong = 0
  let totalShort = 0
  let visibleCount = 0

  for (const position of positions) {
    if (!Number.isFinite(position.price) || !Number.isFinite(position.size)) {
      continue
    }
    if (position.price < view.min || position.price > view.max) continue
    const y = priceToY(view, top, bottom, position.price)
    const row = Math.min(
      rowCount - 1,
      Math.max(0, Math.floor((y - top) / rowHeight)),
    )
    const magnitude = Math.abs(position.size)
    if (position.size >= 0) {
      long[row] += magnitude
      totalLong += magnitude
      if (long[row] > maxLong) maxLong = long[row]
    } else {
      short[row] += magnitude
      totalShort += magnitude
      if (short[row] > maxShort) maxShort = short[row]
    }
    count[row] += 1
    visibleCount += 1
  }

  return {
    view,
    top,
    bottom,
    rowHeight,
    rowCount,
    long,
    short,
    count,
    maxLong,
    maxShort,
    maxMagnitude: Math.max(maxLong, maxShort),
    totalLong,
    totalShort,
    visibleCount,
  }
}

/** Price band covered by one drawn row. */
export function rowPriceBand(
  profile: Profile,
  row: number,
): { min: number; max: number } {
  const height = Math.max(1, profile.bottom - profile.top)
  const span = spanOf(profile.view)
  const priceAt = (y: number) =>
    profile.view.min + ((profile.bottom - y) / height) * span
  const yTop = profile.top + row * profile.rowHeight
  const yBottom = yTop + profile.rowHeight
  const first = priceAt(yTop)
  const second = priceAt(yBottom)
  return {
    min: Math.min(first, second),
    max: Math.max(first, second),
  }
}

/**
 * Positions behind one drawn row, biggest first, for the hover readout.
 * A row covers a small price band, so more than one position can be shown.
 */
export function positionsAtRow(
  positions: Iterable<Position>,
  profile: Profile,
  row: number,
  limit = 8,
): Position[] {
  if (row < 0 || row >= profile.rowCount) return []
  const band = rowPriceBand(profile, row)
  const found: Position[] = []
  for (const position of positions) {
    if (position.price < band.min || position.price > band.max) continue
    found.push(position)
  }
  found.sort((a, b) => Math.abs(b.size) - Math.abs(a.size))
  return found.slice(0, limit)
}
