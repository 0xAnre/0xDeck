import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CrosshairMode, LineStyle } from 'lightweight-charts'
import {
  BTC_PERPETUAL_CROSSHAIR_LINE_OPACITY,
  btcPerpetualCrosshairOptions,
} from './btcPerpetualCrosshairOptions.ts'

describe('btcPerpetualCrosshairOptions', () => {
  it('uses CrosshairMode.Normal so the crosshair does not magnet-snap to OHLC', () => {
    const options = btcPerpetualCrosshairOptions('rgb(212, 212, 216)')
    assert.equal(options.mode, CrosshairMode.Normal)
    assert.notEqual(options.mode, CrosshairMode.Magnet)
    assert.equal(options.mode, 0)
  })

  it('keeps 1px dashed lines that stay visible with labels for both axes', () => {
    const options = btcPerpetualCrosshairOptions('rgb(212, 212, 216)')
    for (const line of [options.vertLine, options.horzLine]) {
      assert.ok(line)
      assert.equal(line.width, 1)
      assert.equal(line.style, LineStyle.LargeDashed)
      assert.equal(line.visible, true)
      assert.equal(line.labelVisible, true)
    }
    assert.deepEqual(options.vertLine, options.horzLine)
  })

  it('derives a ~50% alpha color from the theme-resolved foreground', () => {
    assert.equal(BTC_PERPETUAL_CROSSHAIR_LINE_OPACITY, 0.5)

    const fromRgb = btcPerpetualCrosshairOptions('rgb(212, 212, 216)')
    assert.equal(fromRgb.vertLine?.color, 'rgba(212, 212, 216, 0.5)')
    assert.equal(fromRgb.horzLine?.color, 'rgba(212, 212, 216, 0.5)')

    const fromHex = btcPerpetualCrosshairOptions('#d4d4d8')
    assert.equal(fromHex.vertLine?.color, 'rgba(212, 212, 216, 0.5)')
    assert.equal(fromHex.horzLine?.color, 'rgba(212, 212, 216, 0.5)')
  })

  it('follows the resolved foreground instead of a hardcoded palette color', () => {
    const light = btcPerpetualCrosshairOptions('rgb(250, 250, 250)')
    const dark = btcPerpetualCrosshairOptions('rgb(24, 24, 27)')
    assert.equal(light.vertLine?.color, 'rgba(250, 250, 250, 0.5)')
    assert.equal(dark.vertLine?.color, 'rgba(24, 24, 27, 0.5)')
    assert.notEqual(light.vertLine?.color, dark.vertLine?.color)
  })
})
