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

  it('converts css hue units to degrees before rgb conversion', () => {
    const base = 'oklch(0.7 0.15 180)'
    assert.equal(oklchCssColorToRgbString('oklch(0.7 0.15 0.5turn)'), oklchCssColorToRgbString(base))
    assert.equal(
      oklchCssColorToRgbString('oklch(0.7 0.15 1.5707963267948966rad)'),
      oklchCssColorToRgbString('oklch(0.7 0.15 90deg)'),
    )
    assert.equal(
      oklchCssColorToRgbString('oklch(0.7 0.15 100grad)'),
      oklchCssColorToRgbString('oklch(0.7 0.15 90)'),
    )
    assert.notEqual(
      oklchCssColorToRgbString('oklch(0.7 0.15 0.5turn)'),
      oklchCssColorToRgbString('oklch(0.7 0.15 0.5)'),
    )
  })

  it('scales percentage chroma using the css 0.4 reference', () => {
    const percentChroma = 'oklch(70% 20% 20)'
    const absoluteChroma = 'oklch(0.7 0.08 20)'
    const overScaledChroma = 'oklch(0.7 0.2 20)'

    assert.equal(oklchCssColorToRgbString(percentChroma), oklchCssColorToRgbString(absoluteChroma))
    assert.notEqual(
      oklchCssColorToRgbString(percentChroma),
      oklchCssColorToRgbString(overScaledChroma),
    )
  })
})
