/**
 * Pure price-window maths for the liquidation ladder: the mapping between a
 * price range and screen rows, zoom/pan/re-centre transforms and the axis tick
 * selection. Kept free of DOM access so the interaction contract is testable.
 */

export interface View {
  /** Lowest visible liquidation price. */
  min: number
  /** Highest visible liquidation price. */
  max: number
}

export interface PriceMass {
  price: number
  mass: number
}

/** Hard guard rails: never collapse to a zero span, never run off the venue. */
const MIN_SPAN = 1e-3
const MAX_SPAN = 1e13
const PRICE_FLOOR = 1e-6

export function spanOf(view: View): number {
  return view.max - view.min
}

export function midOf(view: View): number {
  return (view.min + view.max) / 2
}

/** Screen row (CSS px, 0 at `top`) for a price. High prices are at the top. */
export function priceToY(
  view: View,
  top: number,
  bottom: number,
  price: number,
): number {
  const span = spanOf(view)
  if (span <= 0) return top
  return bottom - ((price - view.min) / span) * (bottom - top)
}

/** Inverse of {@link priceToY}. */
export function yToPrice(
  view: View,
  top: number,
  bottom: number,
  y: number,
): number {
  const height = bottom - top
  if (height <= 0) return view.min
  return view.min + ((bottom - y) / height) * spanOf(view)
}

function sanitise(view: View): View {
  let span = Math.min(MAX_SPAN, Math.max(MIN_SPAN, spanOf(view)))
  if (!Number.isFinite(span) || span <= 0) span = MIN_SPAN
  let min = midOf(view) - span / 2
  if (!Number.isFinite(min)) min = PRICE_FLOOR
  // Clamping the floor must not shrink the span the user just zoomed to.
  if (min < PRICE_FLOOR) min = PRICE_FLOOR
  return { min, max: min + span }
}

function clampPrice(price: number): number {
  if (!Number.isFinite(price)) return 0
  return Math.min(MAX_SPAN, Math.max(PRICE_FLOOR, price))
}

/**
 * Zoom around an anchor price (the price under the cursor), keeping that price
 * at the same screen position. `factor < 1` zooms in.
 */
export function zoomView(view: View, anchorPrice: number, factor: number): View {
  if (!Number.isFinite(factor) || factor <= 0) return view
  const anchor = clampPrice(anchorPrice)
  const next: View = {
    min: anchor + (view.min - anchor) * factor,
    max: anchor + (view.max - anchor) * factor,
  }
  if (spanOf(next) < MIN_SPAN) return view
  if (spanOf(next) > MAX_SPAN) return view
  return sanitise(next)
}

/** Shift the window by a price delta (positive moves the window up). */
export function panView(view: View, priceDelta: number): View {
  if (!Number.isFinite(priceDelta)) return view
  return sanitise({ min: view.min + priceDelta, max: view.max + priceDelta })
}

/**
 * Mass-weighted quantile price: the price below which `quantile` of the total
 * liquidity sits. Used to frame the ladder on where size actually is instead
 * of on a handful of far-away outliers (cross-margin levels can sit orders of
 * magnitude away from the market).
 */
export function massQuantile(
  sorted: readonly PriceMass[],
  quantile: number,
): number | null {
  if (sorted.length === 0) return null
  const q = Math.min(1, Math.max(0, quantile))
  let total = 0
  for (const entry of sorted) total += entry.mass
  if (total <= 0) return sorted[0].price
  const target = total * q
  let cumulative = 0
  for (let i = 0; i < sorted.length; i += 1) {
    const entry = sorted[i]
    cumulative += entry.mass
    if (cumulative >= target) {
      const previous = sorted[Math.max(0, i - 1)]
      const before = cumulative - entry.mass
      const within = entry.mass > 0 ? (target - before) / entry.mass : 0
      return previous.price + (entry.price - previous.price) * within
    }
  }
  return sorted[sorted.length - 1].price
}

export interface FitOptions {
  /** Lower quantile of the fitted window (default 0.005). */
  lower?: number
  /** Upper quantile of the fitted window (default 0.995). */
  upper?: number
  /** Fraction of the span added as padding on each side (default 0.06). */
  pad?: number
}

/**
 * Frame the bulk of the liquidity: a mass-quantile window, padded, and widened
 * to a sane minimum so a single concentrated level does not fill the screen.
 */
export function fitView(
  sorted: readonly PriceMass[],
  options: FitOptions = {},
): View | null {
  const { lower = 0.005, upper = 0.995, pad = 0.06 } = options
  if (sorted.length === 0) return null
  const low = massQuantile(sorted, lower) ?? sorted[0].price
  const high = massQuantile(sorted, upper) ?? sorted[sorted.length - 1].price
  let min = Math.min(low, high)
  let max = Math.max(low, high)
  const center = (min + max) / 2
  const span = max - min
  const floorSpan = Math.max(Math.abs(center) * 0.25, 1)
  if (span < floorSpan) {
    min = center - floorSpan / 2
    max = center + floorSpan / 2
  }
  const padding = (max - min) * pad
  return sanitise({ min: min - padding, max: max + padding })
}

/**
 * Sort positions into the `{ price, mass }` shape `fitView` expects.
 *
 * `count` weights every position equally, which frames the ladder on where the
 * population of positions sits; `size` weights it by position size, which lets a
 * handful of cross-margin whales with levels orders of magnitude away from the
 * market decide the whole window.
 */
export function priceMassProfile(
  entries: Iterable<{ price: number; size: number }>,
  weight: 'count' | 'size' = 'count',
): PriceMass[] {
  const sorted: PriceMass[] = []
  for (const entry of entries) {
    if (!Number.isFinite(entry.price) || entry.price <= 0) continue
    sorted.push({
      price: entry.price,
      mass: weight === 'count' ? 1 : Math.abs(entry.size),
    })
  }
  sorted.sort((a, b) => a.price - b.price)
  return sorted
}

function tickStep(span: number, targetCount: number): number {
  const rough = span / Math.max(1, targetCount)
  if (!Number.isFinite(rough) || rough <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const normalised = rough / magnitude
  let step: number
  if (normalised <= 1) step = 1
  else if (normalised <= 2) step = 2
  else if (normalised <= 2.5) step = 2.5
  else if (normalised <= 5) step = 5
  else step = 10
  return step * magnitude
}

/** Price gridlines: round 1/2/2.5/5 x 10^n steps inside the window. */
export function niceTicks(view: View, targetCount = 8): number[] {
  const span = spanOf(view)
  if (!Number.isFinite(span) || span <= 0) return []
  const step = tickStep(span, targetCount)
  const first = Math.ceil(view.min / step) * step
  const ticks: number[] = []
  for (let value = first; value <= view.max; value += step) {
    // Guard against float drift on the last tick.
    ticks.push(Math.round(value / step) * step)
    if (ticks.length > 64) break
  }
  return ticks
}
