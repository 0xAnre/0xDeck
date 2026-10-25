import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isMarketStyleHexColor } from '../market/marketStylePalette.ts'
import {
  COLOR_PICKER_COLUMNS,
  COLOR_PICKER_CONTENT_PADDING_REM,
  COLOR_PICKER_CONTENT_STYLE,
  COLOR_PICKER_FLAT_COLORS,
  COLOR_PICKER_GRID_GAP_REM,
  COLOR_PICKER_GRID_STYLE,
  COLOR_PICKER_GRID_WIDTH_REM,
  COLOR_PICKER_HUE_LABELS,
  COLOR_PICKER_LINE_PREVIEW_HEIGHT_PX,
  COLOR_PICKER_LINE_PREVIEW_STROKE_WIDTH_PX,
  COLOR_PICKER_LINE_PREVIEW_WIDTH_PX,
  COLOR_PICKER_POPOVER_MAX_WIDTH_CSS,
  COLOR_PICKER_POPOVER_WIDTH_PX,
  COLOR_PICKER_ROWS,
  COLOR_PICKER_SWATCH_COUNT,
  COLOR_PICKER_SWATCH_SIZE_REM,
  COLOR_PICKER_SWATCH_STYLE,
  clampColorPickerOpacityPercent,
  colorPickerLinePreview,
  colorPickerLineStyleToggleValue,
  colorPickerNextSwatchIndex,
  colorPickerPaletteMatch,
  colorPickerSwatchLabel,
  colorPickerSwatchUsesDarkCheck,
  isColorPickerHex,
  normalizeColorPickerHexInput,
  normalizeColorPickerOpacityPercent,
} from './colorPickerPalette.ts'

const PROJECT_DEFAULT_HEXES = [
  '#D4D4D4',
  '#A3A3A3',
  '#737373',
  '#525252',
  '#DBDBDB',
  '#808080',
  '#D15F5B',
] as const

