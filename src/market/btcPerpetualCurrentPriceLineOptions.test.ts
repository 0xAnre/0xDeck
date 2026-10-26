import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { LineStyle } from 'lightweight-charts'
import {
  BTC_PERPETUAL_CURRENT_PRICE_LINE_OPACITY,
  btcPerpetualCurrentPriceLineOptions,
} from './btcPerpetualCurrentPriceLineOptions.ts'

describe('btcPerpetualCurrentPriceLineOptions', () => {
  it('keeps a visible 1px dashed price line', () => {
    const options = btcPerpetualCurrentPriceLineOptions('rgb(212, 212, 216)')
    assert.equal(options.priceLineVisible, true)
    assert.equal(options.priceLineStyle, LineStyle.Dashed)
    assert.equal(options.priceLineWidth, 1)
  })

  it('derives a ~50% alpha color from the theme-resolved foreground', () => {
    assert.equal(BTC_PERPETUAL_CURRENT_PRICE_LINE_OPACITY, 0.5)

    const fromRgb = btcPerpetualCurrentPriceLineOptions('rgb(212, 212, 216)')
    assert.equal(fromRgb.priceLineColor, 'rgba(212, 212, 216, 0.5)')

    const fromHex = btcPerpetualCurrentPriceLineOptions('#d4d4d8')
    assert.equal(fromHex.priceLineColor, 'rgba(212, 212, 216, 0.5)')
  })

  it('carries alpha so the line is lighter than the opaque label background', () => {
    const options = btcPerpetualCurrentPriceLineOptions('rgb(212, 212, 216)')
    const alpha = /^rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)$/.exec(
      options.priceLineColor ?? '',
    )
    assert.ok(alpha, `expected an rgba() price line color, got ${options.priceLineColor}`)
    assert.ok(Number(alpha[1]) > 0 && Number(alpha[1]) < 1)
  })

  it('follows the resolved foreground instead of a hardcoded palette color', () => {
    const light = btcPerpetualCurrentPriceLineOptions('rgb(250, 250, 250)')
    const dark = btcPerpetualCurrentPriceLineOptions('rgb(24, 24, 27)')
    assert.equal(light.priceLineColor, 'rgba(250, 250, 250, 0.5)')
    assert.equal(dark.priceLineColor, 'rgba(24, 24, 27, 0.5)')
    assert.notEqual(light.priceLineColor, dark.priceLineColor)
  })

  it('does not touch candle, wick or border colors', () => {
    const options = btcPerpetualCurrentPriceLineOptions('rgb(212, 212, 216)')
    for (const key of [
      'upColor',
      'downColor',
      'wickUpColor',
      'wickDownColor',
      'borderUpColor',
      'borderDownColor',
      'borderVisible',
    ]) {
      assert.equal(key in options, false)
    }
  })
})
