/**
 * Global BTC Perp candle appearance.
 *
 * The user's explicit candle-style request is the narrow exception to the
 * fixed/semantic candle rule: body, border and wick are presentation parts with
 * no direction meaning. Each part owns one rising/falling color pair, one
 * shared 0–100 opacity (applied to both directions of that part) and one
 * visibility switch. The record is global, not panel scoped, so it deliberately
 * does not use the `0xdeck-widget-*` namespace.
 *
 * Legacy compatibility: older records store only `{ rising, falling }`. That
 * pair is the base color of all three parts, so an existing custom choice keeps
 * rendering exactly as before (`#DBDBDB` / `#808080` defaults, Body and Wick
 * visible, Borders hidden, every part fully opaque). Reading, opening or
 * cancelling never rewrites storage; only `setCandleColors` (the dialog's Save)
 * writes the normalized record.
 */
import {
  normalizeColorPickerHexInput,
  normalizeColorPickerOpacityPercent,
} from '../widgetSettings/colorPickerPalette.ts'
import { BTC_PERPETUAL_CANDLESTICK_COLORS } from './btcPerpetualCandleColors.ts'

export const CANDLE_COLORS_STORAGE_KEY = '0xdeck-candle-colors'

export const CANDLE_PART_IDS = ['body', 'border', 'wick'] as const

export type CandlePartId = (typeof CANDLE_PART_IDS)[number]

export type CandlePartColors = {
  /** Render this part at all. A hidden part keeps its colors and opacity. */
  readonly visible: boolean
  readonly rising: string
  readonly falling: string
  /** One 0–100 opacity shared by the rising and falling color of this part. */
  readonly opacity: number
}

/** Body, border and wick, each with its own colors, visibility and opacity. */
export type CandleColors = Readonly<Record<CandlePartId, CandlePartColors>>

const DEFAULT_OPACITY_PERCENT = 100

/** Body and Wick start visible; Borders stay hidden as in the legacy preference. */
const DEFAULT_PART_VISIBILITY: Readonly<Record<CandlePartId, boolean>> = {
  body: true,
  border: false,
  wick: true,
}

function defaultPart(visible: boolean): CandlePartColors {
  return {
    visible,
    rising: BTC_PERPETUAL_CANDLESTICK_COLORS.upColor,
    falling: BTC_PERPETUAL_CANDLESTICK_COLORS.downColor,
    opacity: DEFAULT_OPACITY_PERCENT,
  }
}

/** Fresh default record; never share one mutable object with a draft. */
export function createDefaultCandleColors(): CandleColors {
  return {
    body: defaultPart(DEFAULT_PART_VISIBILITY.body),
    border: defaultPart(DEFAULT_PART_VISIBILITY.border),
    wick: defaultPart(DEFAULT_PART_VISIBILITY.wick),
  }
}

export const DEFAULT_CANDLE_COLORS: CandleColors = Object.freeze({
  body: Object.freeze(defaultPart(DEFAULT_PART_VISIBILITY.body)),
  border: Object.freeze(defaultPart(DEFAULT_PART_VISIBILITY.border)),
  wick: Object.freeze(defaultPart(DEFAULT_PART_VISIBILITY.wick)),
})

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function directionColor(value: unknown): string | null {
  return normalizeColorPickerHexInput(value)
}

function sanitizeOpacity(value: unknown): number {
  if (typeof value !== 'number') return DEFAULT_OPACITY_PERCENT
  return normalizeColorPickerOpacityPercent(value)
}

function sanitizePart(
  value: unknown,
  fallbackRising: string,
  fallbackFalling: string,
  defaultVisible: boolean,
): CandlePartColors {
  const record = recordValue(value)
  return {
    visible:
      typeof record?.visible === 'boolean' ? record.visible : defaultVisible,
    rising: directionColor(record?.rising) ?? fallbackRising,
    falling: directionColor(record?.falling) ?? fallbackFalling,
    opacity: sanitizeOpacity(record?.opacity),
  }
}

/**
 * Defensive read of one persisted record.
 *
 * Every field falls back on its own. A legacy `{ rising, falling }` pair seeds
 * the colors of all three parts (so a saved custom choice is never discarded),
 * while a present part field overrides just that part. Missing, malformed or
 * out-of-range new fields fall back without touching valid siblings. Opacity is
 * clamped to 0–100; non-finite and non-number values fall back to 100.
 */
export function sanitizeCandleColors(value: unknown): CandleColors {
  const record = recordValue(value) ?? {}
  const legacyRising = directionColor(record.rising) ?? DEFAULT_CANDLE_COLORS.body.rising
  const legacyFalling = directionColor(record.falling) ?? DEFAULT_CANDLE_COLORS.body.falling

  return {
    body: sanitizePart(record.body, legacyRising, legacyFalling, DEFAULT_PART_VISIBILITY.body),
    border: sanitizePart(
      record.border,
      legacyRising,
      legacyFalling,
      DEFAULT_PART_VISIBILITY.border,
    ),
    wick: sanitizePart(record.wick, legacyRising, legacyFalling, DEFAULT_PART_VISIBILITY.wick),
  }
}

