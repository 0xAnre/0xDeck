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
