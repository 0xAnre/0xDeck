import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MONTHLY_VWAP_CHART_SERIES_KEYS } from './monthlyVwapChartSeries.ts'
import { QUARTERLY_VWAP_CHART_SERIES_KEYS } from './quarterlyVwapChartSeries.ts'
import { YEARLY_VWAP_CHART_SERIES_KEYS } from './yearlyVwapChartSeries.ts'
import {
  VWAP_CHART_LINE_STYLE,
  VWAP_CHART_SERIES_KEYS,
  VWAP_CHART_SERIES_STYLES,
} from './vwapChartLineStyles.ts'
import { shouldShowVwapIndicatorSeries } from './indicators.ts'

const OUTER_BAND_KEYS = ['upper2', 'lower2', 'previousUpper2', 'previousLower2'] as const

function assertThreeSeriesStyles(keys: readonly string[]) {
  assert.equal(keys.length, 3)
  for (const key of OUTER_BAND_KEYS) {
    assert.equal(keys.includes(key), false)
  }
  for (const key of ['upper1', 'lower1', 'previousVwap']) {
    assert.equal(keys.includes(key), false)
  }
  for (const key of keys) {
    const style = VWAP_CHART_SERIES_STYLES[key as keyof typeof VWAP_CHART_SERIES_STYLES]
    assert.equal(style.lineWidth, 1)
    assert.deepEqual(style, VWAP_CHART_LINE_STYLE)
  }
}

describe('long-horizon VWAP chart series keys', () => {
  it('monthly quarterly yearly each expose three series keys', () => {
    assert.deepEqual([...MONTHLY_VWAP_CHART_SERIES_KEYS], [...VWAP_CHART_SERIES_KEYS])
    assert.deepEqual([...QUARTERLY_VWAP_CHART_SERIES_KEYS], [...VWAP_CHART_SERIES_KEYS])
    assert.deepEqual([...YEARLY_VWAP_CHART_SERIES_KEYS], [...VWAP_CHART_SERIES_KEYS])
    assertThreeSeriesStyles(MONTHLY_VWAP_CHART_SERIES_KEYS)
    assertThreeSeriesStyles(QUARTERLY_VWAP_CHART_SERIES_KEYS)
    assertThreeSeriesStyles(YEARLY_VWAP_CHART_SERIES_KEYS)
  })
})

describe('long-horizon indicator visibility', () => {
  it('hides unsupported timeframe series', () => {
    assert.equal(
      shouldShowVwapIndicatorSeries({
        indicatorId: 'yearly-vwap',
        indicatorSelected: true,
        interval: '4h',
        loadedLevel: 'yearly',
        loadedInterval: '4h',
      }),
      false,
    )
    assert.equal(
      shouldShowVwapIndicatorSeries({
        indicatorId: 'monthly-vwap',
        indicatorSelected: true,
        interval: '1w',
        loadedLevel: 'yearly',
        loadedInterval: '1w',
      }),
      false,
    )
  })
})
