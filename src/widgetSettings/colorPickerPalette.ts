/**
 * Pure palette data and decisions for the shared `ColorOpacityField` popover.
 *
 * Kept React-free so the palette shape, HEX validation, palette matching and
 * opacity normalization can be unit-tested with `node --test`.
 *
 * The palette is intentionally larger than the neutral `MARKET_STYLE_PALETTE`
 * but includes every existing project default, so reopening a dialog always
 * shows the saved color as a selected swatch. Palette literals owned by
 * `MARKET_STYLE_PALETTE` are referenced, not re-declared.
 */

import { MARKET_STYLE_PALETTE } from '../market/marketStylePalette.ts'

export type ColorPickerRowId =
  | 'grayscale'
  | 'light'
  | 'vibrant'
  | 'base'
  | 'dark'
  | 'deep'

export type ColorPickerPaletteRow = {
  id: ColorPickerRowId
  label: string
  colors: readonly string[]
}

export type ColorPickerPaletteMatch = {
  row: number
  column: number
}

export const COLOR_PICKER_COLUMNS = 10

/**
 * Palette geometry in `rem` (Tailwind scale), used to size the popover from the
 * palette instead of from its intrinsic content width.
 *
 * The popover must not use `w-fit`. Its first child is a shadcn `FieldGroup`
 * (`@container/field-group` → `container-type: inline-size`), and an
 * inline-size containment box contributes **zero** intrinsic inline size to its
 * ancestors. `fit-content` therefore collapsed the popover to its padding
 * (measured 16px wide, `FieldGroup` 0px, all 10 grid tracks 0px,
 * `scrollWidth` 98 > `clientWidth` 16), which clipped the palette into a narrow
 * vertical strip. These constants are the single source of truth for the width
 * the palette actually needs; `ColorOpacityField` sizes the popover with them
 * and `colorPickerPalette.test.ts` pins the relationship.
 */
export const COLOR_PICKER_SWATCH_SIZE_REM = 1.5 // Button size="icon-sm" → size-6
export const COLOR_PICKER_GRID_GAP_REM = 0.25 // gap-1
export const COLOR_PICKER_CONTENT_PADDING_REM = 0.5 // p-2

/** Width the 10-column swatch grid needs: swatches + gaps, without padding. */
export const COLOR_PICKER_GRID_WIDTH_REM =
  COLOR_PICKER_COLUMNS * COLOR_PICKER_SWATCH_SIZE_REM +
  (COLOR_PICKER_COLUMNS - 1) * COLOR_PICKER_GRID_GAP_REM

/** Popover width in whole pixels: grid + horizontal padding (1rem = 16px). */
export const COLOR_PICKER_POPOVER_WIDTH_PX = Math.ceil(
  (COLOR_PICKER_GRID_WIDTH_REM + 2 * COLOR_PICKER_CONTENT_PADDING_REM) * 16,
)

/** Viewport-safe width cap so the popover never overflows a narrow window. */
export const COLOR_PICKER_POPOVER_MAX_WIDTH_CSS = 'calc(100vw - 1.5rem)'

/** Hue family for each palette column (red → pink). */
export const COLOR_PICKER_HUE_LABELS = [
  'Red',
  'Orange',
  'Yellow',
  'Green',
  'Teal',
  'Cyan',
  'Blue',
  'Purple',
  'Violet',
  'Pink',
] as const

export const COLOR_PICKER_ROWS: readonly ColorPickerPaletteRow[] = [
  {
    id: 'grayscale',
    label: 'Grayscale',
    colors: [
      '#FFFFFF',
      '#DBDBDB',
      MARKET_STYLE_PALETTE.light,
      MARKET_STYLE_PALETTE.medium,
      '#808080',
      MARKET_STYLE_PALETTE.dark,
      MARKET_STYLE_PALETTE.subtle,
      '#404040',
      '#262626',
      '#000000',
    ],
  },
  {
    id: 'light',
    label: 'Light',
    colors: [
      '#FF9AA0',
      '#FFBB86',
      '#FFE08A',
      '#A8E6A1',
      '#8CE0CB',
      '#8ED8F8',
      '#A5C8FF',
      '#C4B5FD',
      '#D8B4FE',
      '#F9A8D4',
    ],
  },
  {
    id: 'vibrant',
    label: 'Vibrant',
    colors: [
      '#F7525F',
      '#FF8A3D',
      '#FFC53D',
      '#4CD07D',
      '#2BB6A3',
      '#29B5E8',
      '#3B82F6',
      '#8B5CF6',
      '#A855F7',
      '#EC4899',
    ],
  },
  {
    id: 'base',
    label: 'Base',
    colors: [
      MARKET_STYLE_PALETTE.pocRed,
      '#E2670F',
      '#D6A008',
      '#1E9E55',
      '#128678',
      '#0E8DB4',
      '#2563EB',
      '#7C3AED',
      '#8B3FD9',
      '#C0298A',
    ],
  },
  {
    id: 'dark',
    label: 'Dark',
    colors: [
      '#A31D29',
      '#A8450B',
      '#9C740A',
      '#147A41',
      '#0C6259',
      '#0B6A88',
      '#1E40AF',
      '#6D28D9',
      '#7127A8',
      '#9D1F6B',
    ],
  },
  {
    id: 'deep',
    label: 'Deep',
    colors: [
      '#6E1019',
      '#7A2E06',
      '#6E5106',
      '#0F5B30',
      '#08423C',
      '#084C63',
      '#172E8C',
      '#4C1D95',
      '#4E1B76',
      '#71134C',
    ],
  },
]