/** Authoritative 6 × 10 hex table from Issue #140, pinned literally. */
const EXPECTED_ROWS = [
  {
    id: 'grayscale',
    colors: [
      '#FFFFFF',
      '#DBDBDB',
      '#D4D4D4',
      '#A3A3A3',
      '#808080',
      '#737373',
      '#525252',
      '#404040',
      '#262626',
      '#000000',
    ],
  },
  {
    id: 'light',
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
    colors: [
      '#D15F5B',
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
] as const

describe('colorPickerPalette', () => {
  it('pins the literal 6 × 10 hex table from Issue #140', () => {
    assert.equal(COLOR_PICKER_ROWS.length, 6)
    assert.equal(COLOR_PICKER_COLUMNS, 10)
    assert.deepEqual(
      COLOR_PICKER_ROWS.map((row) => row.id),
      ['grayscale', 'light', 'vibrant', 'base', 'dark', 'deep'],
    )

    for (let row = 0; row < EXPECTED_ROWS.length; row += 1) {
      const actual = COLOR_PICKER_ROWS[row]
      const expected = EXPECTED_ROWS[row]
      assert.equal(actual.id, expected.id)
      assert.equal(actual.colors.length, COLOR_PICKER_COLUMNS)
      assert.deepEqual([...actual.colors], [...expected.colors], `${expected.id} row`)
    }

    for (const row of COLOR_PICKER_ROWS) {
      for (const hex of row.colors) assert.match(hex, /^#[0-9A-F]{6}$/)
    }

    assert.equal(COLOR_PICKER_FLAT_COLORS.length, 60)
    assert.equal(COLOR_PICKER_SWATCH_COUNT, 60)
    assert.equal(new Set(COLOR_PICKER_FLAT_COLORS).size, COLOR_PICKER_FLAT_COLORS.length)
  })

  it('starts with the grayscale ramp and includes every project default', () => {
    assert.equal(COLOR_PICKER_ROWS[0].id, 'grayscale')
    assert.deepEqual(COLOR_PICKER_ROWS[0].colors, [
      '#FFFFFF',
      '#DBDBDB',
      '#D4D4D4',
      '#A3A3A3',
      '#808080',
      '#737373',
      '#525252',
      '#404040',
      '#262626',
      '#000000',
    ])

    for (const hex of PROJECT_DEFAULT_HEXES) {
      assert.ok(COLOR_PICKER_FLAT_COLORS.includes(hex), `${hex} must be a palette member`)
    }

    assert.equal(COLOR_PICKER_FLAT_COLORS.includes('#D15F5B'), true)
    assert.equal(COLOR_PICKER_ROWS[3].colors[0], '#D15F5B')
  })

  it('labels the ten hue columns', () => {
    assert.equal(COLOR_PICKER_HUE_LABELS.length, COLOR_PICKER_COLUMNS)
    assert.equal(COLOR_PICKER_HUE_LABELS[0], 'Red')
    assert.equal(COLOR_PICKER_HUE_LABELS[9], 'Pink')
    assert.equal(colorPickerSwatchLabel(COLOR_PICKER_ROWS[0], 0), 'Gray 1')
    assert.equal(colorPickerSwatchLabel(COLOR_PICKER_ROWS[3], 0), 'Red base')
  })

  it('accepts #RRGGBB with or without # in any case', () => {
    for (const input of ['#D15F5B', 'D15F5B', '#d15f5b', '  d15F5b  ']) {
      assert.equal(isColorPickerHex(input), true)
      assert.equal(normalizeColorPickerHexInput(input), '#D15F5B')
    }
  })

  it('rejects partial, non-hex, empty and whitespace input', () => {
    for (const input of [
      '#D15F5',
      '#GGGGGG',
      '#D15F5BB',
      '#D15F5B#',
      'D15F 5B',
      '',
      '   ',
      null,
      undefined,
      123,
    ]) {
      assert.equal(isColorPickerHex(input), false)
      assert.equal(normalizeColorPickerHexInput(input), null)
    }
  })

  it('matches defaults to their palette coordinates and custom colors to null', () => {
    assert.deepEqual(colorPickerPaletteMatch('#D15F5B'), { row: 3, column: 0 })
    assert.deepEqual(colorPickerPaletteMatch('d15f5b'), { row: 3, column: 0 })
    assert.deepEqual(colorPickerPaletteMatch('#D4D4D4'), { row: 0, column: 2 })
    assert.deepEqual(colorPickerPaletteMatch('#DBDBDB'), { row: 0, column: 1 })
    assert.deepEqual(colorPickerPaletteMatch('#808080'), { row: 0, column: 4 })
    assert.equal(colorPickerPaletteMatch('#123456'), null)
    assert.equal(colorPickerPaletteMatch('not-a-color'), null)
  })

  it('round-trips every palette hex to its own coordinates', () => {
    for (let row = 0; row < COLOR_PICKER_ROWS.length; row += 1) {
      for (let column = 0; column < COLOR_PICKER_COLUMNS; column += 1) {
        const hex = COLOR_PICKER_ROWS[row].colors[column]
        assert.deepEqual(colorPickerPaletteMatch(hex), { row, column })
      }
    }
  })

  it('wraps roving focus around the grid edge, per the ARIA grid pattern', () => {
    // Right: next swatch, row end continues at the next row start, last wraps to first.
    assert.equal(colorPickerNextSwatchIndex(0, 'ArrowRight'), 1)
    assert.equal(colorPickerNextSwatchIndex(9, 'ArrowRight'), 10)
    assert.equal(colorPickerNextSwatchIndex(49, 'ArrowRight'), 50)
    assert.equal(colorPickerNextSwatchIndex(59, 'ArrowRight'), 0)

    // Left: previous swatch, row start continues at the previous row end, first wraps to last.
    assert.equal(colorPickerNextSwatchIndex(10, 'ArrowLeft'), 9)
    assert.equal(colorPickerNextSwatchIndex(1, 'ArrowLeft'), 0)
    assert.equal(colorPickerNextSwatchIndex(0, 'ArrowLeft'), 59)

    // Down/Up: same column, wrapping from the last row to the first (and back).
    assert.equal(colorPickerNextSwatchIndex(0, 'ArrowDown'), 10)
    assert.equal(colorPickerNextSwatchIndex(55, 'ArrowDown'), 5)
    assert.equal(colorPickerNextSwatchIndex(59, 'ArrowDown'), 9)
    assert.equal(colorPickerNextSwatchIndex(5, 'ArrowUp'), 55)
    assert.equal(colorPickerNextSwatchIndex(0, 'ArrowUp'), 50)

    // Home/End stay within the current row.
    assert.equal(colorPickerNextSwatchIndex(23, 'Home'), 20)
    assert.equal(colorPickerNextSwatchIndex(23, 'End'), 29)

    // Non-navigation keys and out-of-range indexes are ignored.
    for (const key of ['Enter', ' ', 'ArrowRightX', 'Tab', 'Escape', 'a']) {
      assert.equal(colorPickerNextSwatchIndex(5, key), null)
    }
    for (const index of [-1, 60, 1.5, Number.NaN]) {
      assert.equal(colorPickerNextSwatchIndex(index, 'ArrowRight'), null)
    }
  })

  it('clamps and rounds opacity into an integer 0–100', () => {
    assert.equal(normalizeColorPickerOpacityPercent(0), 0)
    assert.equal(normalizeColorPickerOpacityPercent(100), 100)
    assert.equal(normalizeColorPickerOpacityPercent(-25), 0)
    assert.equal(normalizeColorPickerOpacityPercent(150), 100)
    assert.equal(normalizeColorPickerOpacityPercent(49.6), 50)
    assert.equal(normalizeColorPickerOpacityPercent(50.4), 50)
    assert.equal(normalizeColorPickerOpacityPercent(Number.NaN), 100)
    assert.equal(normalizeColorPickerOpacityPercent(Number.POSITIVE_INFINITY), 100)
    assert.equal(normalizeColorPickerOpacityPercent(Number.NEGATIVE_INFINITY), 100)

    assert.equal(clampColorPickerOpacityPercent(42.5), 42.5)
    assert.equal(clampColorPickerOpacityPercent(-10), 0)
    assert.equal(clampColorPickerOpacityPercent(110), 100)
    assert.equal(clampColorPickerOpacityPercent(Number.NaN), 100)
  })

  it('picks a readable check glyph for light and dark swatches', () => {
    assert.equal(colorPickerSwatchUsesDarkCheck('#FFFFFF'), true)
    assert.equal(colorPickerSwatchUsesDarkCheck('#D4D4D4'), true)
    assert.equal(colorPickerSwatchUsesDarkCheck('#A3A3A3'), true)
    assert.equal(colorPickerSwatchUsesDarkCheck('#808080'), false)
    assert.equal(colorPickerSwatchUsesDarkCheck('#000000'), false)
    assert.equal(colorPickerSwatchUsesDarkCheck('not-a-color'), false)
  })

  it('emits hex values the market style sanitizers still accept', () => {
    for (const hex of COLOR_PICKER_FLAT_COLORS) {
      assert.equal(isMarketStyleHexColor(hex), true)
    }

    const emitted = normalizeColorPickerHexInput('d15f5b')
    assert.equal(emitted, '#D15F5B')
    assert.equal(isMarketStyleHexColor(emitted), true)
  })

  it('sizes the popover so the full palette grid fits without shrinking', () => {
    // Regression guard for the clipped "narrow vertical strip" popover: the
    // popover used `w-fit` while its first child was a `container-type:
    // inline-size` FieldGroup, so it collapsed to its padding and the 10-column
    // grid was squeezed into 0px tracks. The width must be derived from the
    // palette, not from intrinsic content sizing.
    const swatchRowPx = COLOR_PICKER_COLUMNS * COLOR_PICKER_SWATCH_SIZE_REM * 16
    const gapsPx = (COLOR_PICKER_COLUMNS - 1) * COLOR_PICKER_GRID_GAP_REM * 16
    const paddingPx = 2 * COLOR_PICKER_CONTENT_PADDING_REM * 16

    assert.equal(COLOR_PICKER_GRID_WIDTH_REM, 17.25)
    assert.equal(swatchRowPx, 240)
    assert.equal(gapsPx, 36)
    assert.equal(paddingPx, 16)

    // Grid + padding must fit inside the popover content box.
    assert.ok(
      swatchRowPx + gapsPx + paddingPx <= COLOR_PICKER_POPOVER_WIDTH_PX,
      `palette needs ${swatchRowPx + gapsPx + paddingPx}px, popover is ${COLOR_PICKER_POPOVER_WIDTH_PX}px`,
    )

    // Popover width stays a sane, bounded whole-pixel value.
    assert.equal(COLOR_PICKER_POPOVER_WIDTH_PX, 292)
    assert.ok(Number.isInteger(COLOR_PICKER_POPOVER_WIDTH_PX))
    assert.ok(COLOR_PICKER_POPOVER_WIDTH_PX >= 256)
    assert.ok(COLOR_PICKER_POPOVER_WIDTH_PX <= 384)

    // Viewport cap is viewport-relative, so narrow windows stay usable.
    assert.equal(COLOR_PICKER_POPOVER_MAX_WIDTH_CSS, 'calc(100vw - 1.5rem)')
  })

  it('renders the popover, grid and swatch geometry from those same constants', () => {
    // These objects are spread into inline styles by `ColorOpacityField`, so the
    // assertions below pin the geometry that is actually painted: a hardcoded
    // Tailwind utility can no longer silently disagree with the constants.
    assert.deepEqual(COLOR_PICKER_CONTENT_STYLE, {
      width: COLOR_PICKER_POPOVER_WIDTH_PX,
      maxWidth: COLOR_PICKER_POPOVER_MAX_WIDTH_CSS,
      padding: '0.5rem',
    })
    assert.deepEqual(COLOR_PICKER_GRID_STYLE, {
      gridTemplateColumns: 'repeat(10, minmax(1.5rem, 1fr))',
      gap: '0.25rem',
    })
    assert.deepEqual(COLOR_PICKER_SWATCH_STYLE, { width: '1.5rem', height: '1.5rem' })

    // The inline values still mirror the exported `rem` constants one-to-one.
    assert.equal(COLOR_PICKER_CONTENT_STYLE.padding, `${COLOR_PICKER_CONTENT_PADDING_REM}rem`)
    assert.equal(COLOR_PICKER_GRID_STYLE.gap, `${COLOR_PICKER_GRID_GAP_REM}rem`)
    assert.equal(COLOR_PICKER_SWATCH_STYLE.width, `${COLOR_PICKER_SWATCH_SIZE_REM}rem`)
    assert.equal(COLOR_PICKER_SWATCH_STYLE.height, `${COLOR_PICKER_SWATCH_SIZE_REM}rem`)
  })

  it('previews Line as solid and Dot with the renderer dash pattern', () => {
    const solid = colorPickerLinePreview('solid')
    assert.equal(solid.strokeDasharray, undefined)
    assert.equal(solid.strokeWidth, COLOR_PICKER_LINE_PREVIEW_STROKE_WIDTH_PX)
    assert.equal(solid.x1, COLOR_PICKER_LINE_PREVIEW_STROKE_WIDTH_PX)
    assert.equal(solid.x2, COLOR_PICKER_LINE_PREVIEW_WIDTH_PX - COLOR_PICKER_LINE_PREVIEW_STROKE_WIDTH_PX)
    assert.equal(solid.y1, COLOR_PICKER_LINE_PREVIEW_HEIGHT_PX / 2)
    assert.equal(solid.y2, COLOR_PICKER_LINE_PREVIEW_HEIGHT_PX / 2)

    // `lineChartStrokeDashPattern('dotted')` is `[2, 3]`.
    assert.equal(colorPickerLinePreview('dotted').strokeDasharray, '2 3')

    // A legacy, unsanitized `dashed` value still renders as a solid preview.
    assert.equal(
      colorPickerLinePreview('dashed' as unknown as 'solid').strokeDasharray,
      undefined,
    )
    assert.equal(colorPickerLinePreview(undefined).strokeDasharray, undefined)
  })

  it('never falsely selects a style in the mixed state', () => {
    assert.equal(colorPickerLineStyleToggleValue('solid', false), 'solid')
    assert.equal(colorPickerLineStyleToggleValue('dotted', false), 'dotted')
    // Only `solid` and `dotted` are ever emitted by the toggle.
    assert.deepEqual(
      ['solid', 'dotted'].map((style) => colorPickerLineStyleToggleValue(style as 'solid', false)),
      ['solid', 'dotted'],
    )

    // Mixed/indeterminate and undefined both match no `ToggleGroupItem` value.
    assert.equal(colorPickerLineStyleToggleValue('solid', true), '')
    assert.equal(colorPickerLineStyleToggleValue('dotted', true), '')
    assert.equal(colorPickerLineStyleToggleValue(undefined, false), '')
    assert.equal(colorPickerLineStyleToggleValue(undefined, true), '')
  })
})
