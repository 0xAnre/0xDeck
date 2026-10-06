import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { oklchCssColorToRgbString, resolveCssColor } from '../lib/resolveCssColor.ts'
import {
  SMA_200_COLOR_FALLBACK,
  SMA_200_COLOR_VAR,
  resolveSma200LineColor,
} from './sma200LineColor.ts'

/**
 * Bundled theme strokes from `src/index.css`.
 * SMA 200 must not resolve to the same rgb as EMA 13 or the other SMA overlays.
 */
const THEME_STROKES = {
  neutral: {
    sidebarPrimary: 'oklch(0.488 0.243 264.376)',
    chart1: 'oklch(0.87 0 0)',
    chart2: 'oklch(0.556 0 0)',
    chart3: 'oklch(0.439 0 0)',
    chart4: 'oklch(0.371 0 0)',
    chart5: 'oklch(0.269 0 0)',
    mutedForeground: 'oklch(0.708 0 0)',
  },
  stone: {
    sidebarPrimary: 'oklch(0.488 0.243 264.376)',
    chart1: 'oklch(0.869 0.005 56.366)',
    chart2: 'oklch(0.553 0.013 58.071)',
    chart3: 'oklch(0.444 0.011 73.639)',
    chart4: 'oklch(0.374 0.01 67.558)',
    chart5: 'oklch(0.268 0.007 34.298)',
    mutedForeground: 'oklch(0.709 0.01 56.259)',
  },
  mauve: {
    sidebarPrimary: 'oklch(0.488 0.243 264.376)',
    chart1: 'oklch(0.865 0.012 325.68)',
    chart2: 'oklch(0.542 0.034 322.5)',
    chart3: 'oklch(0.435 0.029 321.78)',
    chart4: 'oklch(0.364 0.029 323.89)',
    chart5: 'oklch(0.263 0.024 320.12)',
    mutedForeground: 'oklch(0.711 0.019 323.02)',
  },
  taupe: {
    sidebarPrimary: 'oklch(0.769 0.188 70.08)',
    chart1: 'oklch(0.868 0.007 39.5)',
    chart2: 'oklch(0.547 0.021 43.1)',
    chart3: 'oklch(0.438 0.017 39.3)',
    chart4: 'oklch(0.367 0.016 35.7)',
    chart5: 'oklch(0.268 0.011 36.5)',
    mutedForeground: 'oklch(0.714 0.014 41.2)',
  },
  olive: {
    sidebarPrimary: 'oklch(0.488 0.243 264.376)',
    chart1: 'oklch(0.88 0.011 106.6)',
    chart2: 'oklch(0.58 0.031 107.3)',
    chart3: 'oklch(0.466 0.025 107.3)',
    chart4: 'oklch(0.394 0.023 107.4)',
    chart5: 'oklch(0.286 0.016 107.4)',
    mutedForeground: 'oklch(0.737 0.021 106.9)',
  },
} as const

describe('sma200LineColor', () => {
  it('reads the sidebar-primary semantic token', () => {
    assert.equal(SMA_200_COLOR_VAR, '--sidebar-primary')
  })

  it('resolves each theme sidebar-primary token instead of the hardcoded fallback', () => {
    for (const [theme, strokes] of Object.entries(THEME_STROKES)) {
      const color = resolveSma200LineColor(` ${strokes.sidebarPrimary} `)
      assert.equal(
        resolveCssColor(strokes.sidebarPrimary, SMA_200_COLOR_FALLBACK),
        SMA_200_COLOR_FALLBACK,
      )
      assert.notEqual(color, SMA_200_COLOR_FALLBACK, theme)
      assert.equal(color, oklchCssColorToRgbString(strokes.sidebarPrimary))
      assert.match(color, /^rgb\(\d+, \d+, \d+\)$/)
    }
  })

  it('stays distinct from EMA 13 and the other SMA strokes in every theme', () => {
    for (const [theme, strokes] of Object.entries(THEME_STROKES)) {
      const sma200 = resolveSma200LineColor(strokes.sidebarPrimary)
      const occupied = [
        strokes.chart1,
        strokes.chart2,
        strokes.chart3,
        strokes.chart4,
        strokes.chart5,
        strokes.mutedForeground,
      ].map((token) => oklchCssColorToRgbString(token))

      for (const other of occupied) {
        assert.notEqual(sma200, other, theme)
      }
    }
  })
})
