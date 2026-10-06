import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { oklchCssColorToRgbString, resolveCssColor } from '../lib/resolveCssColor.ts'
import {
  SMA_200_COLOR_FALLBACK,
  SMA_200_COLOR_VAR,
  resolveSma200LineColor,
} from './sma200LineColor.ts'

/** Bundled theme values for `--ring` in `src/index.css`. */
const THEME_RING = {
  neutral: 'oklch(0.556 0 0)',
  stone: 'oklch(0.553 0.013 58.071)',
  mauve: 'oklch(0.542 0.034 322.5)',
  taupe: 'oklch(0.547 0.021 43.1)',
  olive: 'oklch(0.58 0.031 107.3)',
} as const

describe('sma200LineColor', () => {
  it('reads the ring semantic token', () => {
    assert.equal(SMA_200_COLOR_VAR, '--ring')
  })

  it('resolves each theme ring token instead of the hardcoded fallback', () => {
    const resolved = Object.values(THEME_RING).map((token) =>
      resolveSma200LineColor(` ${token} `),
    )

    for (const [theme, token] of Object.entries(THEME_RING)) {
      const color = resolveSma200LineColor(token)
      assert.equal(resolveCssColor(token, SMA_200_COLOR_FALLBACK), SMA_200_COLOR_FALLBACK)
      assert.notEqual(color, SMA_200_COLOR_FALLBACK, theme)
      assert.equal(color, oklchCssColorToRgbString(token))
      assert.match(color, /^rgb\(\d+, \d+, \d+\)$/)
    }

    assert.equal(new Set(resolved).size, resolved.length)
  })
})
