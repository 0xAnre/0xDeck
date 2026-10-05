import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { oklchCssColorToRgbString, resolveCssColor } from '../lib/resolveCssColor.ts'
import {
  SMA_100_COLOR_FALLBACK,
  SMA_100_COLOR_VAR,
  resolveSma100LineColor,
} from './sma100LineColor.ts'

/** Bundled theme values for `--muted-foreground` in `src/index.css`. */
const THEME_MUTED_FOREGROUND = {
  neutral: 'oklch(0.708 0 0)',
  stone: 'oklch(0.709 0.01 56.259)',
  mauve: 'oklch(0.711 0.019 323.02)',
  taupe: 'oklch(0.714 0.014 41.2)',
  olive: 'oklch(0.737 0.021 106.9)',
} as const

describe('sma100LineColor', () => {
  it('reads the muted-foreground semantic token', () => {
    assert.equal(SMA_100_COLOR_VAR, '--muted-foreground')
  })

  it('resolves each theme muted-foreground token instead of the hardcoded fallback', () => {
    const resolved = Object.values(THEME_MUTED_FOREGROUND).map((token) =>
      resolveSma100LineColor(` ${token} `),
    )

    for (const [theme, token] of Object.entries(THEME_MUTED_FOREGROUND)) {
      const color = resolveSma100LineColor(token)
      assert.equal(resolveCssColor(token, SMA_100_COLOR_FALLBACK), SMA_100_COLOR_FALLBACK)
      assert.notEqual(color, SMA_100_COLOR_FALLBACK, theme)
      assert.equal(color, oklchCssColorToRgbString(token))
      assert.match(color, /^rgb\(\d+, \d+, \d+\)$/)
    }

    assert.equal(new Set(resolved).size, resolved.length)
  })
})
