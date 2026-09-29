import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { WeeklyVwapPoint } from './weeklyVwap.ts'
import {
  WEEKLY_VWAP_CHART_LINE_STYLE,
  WEEKLY_VWAP_CHART_SERIES_KEYS,
  WEEKLY_VWAP_CHART_SERIES_STYLES,
  WEEKLY_VWAP_PREVIOUS_VWAP_LINE_STYLE,
  weeklyVwapPointToLinePoint,
  weeklyVwapPointsToLineData,
} from './weeklyVwapLineData.ts'

function point(overrides: Partial<WeeklyVwapPoint>): WeeklyVwapPoint {
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

describe('weeklyVwapPointsToLineData', () => {
  it('uses whitespace when value is null', () => {
    const data = weeklyVwapPointsToLineData([point({ previousVwap: null })], 'previousVwap')
    assert.equal('value' in data[0], false)
  })
})

describe('WEEKLY_VWAP_CHART_SERIES_STYLES', () => {
  it('defines six chart keys with gray bands and faded previousVwap', () => {
    assert.equal(WEEKLY_VWAP_CHART_SERIES_KEYS.length, 6)
    for (const key of OUTER_BAND_KEYS) {
      assert.equal((WEEKLY_VWAP_CHART_SERIES_KEYS as readonly string[]).includes(key), false)
    }
    for (const key of WEEKLY_VWAP_CHART_SERIES_KEYS) {
      const style = WEEKLY_VWAP_CHART_SERIES_STYLES[key]
      assert.equal(style.lineWidth, 1)
      if (key === 'previousVwap') {
        assert.deepEqual(style, WEEKLY_VWAP_PREVIOUS_VWAP_LINE_STYLE)
      } else {
        assert.deepEqual(style, WEEKLY_VWAP_CHART_LINE_STYLE)
      }
    }
  })
})

describe('weekly vwap chart live update keys', () => {
  it('updates only the six remaining chart series', () => {
    const last = point({ vwap: 99 })
    const keys: string[] = []
    for (const key of WEEKLY_VWAP_CHART_SERIES_KEYS) {
      weeklyVwapPointToLinePoint(last, key)
      keys.push(key)
    }
    assert.deepEqual(keys, [...WEEKLY_VWAP_CHART_SERIES_KEYS])
  })
})