/** All swatch hexes in reading order (row-major). */
export const COLOR_PICKER_FLAT_COLORS: readonly string[] = COLOR_PICKER_ROWS.flatMap(
  (row) => row.colors,
)

/** Number of focusable swatches in the grid. */
export const COLOR_PICKER_SWATCH_COUNT =
  COLOR_PICKER_ROWS.length * COLOR_PICKER_COLUMNS

/** Documented custom-HEX example; reuses the project accent without duplicating it. */
export const COLOR_PICKER_CUSTOM_HEX_EXAMPLE = MARKET_STYLE_PALETTE.pocRed

const HEX_BODY_PATTERN = /^[0-9A-Fa-f]{6}$/

function hexBody(value: string): string {
  const trimmed = value.trim()
  return trimmed.startsWith('#') ? trimmed.slice(1) : trimmed
}

/** Accepts `#RRGGBB` with or without the leading `#`, in any case. */
export function isColorPickerHex(value: unknown): value is string {
  return typeof value === 'string' && HEX_BODY_PATTERN.test(hexBody(value))
}

/** Canonical uppercase `#RRGGBB`, or `null` for partial/invalid input. */
export function normalizeColorPickerHexInput(text: unknown): string | null {
  if (!isColorPickerHex(text)) return null
  return `#${hexBody(text).toUpperCase()}`
}

/** Palette coordinates for a saved color, or `null` for a custom color. */
export function colorPickerPaletteMatch(color: unknown): ColorPickerPaletteMatch | null {
  const normalized = normalizeColorPickerHexInput(color)
  if (normalized === null) return null

  for (let row = 0; row < COLOR_PICKER_ROWS.length; row += 1) {
    const column = COLOR_PICKER_ROWS[row]?.colors.indexOf(normalized) ?? -1
    if (column >= 0) return { row, column }
  }

  return null
}

/** Accessible name for a swatch, e.g. `Red dark` or `Gray 4`. */
export function colorPickerSwatchLabel(
  row: ColorPickerPaletteRow,
  column: number,
): string {
  if (row.id === 'grayscale') return `Gray ${column + 1}`
  return `${COLOR_PICKER_HUE_LABELS[column] ?? 'Color'} ${row.label.toLowerCase()}`
}

/**
 * Roving-focus target for the palette grid (single-select ARIA grid pattern).
 *
 * Wrap semantics, so the grid is fully traversable in both directions with one
 * key and every move lands on a swatch:
 * - `ArrowRight`: next swatch; at the end of a row it continues at the start of
 *   the next row, and the last swatch wraps to the first.
 * - `ArrowLeft`: previous swatch; at the start of a row it continues at the end
 *   of the previous row, and the first swatch wraps to the last.
 * - `ArrowDown` / `ArrowUp`: same column one row down/up, wrapping from the last
 *   row to the first (and vice versa).
 * - `Home` / `End`: first / last swatch **of the current row**.
 *
 * Returns `null` for keys that are not grid navigation and for out-of-range
 * indexes, so callers can leave the event alone.
 */
export function colorPickerNextSwatchIndex(index: number, key: string): number | null {
  if (!Number.isInteger(index) || index < 0 || index >= COLOR_PICKER_SWATCH_COUNT) {
    return null
  }

  const rowStart = index - (index % COLOR_PICKER_COLUMNS)

  switch (key) {
    case 'ArrowRight':
      return (index + 1) % COLOR_PICKER_SWATCH_COUNT
    case 'ArrowLeft':
      return (index - 1 + COLOR_PICKER_SWATCH_COUNT) % COLOR_PICKER_SWATCH_COUNT
    case 'ArrowDown':
      return (index + COLOR_PICKER_COLUMNS) % COLOR_PICKER_SWATCH_COUNT
    case 'ArrowUp':
      return (index - COLOR_PICKER_COLUMNS + COLOR_PICKER_SWATCH_COUNT) % COLOR_PICKER_SWATCH_COUNT
    case 'Home':
      return rowStart
    case 'End':
      return rowStart + COLOR_PICKER_COLUMNS - 1
    default:
      return null
  }
}

/**
 * Whether the selected-check glyph needs a dark foreground for contrast.
 * Uses WCAG relative luminance against a mid-point threshold.
 */
export function colorPickerSwatchUsesDarkCheck(hex: string): boolean {
  const normalized = normalizeColorPickerHexInput(hex)
  if (normalized === null) return false

  const channel = (offset: number) => {
    const srgb = Number.parseInt(normalized.slice(offset, offset + 2), 16) / 255
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
  }

  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
  return luminance > 0.3
}

/** Clamp opacity into 0–100; non-finite input falls back to fully opaque. */
export function clampColorPickerOpacityPercent(value: number): number {
  if (!Number.isFinite(value)) return 100
  return Math.min(100, Math.max(0, value))
}

/** Clamp and round opacity to the integer percentage the picker commits. */
export function normalizeColorPickerOpacityPercent(value: number): number {
  return Math.round(clampColorPickerOpacityPercent(value))
}
