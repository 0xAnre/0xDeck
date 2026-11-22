/**
 * Global BTC Perp candle colors.
 *
 * One rising and one falling color are chosen in the app header's Appearance
 * menu and shared by every BTC Perp panel in every workspace, on both candle
 * exchanges. The user's explicit candle-color request is the narrow exception
 * to the fixed/semantic candle rule: a direction color is presentation only,
 * never a direction meaning, and it still applies the same color to body, wick
 * and (invisible) border for that direction.
 *
 * The record is global, not panel scoped, so it deliberately does not use the
 * `0xdeck-widget-*` namespace. Anything unreadable or invalid falls back to the
 * existing #DBDBDB / #808080 defaults instead of failing the whole preference.
 */
import { normalizeColorPickerHexInput } from '../widgetSettings/colorPickerPalette.ts'
import { BTC_PERPETUAL_CANDLESTICK_COLORS } from './btcPerpetualCandleColors.ts'

export const CANDLE_COLORS_STORAGE_KEY = '0xdeck-candle-colors'

export type CandleColors = {
  /** Candle body, wick and border for rising candles. */
  readonly rising: string
  /** Candle body, wick and border for falling candles. */
  readonly falling: string
}

export const DEFAULT_CANDLE_COLORS: CandleColors = {
  rising: BTC_PERPETUAL_CANDLESTICK_COLORS.upColor,
  falling: BTC_PERPETUAL_CANDLESTICK_COLORS.downColor,
}

/**
 * Defensive read of one persisted record. Each direction falls back on its own,
 * so one hand-edited field never discards the other valid color.
 */
export function sanitizeCandleColors(value: unknown): CandleColors {
  const record =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}
  return {
    rising: normalizeColorPickerHexInput(record.rising) ?? DEFAULT_CANDLE_COLORS.rising,
    falling: normalizeColorPickerHexInput(record.falling) ?? DEFAULT_CANDLE_COLORS.falling,
  }
}

export function candleColorsEqual(left: CandleColors, right: CandleColors): boolean {
  return left.rising === right.rising && left.falling === right.falling
}

/**
 * Candlestick series options for one global color pair.
 *
 * A direction color covers the body, wick and matching border together; there
 * is deliberately no separate wick/border/opacity setting. `borderVisible`
 * keeps its existing `false` value, so choosing a border color never turns the
 * border on.
 */
export function candleCandlestickSeriesOptions(colors: CandleColors) {
  return {
    upColor: colors.rising,
    downColor: colors.falling,
    wickUpColor: colors.rising,
    wickDownColor: colors.falling,
    borderUpColor: colors.rising,
    borderDownColor: colors.falling,
    borderVisible: false,
  } as const
}

function candleColorStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function loadCandleColors(): CandleColors {
  try {
    const raw = candleColorStorage()?.getItem(CANDLE_COLORS_STORAGE_KEY) ?? null
    if (raw === null) return { ...DEFAULT_CANDLE_COLORS }
    try {
      return sanitizeCandleColors(JSON.parse(raw))
    } catch {
      return { ...DEFAULT_CANDLE_COLORS }
    }
  } catch {
    return { ...DEFAULT_CANDLE_COLORS }
  }
}

export function saveCandleColors(colors: CandleColors): void {
  try {
    candleColorStorage()?.setItem(CANDLE_COLORS_STORAGE_KEY, JSON.stringify(colors))
  } catch {
    // Storage can be unavailable (private mode, quota); the in-memory colors stay usable.
  }
}

type CandleColorListener = () => void

const candleColorListeners = new Set<CandleColorListener>()
let currentCandleColors: CandleColors | null = null
let storageSyncBound = false

function notifyCandleColorListeners(): void {
  for (const listener of [...candleColorListeners]) listener()
}

/**
 * Keep two tabs on one preference: another tab's write is adopted and this
 * tab's mounted panels re-read it through the same listener path.
 */
function bindCandleColorStorageSync(): void {
  if (storageSyncBound) return
  storageSyncBound = true
  try {
    globalThis.addEventListener?.('storage', (event) => {
      if (event.key !== null && event.key !== CANDLE_COLORS_STORAGE_KEY) return
      const next = loadCandleColors()
      if (candleColorsEqual(getCandleColors(), next)) return
      currentCandleColors = next
      notifyCandleColorListeners()
    })
  } catch {
    // A non-browser host (unit tests) has no storage events.
  }
}

export function getCandleColors(): CandleColors {
  if (currentCandleColors === null) currentCandleColors = loadCandleColors()
  return currentCandleColors
}

/** Persist and broadcast a new global color pair. Returns the sanitized value. */
export function setCandleColors(next: CandleColors): CandleColors {
  const sanitized = sanitizeCandleColors(next)
  currentCandleColors = sanitized
  saveCandleColors(sanitized)
  notifyCandleColorListeners()
  return sanitized
}

export function resetCandleColors(): CandleColors {
  return setCandleColors(DEFAULT_CANDLE_COLORS)
}

export function subscribeCandleColors(listener: CandleColorListener): () => void {
  bindCandleColorStorageSync()
  candleColorListeners.add(listener)
  return () => {
    candleColorListeners.delete(listener)
  }
}
