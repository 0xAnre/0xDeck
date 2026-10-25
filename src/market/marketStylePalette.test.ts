import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, it } from 'node:test'
import {
  MARKET_STYLE_DEFAULTS,
  MARKET_STYLE_DUAL_LINE_SHADES,
  MARKET_STYLE_MULTI_LINE_SHADES,
  MARKET_STYLE_OPACITY_PERCENT,
  MARKET_STYLE_PALETTE,
  MARKET_STYLE_ROLLING_BAND_SHADES,
  clampMarketStyleOpacityPercent,
  isMarketStyleHexColor,
  isMarketStyleOpacityPercent,
  marketStyleColorWithOpacity,
  marketStyleRoleColor,
  marketStyleRoleDefault,
  marketStyleShade,
  sanitizeMarketStyleOpacityPercent,
} from './marketStylePalette.ts'

const SRC_ROOT = new URL('..', import.meta.url).pathname

function collectSourceFiles(): string[] {
  const files: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(path)
      } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
        files.push(path)
      }
    }
  }
  walk(SRC_ROOT)
  return files
}

describe('marketStylePalette colors', () => {
  it('exports the neutral shades plus the POC accent', () => {
    assert.deepEqual(MARKET_STYLE_PALETTE, {
      light: '#D4D4D4',
      medium: '#A3A3A3',
      dark: '#737373',
      subtle: '#525252',
      pocRed: '#D15F5B',
    })
  })

  it('defines the palette literals in exactly one production module', () => {
    const offenders: string[] = []
    const paletteValues = Object.values(MARKET_STYLE_PALETTE).map((value) => value.toLowerCase())
    for (const file of collectSourceFiles()) {
      if (file.endsWith('.test.ts') || file.endsWith('marketStylePalette.ts')) continue
      const content = readFileSync(file, 'utf8').toLowerCase()
      for (const hex of paletteValues) {
        if (content.includes(hex)) {
          offenders.push(`${relative(SRC_ROOT, file)}: ${hex}`)
        }
      }
    }
    assert.deepEqual(offenders, [])
  })

  it('accepts only six-digit hex colors', () => {
    assert.equal(isMarketStyleHexColor('#A3A3A3'), true)
    assert.equal(isMarketStyleHexColor('#a3a3a3'), true)
    assert.equal(isMarketStyleHexColor('#A3A3'), false)
    assert.equal(isMarketStyleHexColor('rgb(163, 163, 163)'), false)
  })
})

describe('marketStylePalette role defaults', () => {
  it('maps the primary/secondary/fill roles to palette colors and opacities', () => {
    assert.deepEqual(MARKET_STYLE_OPACITY_PERCENT, { full: 100, secondary: 70, fill: 25 })
    assert.deepEqual(MARKET_STYLE_DEFAULTS.primaryLine, {
      color: MARKET_STYLE_PALETTE.light,
      opacityPercent: 100,
    })
    assert.deepEqual(MARKET_STYLE_DEFAULTS.secondaryLine, {
      color: MARKET_STYLE_PALETTE.medium,
      opacityPercent: 70,
    })
    assert.deepEqual(MARKET_STYLE_DEFAULTS.fill, {
      color: MARKET_STYLE_PALETTE.medium,
      opacityPercent: 25,
    })
    assert.deepEqual(marketStyleRoleDefault('fill'), MARKET_STYLE_DEFAULTS.fill)
    assert.equal(marketStyleRoleColor('secondaryLine'), 'rgba(163, 163, 163, 0.7)')
  })

  it('returns a fresh role default object', () => {
    const first = marketStyleRoleDefault('primaryLine')
    first.color = '#000000'
    assert.equal(marketStyleRoleDefault('primaryLine').color, MARKET_STYLE_PALETTE.light)
  })

  it('exposes distinct shades for multi-line defaults', () => {
    assert.deepEqual(MARKET_STYLE_MULTI_LINE_SHADES, [
      MARKET_STYLE_PALETTE.light,
      MARKET_STYLE_PALETTE.medium,
      MARKET_STYLE_PALETTE.dark,
    ])
    assert.equal(new Set(MARKET_STYLE_MULTI_LINE_SHADES).size, 3)
    assert.deepEqual(MARKET_STYLE_DUAL_LINE_SHADES, [
      MARKET_STYLE_PALETTE.medium,
      MARKET_STYLE_PALETTE.dark,
    ])
    assert.equal(new Set(MARKET_STYLE_DUAL_LINE_SHADES).size, 2)
    assert.deepEqual(MARKET_STYLE_ROLLING_BAND_SHADES, [
      MARKET_STYLE_PALETTE.subtle,
      MARKET_STYLE_PALETTE.medium,
      MARKET_STYLE_PALETTE.dark,
    ])
    assert.equal(new Set(MARKET_STYLE_ROLLING_BAND_SHADES).size, 3)
  })

  it('resolves shades by index with a palette fallback', () => {
    assert.equal(marketStyleShade(MARKET_STYLE_MULTI_LINE_SHADES, 1), MARKET_STYLE_PALETTE.medium)
    assert.equal(marketStyleShade(MARKET_STYLE_MULTI_LINE_SHADES, 9), MARKET_STYLE_PALETTE.medium)
    assert.equal(marketStyleShade(MARKET_STYLE_MULTI_LINE_SHADES, 9, '#000000'), '#000000')
  })
})

