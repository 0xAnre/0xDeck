import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { LineStyle, type ISeriesApi } from 'lightweight-charts'
import type { ChartSeriesBundle } from './applyChartLiveCandle.ts'
import {
  chartLineStyleToStrokeStyle,
  cssColorToHexForColorInput,
  marketIndicatorColorInputValue,
  marketIndicatorLineStyleSelectValue,
  marketIndicatorUsesDistinctSeriesColors,
  marketIndicatorUsesDistinctSeriesLineStyles,
  readLineSeriesColorHex,
  readLineSeriesLineStyle,
  readMarketIndicatorSeriesColors,
  readMarketIndicatorSeriesLineStyles,
} from './marketIndicatorSeriesColors.ts'

function mockLineSeries(color: string, lineStyle?: LineStyle): ISeriesApi<'Line'> {
  return {
    options: () => ({ color, lineStyle }),
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

  it('maps chart line styles to stroke styles', () => {
    assert.equal(chartLineStyleToStrokeStyle(LineStyle.Solid), 'solid')
    assert.equal(chartLineStyleToStrokeStyle(LineStyle.Dashed), 'dashed')
    assert.equal(chartLineStyleToStrokeStyle(undefined), 'solid')
  })

  it('reads line series stroke style from options', () => {
    assert.equal(readLineSeriesLineStyle(mockLineSeries('#000', LineStyle.Dashed)), 'dashed')
    assert.equal(readLineSeriesLineStyle(mockLineSeries('#000')), 'solid')
  })

  it('derives dual-ema line styles from bundle series', () => {
    const bundle = {
      emas: [mockLineSeries('#111111'), mockLineSeries('#222222'), mockLineSeries('#333333')],
      ema100: mockLineSeries('#444444', LineStyle.Dashed),
      ema200: mockLineSeries('#555555', LineStyle.Solid),
      dailyVwap: { byKey: { vwap: mockLineSeries('#666666') } },
      weeklyVwap: { byKey: { vwap: mockLineSeries('#777777') } },
      monthlyVwap: { byKey: { vwap: mockLineSeries('#888888') } },
      quarterlyVwap: { byKey: { vwap: mockLineSeries('#999999') } },
      yearlyVwap: { byKey: { vwap: mockLineSeries('#aaaaaa') } },
      rollingVwaps: new Map(),
    } as unknown as ChartSeriesBundle

    assert.deepEqual(readMarketIndicatorSeriesLineStyles(bundle, 'dual-ema'), ['dashed', 'solid'])
    assert.deepEqual(readMarketIndicatorSeriesLineStyles(bundle, 'triple-ema'), [
      'solid',
      'solid',
      'solid',
    ])
  })

  it('uses saved override for the line style select value', () => {
    assert.equal(marketIndicatorLineStyleSelectValue('dotted', ['solid']), 'dotted')
    assert.equal(marketIndicatorLineStyleSelectValue(undefined, ['solid', 'solid']), 'solid')
    assert.equal(marketIndicatorLineStyleSelectValue(undefined, ['dashed', 'solid']), 'dashed')
  })

  it('detects distinct series line styles for grouped indicators', () => {
    assert.equal(marketIndicatorUsesDistinctSeriesLineStyles(['solid', 'solid']), false)
    assert.equal(marketIndicatorUsesDistinctSeriesLineStyles(['dashed', 'solid']), true)
  })
})
