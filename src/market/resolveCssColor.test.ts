import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { oklchCssColorToRgbString, resolveThemeCssColor } from '../lib/resolveCssColor.ts'

describe('resolveCssColor theme tokens', () => {
  it('converts neutral theme --down oklch syntax to rgb without using fallback', () => {
    const token = 'oklch(0.704 0.191 22.216)'
    const fallback = 'rgb(220, 38, 38)'
    const resolved = resolveThemeCssColor(token, fallback)
    assert.notEqual(resolved, fallback)
    assert.equal(resolved, oklchCssColorToRgbString(token))
    assert.match(resolved, /^rgb\(\d+, \d+, \d+\)$/)
  })

  it('converts repository oklch down token to the expected srgb value', () => {
    assert.equal(oklchCssColorToRgbString('oklch(0.704 0.191 22.216)'), 'rgb(255, 100, 103)')
  })
})