describe('marketStylePalette opacity', () => {
  it('accepts percentages in 0..100 inclusive', () => {
    assert.equal(isMarketStyleOpacityPercent(0), true)
    assert.equal(isMarketStyleOpacityPercent(100), true)
    assert.equal(isMarketStyleOpacityPercent(42.5), true)
    assert.equal(isMarketStyleOpacityPercent(-1), false)
    assert.equal(isMarketStyleOpacityPercent(101), false)
    assert.equal(isMarketStyleOpacityPercent(Number.NaN), false)
    assert.equal(isMarketStyleOpacityPercent('50'), false)
    assert.equal(sanitizeMarketStyleOpacityPercent(30), 30)
    assert.equal(sanitizeMarketStyleOpacityPercent('30'), undefined)
  })

  it('clamps out-of-range and non-finite values', () => {
    assert.equal(clampMarketStyleOpacityPercent(-20), 0)
    assert.equal(clampMarketStyleOpacityPercent(240), 100)
    assert.equal(clampMarketStyleOpacityPercent(Number.POSITIVE_INFINITY), 100)
    assert.equal(clampMarketStyleOpacityPercent(37), 37)
  })

  it('converts hex + opacity percent to rgba and keeps the color at 100%', () => {
    assert.equal(marketStyleColorWithOpacity('#A3A3A3', 100), '#A3A3A3')
    assert.equal(marketStyleColorWithOpacity('#A3A3A3', 70), 'rgba(163, 163, 163, 0.7)')
    assert.equal(marketStyleColorWithOpacity('#A3A3A3', 0), 'rgba(163, 163, 163, 0)')
    // Out-of-range values clamp instead of producing invalid CSS.
    assert.equal(marketStyleColorWithOpacity('#FFFFFF', 250), '#FFFFFF')
    assert.equal(marketStyleColorWithOpacity('#FFFFFF', -50), 'rgba(255, 255, 255, 0)')
  })

  it('also folds opacity into resolved rgb colors', () => {
    assert.equal(marketStyleColorWithOpacity('rgb(17, 34, 51)', 50), 'rgba(17, 34, 51, 0.5)')
  })

  it('rewrites a previously folded rgba color instead of keeping its old alpha', () => {
    assert.equal(
      marketStyleColorWithOpacity('rgba(17, 34, 51, 0.5)', 70),
      'rgba(17, 34, 51, 0.7)',
    )
    assert.equal(
      marketStyleColorWithOpacity('rgba(17, 34, 51, 0.5)', 100),
      'rgba(17, 34, 51, 1)',
    )
  })
})