function partsEqual(left: CandlePartColors, right: CandlePartColors): boolean {
  return (
    left.visible === right.visible &&
    left.rising === right.rising &&
    left.falling === right.falling &&
    left.opacity === right.opacity
  )
}

/** Whole-record equality, including visibility and opacity of every part. */
export function candleColorsEqual(left: CandleColors, right: CandleColors): boolean {
  return (
    partsEqual(left.body, right.body) &&
    partsEqual(left.border, right.border) &&
    partsEqual(left.wick, right.wick)
  )
}

/**
 * One stored color at one effective opacity.
 *
 * A fully visible 100% part keeps the exact `#RRGGBB` string, so the default and
 * any opaque preference render pixel-identically to the old single-pair record.
 * Partial and zero opacity stay RGBA of the same color instead of replacing it,
 * so a part hidden by opacity or its checkbox keeps its chosen color.
 */
export function candleColorWithOpacity(color: string, opacityPercent: number): string {
  const hex = normalizeColorPickerHexInput(color)
  if (hex === null) return 'transparent'

  const opacity = normalizeColorPickerOpacityPercent(opacityPercent)
  if (opacity >= 100) return hex

  const red = Number.parseInt(hex.slice(1, 3), 16)
  const green = Number.parseInt(hex.slice(3, 5), 16)
  const blue = Number.parseInt(hex.slice(5, 7), 16)
  return `rgba(${red}, ${green}, ${blue}, ${opacity / 100})`
}

/** Effective color of one direction at this part's shared opacity. */
export function candlePartColor(
  part: CandlePartColors,
  direction: 'rising' | 'falling',
): string {
  return candleColorWithOpacity(part[direction], part.opacity)
}

/**
 * Body visibility has no native option, so only the body pair folds its
 * visibility into alpha 0. Border and Wick stay exact colors and use their
 * native `borderVisible` / `wickVisible` switches, which keeps the hidden-border
 * options identical to the legacy record.
 */
function candleBodyColor(part: CandlePartColors, direction: 'rising' | 'falling'): string {
  return candleColorWithOpacity(part[direction], part.visible ? part.opacity : 0)
}

/**
 * Candlestick series options for the global per-part record.
 *
 * The installed lightweight-charts 5.2.0 API has `wickVisible` and
 * `borderVisible` but no `bodyVisible`, so Body visibility is expressed as an
 * alpha-0 body color and only its own pair is affected. No per-part width or
 * custom renderer: the border stays the native 1px border.
 */
export function candleCandlestickSeriesOptions(colors: CandleColors) {
  return {
    upColor: candleBodyColor(colors.body, 'rising'),
    downColor: candleBodyColor(colors.body, 'falling'),
    wickUpColor: candlePartColor(colors.wick, 'rising'),
    wickDownColor: candlePartColor(colors.wick, 'falling'),
    borderUpColor: candlePartColor(colors.border, 'rising'),
    borderDownColor: candlePartColor(colors.border, 'falling'),
    borderVisible: colors.border.visible,
    wickVisible: colors.wick.visible,
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
    if (raw === null) return createDefaultCandleColors()
    try {
      return sanitizeCandleColors(JSON.parse(raw))
    } catch {
      return createDefaultCandleColors()
    }
  } catch {
    return createDefaultCandleColors()
  }
}

/**
 * Canonical persisted shape: the three part records plus the legacy top-level
 * `rising`/`falling` pair mirroring Body. The mirror keeps an older app version
 * (which only understands the legacy pair) showing the user's Body colors after
 * a save instead of resetting to defaults; the current reader always prefers
 * explicit part fields. No native `upColor`/`downColor` name is persisted.
 */
function candleColorsStorageRecord(colors: CandleColors) {
  return {
    rising: colors.body.rising,
    falling: colors.body.falling,
    body: colors.body,
    border: colors.border,
    wick: colors.wick,
  }
}

export function saveCandleColors(colors: CandleColors): void {
  try {
    const sanitized = sanitizeCandleColors(colors)
    candleColorStorage()?.setItem(
      CANDLE_COLORS_STORAGE_KEY,
      JSON.stringify(candleColorsStorageRecord(sanitized)),
    )
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
 * tab's mounted panels re-read it through the same listener path. The storage
 * event carries no field-level diff, so the whole record is re-read and compared
 * with `candleColorsEqual` — opacity- or visibility-only changes still notify.
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

/** Persist, broadcast and return the sanitized whole record. */
export function setCandleColors(next: CandleColors): CandleColors {
  const sanitized = sanitizeCandleColors(next)
  currentCandleColors = sanitized
  saveCandleColors(sanitized)
  notifyCandleColorListeners()
  return sanitized
}

/** Back to the built-in record; the caller still decides when to Save it. */
export function resetCandleColors(): CandleColors {
  return setCandleColors(createDefaultCandleColors())
}

export function subscribeCandleColors(listener: CandleColorListener): () => void {
  bindCandleColorStorageSync()
  candleColorListeners.add(listener)
  return () => {
    candleColorListeners.delete(listener)
  }
}
