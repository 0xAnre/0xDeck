import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { DailyVwapPoint } from './dailyVwap.ts'
import { dailyVwapPointsToLineData } from './dailyVwapLineData.ts'

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

describe('dailyVwapPointsToLineData', () => {
  it('uses whitespace when value is null', () => {
    const data = dailyVwapPointsToLineData([point({ previousVwap: null })], 'previousVwap')
    assert.equal('value' in data[0], false)
  })

  it('includes numeric values when present', () => {
    const data = dailyVwapPointsToLineData([point({ vwap: 42.5 })], 'vwap')
    assert.equal(data[0].value, 42.5)
  })
})
