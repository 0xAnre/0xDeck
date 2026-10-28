import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { LineStyle, type ISeriesApi } from 'lightweight-charts'
import type { ChartSeriesBundle } from './applyChartLiveCandle.ts'
import {
  chartLineStyleToStrokeStyle,
  marketIndicatorOpacityInputValue,
  cssColorToHexForColorInput,
  marketIndicatorColorInputValue,
  marketIndicatorLineStyleSelectValue,
  marketIndicatorLineWidthInputValue,
  marketIndicatorUsesDistinctSeriesColors,
  marketIndicatorUsesDistinctSeriesLineStyles,
  readLineSeriesColorHex,
  readLineSeriesLineStyle,
  readMarketIndicatorSeriesColors,
  readMarketIndicatorSeriesLineStyles,
  readSessionVwapSeriesStyleInputs,
  sessionVwapSeriesStyleInputsFromFlat,
} from './marketIndicatorSeriesColors.ts'

function mockLineSeries(
  color: string,
  lineStyle?: LineStyle,
  lineWidth?: number,
): ISeriesApi<'Line'> {
  return {
    options: () => ({ color, lineStyle, lineWidth }),
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

  it('maps chart line styles to stroke styles, reading dashed as solid', () => {
    assert.equal(chartLineStyleToStrokeStyle(LineStyle.Solid), 'solid')
    assert.equal(chartLineStyleToStrokeStyle(LineStyle.Dotted), 'dotted')
    // Retired style: Lightweight Charts dashed series read as solid.
    assert.equal(chartLineStyleToStrokeStyle(LineStyle.Dashed), 'solid')
    assert.equal(chartLineStyleToStrokeStyle(undefined), 'solid')
  })

  it('reads line series stroke style from options', () => {
    assert.equal(readLineSeriesLineStyle(mockLineSeries('#000', LineStyle.Dashed)), 'solid')
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

    assert.deepEqual(readMarketIndicatorSeriesLineStyles(bundle, 'dual-ema'), ['solid', 'solid'])
    assert.deepEqual(readMarketIndicatorSeriesLineStyles(bundle, 'triple-ema'), [
      'solid',
      'solid',
      'solid',
    ])
  })

  it('uses saved override for the line style select value', () => {
    assert.equal(marketIndicatorLineStyleSelectValue('dotted', ['solid']), 'dotted')
    assert.equal(marketIndicatorLineStyleSelectValue(undefined, ['solid', 'solid']), 'solid')
    assert.equal(marketIndicatorLineStyleSelectValue(undefined, ['solid', 'solid']), 'solid')
  })

  it('detects distinct series line styles for grouped indicators', () => {
    assert.equal(marketIndicatorUsesDistinctSeriesLineStyles(['solid', 'solid']), false)
    assert.equal(marketIndicatorUsesDistinctSeriesLineStyles(['solid', 'dotted']), true)
  })

  it('maps the indicator opacity control to the palette primary default', () => {
    assert.equal(marketIndicatorOpacityInputValue(undefined), 100)
    assert.equal(marketIndicatorOpacityInputValue(35), 35)
    assert.equal(marketIndicatorOpacityInputValue(150), 100)
  })

  it('derives line width defaults from series options', () => {
    assert.equal(marketIndicatorLineWidthInputValue(undefined, [3, 3]), 3)
    assert.equal(marketIndicatorLineWidthInputValue(2, [3, 3]), 2)
  })
})


describe('session VWAP per-series dialog inputs', () => {
  function sessionBundle() {
    return {
      emas: [],
      ema100: mockLineSeries('#000000'),
      ema200: mockLineSeries('#000000'),
      dailyVwap: {
        byKey: {
          vwap: mockLineSeries('#aaaaaa', LineStyle.Solid, 2),
          previousUpper1: mockLineSeries('rgba(187, 187, 187, 0.7)', LineStyle.Dotted, 3),
          previousLower1: mockLineSeries('#cccccc', LineStyle.Solid, 1),
        },
        ordered: [],
        band: {},
      },
      weeklyVwap: { byKey: {}, ordered: [], band: {} },
      monthlyVwap: { byKey: {}, ordered: [], band: {} },
      quarterlyVwap: { byKey: {}, ordered: [], band: {} },
      yearlyVwap: { byKey: {}, ordered: [], band: {} },
      rollingVwaps: new Map(),
    } as unknown as ChartSeriesBundle
  }

  it('opens on each live series value when nothing is stored', () => {
    assert.deepEqual(readSessionVwapSeriesStyleInputs(sessionBundle(), 'daily-vwap', {}), {
      vwap: { color: '#aaaaaa', opacityPercent: 100, lineWidth: 2, lineStyle: 'solid' },
      previousUpper1: {
        color: '#bbbbbb',
        opacityPercent: 100,
        lineWidth: 3,
        lineStyle: 'dotted',
      },
      previousLower1: { color: '#cccccc', opacityPercent: 100, lineWidth: 1, lineStyle: 'solid' },
    })
  })

  it('uses the flat record as the fallback for every series', () => {
    const inputs = readSessionVwapSeriesStyleInputs(sessionBundle(), 'daily-vwap', {
      color: '#112233',
      opacity: 40,
      lineWidth: 4,
      lineStyle: 'dotted',
    })
    assert.ok(inputs)
    for (const key of ['vwap', 'previousUpper1', 'previousLower1'] as const) {
      assert.deepEqual(inputs[key], {
        color: '#112233',
        opacityPercent: 40,
        lineWidth: 4,
        lineStyle: 'dotted',
      })
    }
  })

  it('prefers stored per-series fields and falls back per field', () => {
    const inputs = readSessionVwapSeriesStyleInputs(sessionBundle(), 'daily-vwap', {
      color: '#112233',
      opacity: 40,
      lineWidth: 4,
      lineStyle: 'dotted',
      series: { vwap: { color: '#abcdef' }, previousLower1: { opacity: 0 } },
    })
    assert.deepEqual(inputs?.vwap, {
      color: '#abcdef',
      opacityPercent: 40,
      lineWidth: 4,
      lineStyle: 'dotted',
    })
    assert.deepEqual(inputs?.previousLower1, {
      color: '#112233',
      opacityPercent: 0,
      lineWidth: 4,
      lineStyle: 'dotted',
    })
    assert.deepEqual(inputs?.previousUpper1, {
      color: '#112233',
      opacityPercent: 40,
      lineWidth: 4,
      lineStyle: 'dotted',
    })
  })

  it('returns null for indicators without session VWAP lines', () => {
    assert.equal(readSessionVwapSeriesStyleInputs(sessionBundle(), 'rsi', {}), null)
  })

  it('clones flat values into all three series for bundle-less fallback', () => {
    assert.deepEqual(
      sessionVwapSeriesStyleInputsFromFlat({
        color: '#112233',
        opacityPercent: 0,
        lineWidth: 2,
        lineStyle: 'dotted',
      }),
      {
        vwap: { color: '#112233', opacityPercent: 0, lineWidth: 2, lineStyle: 'dotted' },
        previousUpper1: { color: '#112233', opacityPercent: 0, lineWidth: 2, lineStyle: 'dotted' },
        previousLower1: { color: '#112233', opacityPercent: 0, lineWidth: 2, lineStyle: 'dotted' },
      },
    )
  })
})
