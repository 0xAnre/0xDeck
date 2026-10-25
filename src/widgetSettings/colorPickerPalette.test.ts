import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isMarketStyleHexColor } from '../market/marketStylePalette.ts'
import {
  COLOR_PICKER_COLUMNS,
  COLOR_PICKER_FLAT_COLORS,
  COLOR_PICKER_HUE_LABELS,
  COLOR_PICKER_ROWS,
  clampColorPickerOpacityPercent,
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

describe('colorPickerPalette', () => {
  it('is a 6 × 10 palette with unique uppercase hexes', () => {
    assert.equal(COLOR_PICKER_ROWS.length, 6)
    assert.equal(COLOR_PICKER_COLUMNS, 10)
    assert.deepEqual(
      COLOR_PICKER_ROWS.map((row) => row.id),
      ['grayscale', 'light', 'vibrant', 'base', 'dark', 'deep'],
    )

    for (const row of COLOR_PICKER_ROWS) {
      assert.equal(row.colors.length, COLOR_PICKER_COLUMNS)
      for (const hex of row.colors) assert.match(hex, /^#[0-9A-F]{6}$/)
    }

    assert.equal(COLOR_PICKER_FLAT_COLORS.length, 60)
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
})
