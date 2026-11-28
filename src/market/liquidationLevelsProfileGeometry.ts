/**
 * Geometry for the live liquidation-level profile.
 *
 * Both sides share one leftward magnitude scale: every bar — red (short) or
 * green (long) — is right-aligned on the candle pane's right edge and extends
 * left with the same pixels-per-unit, so equal size looks equal on either side
 * and a longer bar always means more open size at that price.
 *
 * The profile is a *current* picture of open-position liquidation prices, not a
 * time series: it is drawn at today's prices no matter which old candles the
 * viewport shows. Rows are one CSS pixel tall and only the visible price band
 * is binned, so the work per paint is bounded by the pane height and the
 * positions inside that band.
 *
 * Kept free of canvas and DOM access so the directional/scale contract can be
 * tested directly (see `liquidationLevelsProfileGeometry.test.ts`).
 */
import type { LiquidationLevelPosition } from './liquidationLevelsProtocol.ts'

/** One CSS pixel per row; the pane height decides how many rows exist. */
export const LIQUIDATION_LEVELS_ROW_HEIGHT_CSS = 1

/** Hard ceiling so a pathological pane height cannot allocate an absurd model. */
export const LIQUIDATION_LEVELS_MAX_ROWS = 2000

export interface LiquidationLevelsProfileRow {
  /** Row index counted from the top of the pane. */
  row: number
  /** Highest price covered by the row. */
  priceHigh: number
  /** Lowest price covered by the row. */
  priceLow: number
  /** Absolute open size of long positions at this row. */
  long: number
  /** Absolute open size of short positions at this row. */
  short: number
  /** Positions behind this row. */
  count: number
  /** `long / domain`, so the renderer can size the bar in its own pixels. */
  longFraction: number
  /** `short / domain`. */
  shortFraction: number
}

export interface LiquidationLevelsProfile {
  rowHeight: number
  rowCount: number
  /** Highest row index that carries a bar, or -1 when the profile is empty. */
  topRow: number
  /** Lowest row index that carries a bar, or -1 when the profile is empty. */
  bottomRow: number
  rows: LiquidationLevelsProfileRow[]
  /** Shared scale: the largest single-side row magnitude in view. */
  domain: number
  totalLong: number
  totalShort: number
  visibleCount: number
}

export const EMPTY_LIQUIDATION_LEVELS_PROFILE: LiquidationLevelsProfile = {
  rowHeight: LIQUIDATION_LEVELS_ROW_HEIGHT_CSS,
  rowCount: 0,
  topRow: -1,
  bottomRow: -1,
  rows: [],
  domain: 0,
  totalLong: 0,
  totalShort: 0,
  visibleCount: 0,
}

export interface BuildLiquidationLevelsProfileParams {
  /** Positions already restricted to the visible price band (ascending price). */
  positions: Iterable<LiquidationLevelPosition>
  /** Price at the top edge of the pane. */
  topPrice: number
  /** Price at the bottom edge of the pane. */
  bottomPrice: number
  /** Pane height in CSS pixels. */
  paneHeight: number
  rowHeight?: number
}

export function buildLiquidationLevelsProfile(
  params: BuildLiquidationLevelsProfileParams,
): LiquidationLevelsProfile {
  const { positions, paneHeight } = params
  const rowHeight =
    params.rowHeight && params.rowHeight > 0
      ? params.rowHeight
      : LIQUIDATION_LEVELS_ROW_HEIGHT_CSS
  const high = Math.max(params.topPrice, params.bottomPrice)
  const low = Math.min(params.topPrice, params.bottomPrice)
  if (
    !Number.isFinite(high) ||
    !Number.isFinite(low) ||
    !Number.isFinite(paneHeight) ||
    paneHeight <= 0 ||
    high <= low
  ) {
    return EMPTY_LIQUIDATION_LEVELS_PROFILE
  }

  const rowCount = Math.max(
    1,
    Math.min(LIQUIDATION_LEVELS_MAX_ROWS, Math.ceil(paneHeight / rowHeight)),
  )
  const span = high - low

  const buckets: Array<{ long: number; short: number; count: number }> = []
  let domain = 0
  let totalLong = 0
  let totalShort = 0
  let visibleCount = 0
  let topRow = -1
  let bottomRow = -1

  for (const position of positions) {
    if (!Number.isFinite(position.price) || !Number.isFinite(position.size)) continue
    if (position.price < low || position.price > high) continue
    if (position.size === 0) continue
    const row = resolveLiquidationLevelsRow(position.price, high, span, rowCount)
    let bucket = buckets[row]
    if (!bucket) {
      bucket = { long: 0, short: 0, count: 0 }
      buckets[row] = bucket
    }
    const magnitude = Math.abs(position.size)
    if (position.size > 0) {
      bucket.long += magnitude
      totalLong += magnitude
    } else {
      bucket.short += magnitude
      totalShort += magnitude
    }
    bucket.count += 1
    visibleCount += 1
    if (bucket.long > domain) domain = bucket.long
    if (bucket.short > domain) domain = bucket.short
    if (topRow === -1 || row < topRow) topRow = row
    if (row > bottomRow) bottomRow = row
  }

  const rows: LiquidationLevelsProfileRow[] = []
  for (let row = 0; row < buckets.length; row += 1) {
    const bucket = buckets[row]
    if (!bucket) continue
    const priceHigh = priceAtRow(row, high, span, rowCount)
    const priceLow = priceAtRow(row + 1, high, span, rowCount)
    rows.push({
      row,
      priceHigh,
      priceLow,
      long: bucket.long,
      short: bucket.short,
      count: bucket.count,
      longFraction: domain > 0 ? bucket.long / domain : 0,
      shortFraction: domain > 0 ? bucket.short / domain : 0,
    })
  }

  return {
    rowHeight,
    rowCount,
    topRow,
    bottomRow,
    rows,
    domain,
    totalLong,
    totalShort,
    visibleCount,
  }
}

