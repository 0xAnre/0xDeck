import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ISeriesApi } from 'lightweight-charts'
import type { ChartSeriesBundle } from './applyChartLiveCandle.ts'
import {
  cssColorToHexForColorInput,
  marketIndicatorColorInputValue,
  marketIndicatorUsesDistinctSeriesColors,
  readLineSeriesColorHex,
  readMarketIndicatorSeriesColors,
} from './marketIndicatorSeriesColors.ts'

function mockLineSeries(color: string): ISeriesApi<'Line'> {
  return {
    options: () => ({ color }),
  } as ISeriesApi<'Line'>
}

describe('marketIndicatorSeriesColors', () => {
  it('converts rgb colors to hex for color inputs', () => {
    assert.equal(cssColorToHexForColorInput('rgb(113, 113, 122)'), '#71717a')
    assert.equal(cssColorToHexForColorInput('#aabbcc'), '#aabbcc')
  })

  it('reads line series colors as hex', () => {
    assert.equal(readLineSeriesColorHex(mockLineSeries('#112233')), '#112233')
    assert.equal(readLineSeriesColorHex(mockLineSeries('rgb(10, 20, 30)')), '#0a141e')
  })

  it('derives triple-ema colors from bundle series', () => {
    const bundle = {
      emas: [mockLineSeries('#111111'), mockLineSeries('#222222'), mockLineSeries('#333333')],
      ema100: mockLineSeries('#444444'),
      ema200: mockLineSeries('#555555'),
      dailyVwap: { byKey: { vwap: mockLineSeries('#666666') } },
      weeklyVwap: { byKey: { vwap: mockLineSeries('#777777') } },
      monthlyVwap: { byKey: { vwap: mockLineSeries('#888888') } },
      quarterlyVwap: { byKey: { vwap: mockLineSeries('#999999') } },
      yearlyVwap: { byKey: { vwap: mockLineSeries('#aaaaaa') } },
      rollingVwaps: new Map(),
    } as unknown as ChartSeriesBundle

    assert.deepEqual(readMarketIndicatorSeriesColors(bundle, 'triple-ema'), [
      '#111111',
      '#222222',
      '#333333',
    ])
    assert.deepEqual(readMarketIndicatorSeriesColors(bundle, 'daily-vwap'), ['#666666'])
  })

  it('uses saved override for the color input value', () => {
    assert.equal(marketIndicatorColorInputValue('#ff00ff', ['#111111']), '#ff00ff')
    assert.equal(marketIndicatorColorInputValue(undefined, ['#222222', '#333333']), '#222222')
  })

  it('detects distinct series colors for grouped indicators', () => {
    assert.equal(marketIndicatorUsesDistinctSeriesColors(['#111111', '#111111']), false)
    assert.equal(marketIndicatorUsesDistinctSeriesColors(['#111111', '#222222']), true)
  })
})
