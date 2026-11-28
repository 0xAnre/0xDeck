/**
 * Display formatting for the liquidation ladder. Prices are USD, sizes are BTC
 * (Hyperliquid BTC perp: 1 price decimal, 5 size decimals), and quantities use
 * the compact K/M/B style the reference view uses on its magnitude axis.
 */

const priceFormat = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
})
const priceFormatZero = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})
const countFormat = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
})

/** Axis label: whole dollars unless the window is tight enough to need one decimal. */
export function formatPriceAxis(price: number, span: number): string {
  if (!Number.isFinite(price)) return '—'
  const useDecimals = span > 0 && span < 40
  return useDecimals ? priceFormat.format(price) : priceFormatZero.format(price)
}

/** Exact-enough price for a tooltip or a footer readout. */
export function formatPrice(price: number): string {
  if (!Number.isFinite(price)) return '—'
  return priceFormat.format(price)
}

/** Magnitude-axis label: 0, 850, 12.4K, 1.5M, 2.1B. */
export function formatQuantity(value: number): string {
  if (!Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  if (abs === 0) return '0'
  if (abs >= 1e9) return `${trim(value / 1e9)}B`
  if (abs >= 1e6) return `${trim(value / 1e6)}M`
  if (abs >= 1e3) return `${trim(value / 1e3)}K`
  if (abs >= 10) return trim(value)
  return trim(value, 2)
}

function trim(value: number, decimals = 1): string {
  const fixed = value.toFixed(decimals)
  return fixed.replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1')
}

/** Signed position size, five decimals like the venue's lot size. */
export function formatSize(size: number): string {
  if (!Number.isFinite(size)) return '—'
  const sign = size > 0 ? '+' : size < 0 ? '−' : ''
  return `${sign}${Math.abs(size).toFixed(5)}`
}

/** USD notional of one position. */
export function formatNotional(price: number, size: number): string {
  const notional = price * Math.abs(size)
  if (!Number.isFinite(notional)) return '—'
  return `$${formatQuantity(notional)}`
}

export function formatCount(value: number): string {
  return countFormat.format(value)
}

/** Short account label for dense tooltips: 0x1234…abcd. */
export function shortAddress(address: string): string {
  if (address.length <= 14) return address
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

/** Human age of a timestamp in ms: 0.4s, 12s, 1m 04s, 1h 02m. */
export function formatAge(ageMs: number): string {
  if (!Number.isFinite(ageMs) || ageMs < 0) return '—'
  if (ageMs < 1_000) return `${(ageMs / 1_000).toFixed(1)}s`
  if (ageMs < 60_000) return `${Math.floor(ageMs / 1_000)}s`
  const minutes = Math.floor(ageMs / 60_000)
  if (minutes < 60) {
    const seconds = Math.floor((ageMs % 60_000) / 1_000)
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`
  }
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return `${hours}h ${String(rest).padStart(2, '0')}m`
}

/** Wall-clock time of the file head, in the viewer's timezone. */
export function formatClock(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return '—'
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}
