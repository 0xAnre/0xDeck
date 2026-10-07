import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { WeeklyVwapPoint } from './weeklyVwap.ts'
import {
  WEEKLY_VWAP_CHART_LINE_STYLE,
  WEEKLY_VWAP_CHART_SERIES_KEYS,
  WEEKLY_VWAP_CHART_SERIES_STYLES,
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

describe('weeklyVwapPointsToLineData', () => {
  it('uses whitespace when value is null', () => {
    const data = weeklyVwapPointsToLineData([point({ previousLower1: null })], 'previousLower1')
    assert.equal('value' in data[0], false)
  })
})

describe('WEEKLY_VWAP_CHART_SERIES_STYLES', () => {
  it('defines three chart keys with gray strokes', () => {
    assert.equal(WEEKLY_VWAP_CHART_SERIES_KEYS.length, 3)
    for (const key of WEEKLY_VWAP_CHART_SERIES_KEYS) {
      const style = WEEKLY_VWAP_CHART_SERIES_STYLES[key]
      assert.equal(style.lineWidth, 1)
      assert.deepEqual(style, WEEKLY_VWAP_CHART_LINE_STYLE)
    }
    for (const key of ['upper1', 'lower1', 'previousVwap']) {
      assert.equal((WEEKLY_VWAP_CHART_SERIES_KEYS as readonly string[]).includes(key), false)
    }
  })
})

describe('weekly vwap chart live update keys', () => {
  it('updates only the three remaining chart series', () => {
    const last = point({ vwap: 99 })
    const keys: string[] = []
    for (const key of WEEKLY_VWAP_CHART_SERIES_KEYS) {
      weeklyVwapPointToLinePoint(last, key)
      keys.push(key)
    }
    assert.deepEqual(keys, [...WEEKLY_VWAP_CHART_SERIES_KEYS])
  })
})