function resolveLiquidationLevelsRow(
  price: number,
  high: number,
  span: number,
  rowCount: number,
): number {
  if (span <= 0) return 0
  const fraction = (high - price) / span
  const row = Math.floor(fraction * rowCount)
  return Math.min(rowCount - 1, Math.max(0, row))
}

function priceAtRow(
  row: number,
  high: number,
  span: number,
  rowCount: number,
): number {
  if (span <= 0 || rowCount <= 0) return high
  return high - (row / rowCount) * span
}

/** Price band covered by one drawn row. */
export function liquidationLevelsRowPriceBand(
  profile: LiquidationLevelsProfile,
  topPrice: number,
  bottomPrice: number,
  row: number,
): { min: number; max: number } {
  const high = Math.max(topPrice, bottomPrice)
  const low = Math.min(topPrice, bottomPrice)
  const span = high - low
  const priceHigh = priceAtRow(row, high, span, profile.rowCount)
  const priceLow = priceAtRow(row + 1, high, span, profile.rowCount)
  return { min: Math.min(priceHigh, priceLow), max: Math.max(priceHigh, priceLow) }
}

export interface LiquidationLevelsHitParams {
  profile: LiquidationLevelsProfile
  /** Pointer x in pane CSS pixels from the pane's left edge. */
  x: number
  /** Pointer y in pane CSS pixels from the pane's top edge. */
  y: number
  /** Plot width in CSS pixels (pane width minus the price scale). */
  plotWidth: number
  /** Profile bar extent, in percent of the plot width. */
  maxWidthPercent: number
}

/**
 * Row under the pointer when it is on a drawn bar. Bars are anchored to the
 * right edge of the plot, so pointing at candles on the left never resolves the
 * profile.
 */
export function hitTestLiquidationLevelsProfile(
  params: LiquidationLevelsHitParams,
): LiquidationLevelsProfileRow | null {
  const { profile, x, y, plotWidth, maxWidthPercent } = params
  if (profile.rows.length === 0) return null
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  if (!Number.isFinite(plotWidth) || plotWidth <= 0) return null
  if (y < 0) return null
  const row = Math.floor(y / profile.rowHeight)
  if (row < 0 || row >= profile.rowCount) return null
  const target = profile.rows.find((item) => item.row === row)
  if (!target) return null
  const maxBarWidth = liquidationLevelsMaxBarWidthPx(plotWidth, maxWidthPercent)
  const widestFraction = Math.max(target.longFraction, target.shortFraction)
  const barWidth = widestFraction * maxBarWidth
  const anchor = plotWidth
  return x <= anchor && x >= anchor - barWidth ? target : null
}

/** Bar extent in CSS pixels for one profile setting and plot width. */
export function liquidationLevelsMaxBarWidthPx(
  plotWidth: number,
  maxWidthPercent: number,
): number {
  if (!Number.isFinite(plotWidth) || plotWidth <= 0) return 0
  const percent = Number.isFinite(maxWidthPercent) ? maxWidthPercent : 0
  const clamped = Math.min(100, Math.max(1, percent))
  return (plotWidth * clamped) / 100
}
