import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { DailyVwapPoint } from './dailyVwap.ts'
import {
  DAILY_VWAP_CHART_LINE_STYLE,
  DAILY_VWAP_CHART_SERIES_KEYS,
  DAILY_VWAP_CHART_SERIES_STYLES,
  dailyVwapPointToLinePoint,
  dailyVwapPointsToLineData,
} from './dailyVwapLineData.ts'

function point(overrides: Partial<DailyVwapPoint>): DailyVwapPoint {
  return {
    time: 1_704_067_200,
    vwap: 10,
    upper1: 11,
    lower1: 9,
    upper2: 12,
    lower2: 8,
    previousVwap: null,
    previousUpper1: null,
    previousLower1: null,
    previousUpper2: null,
    previousLower2: null,
    ...overrides,
  }
}

const OUTER_BAND_KEYS = ['upper2', 'lower2', 'previousUpper2', 'previousLower2'] as const

describe('dailyVwapPointsToLineData', () => {
  it('uses whitespace when value is null', () => {
    const data = dailyVwapPointsToLineData([point({ previousUpper1: null })], 'previousUpper1')
    assert.equal('value' in data[0], false)
  })

  it('includes numeric values when present', () => {
    const data = dailyVwapPointsToLineData([point({ vwap: 42.5 })], 'vwap')
    assert.equal(data[0].value, 42.5)
  })

  it('still reads previousVwap for data helpers without rendering it as a series key', () => {
    const data = dailyVwapPointsToLineData([point({ previousVwap: 5 })], 'previousVwap')
    assert.equal(data[0].value, 5)
    assert.equal((DAILY_VWAP_CHART_SERIES_KEYS as readonly string[]).includes('previousVwap'), false)
  })
})

describe('DAILY_VWAP_CHART_SERIES_STYLES', () => {
  it('uses full gray for three rendered line series', () => {
    assert.deepEqual(DAILY_VWAP_CHART_LINE_STYLE, { color: '#9e9e9e', lineWidth: 1 })

    for (const key of DAILY_VWAP_CHART_SERIES_KEYS) {
      const style = DAILY_VWAP_CHART_SERIES_STYLES[key]
      assert.equal(style.lineWidth, 1)
      assert.equal(style.color, '#9e9e9e')
    }

    for (const key of OUTER_BAND_KEYS) {
      assert.equal((DAILY_VWAP_CHART_SERIES_KEYS as readonly string[]).includes(key), false)
    }
  })
})

describe('DAILY_VWAP_CHART_SERIES_KEYS', () => {
  it('defines exactly three chart line series keys', () => {
    assert.equal(DAILY_VWAP_CHART_SERIES_KEYS.length, 3)
    assert.deepEqual([...DAILY_VWAP_CHART_SERIES_KEYS].sort(), [
      'previousLower1',
      'previousUpper1',
      'vwap',
    ])
    for (const key of ['upper1', 'lower1', 'previousVwap']) {
      assert.equal((DAILY_VWAP_CHART_SERIES_KEYS as readonly string[]).includes(key), false)
    }
  })
})

describe('daily vwap chart live update keys', () => {
  it('updates only the three remaining chart series', () => {
    const last = point({ vwap: 99, upper1: 100, lower1: 98 })
    const updatedKeys: string[] = []

    for (const key of DAILY_VWAP_CHART_SERIES_KEYS) {
      const linePoint = dailyVwapPointToLinePoint(last, key)
      updatedKeys.push(key)
      if (key === 'vwap') {
        assert.equal(linePoint.value, 99)
      }
      assert.equal('time' in linePoint, true)
    }

    assert.deepEqual(updatedKeys, [...DAILY_VWAP_CHART_SERIES_KEYS])
  })
})
