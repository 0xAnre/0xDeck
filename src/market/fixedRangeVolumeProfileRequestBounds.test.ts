import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  computeFixedRangeVolumeProfileComputationBounds,
  computeFixedRangeVolumeProfileRequestBounds,
} from './fixedRangeVolumeProfileRequestBounds.ts'
import type { FixedRangeVolumeProfileInstance } from './fixedRangeVolumeProfileInstances.ts'

function instance(
  fromTime: number,
  toTime: number,
  selectionInterval: FixedRangeVolumeProfileInstance['selectionInterval'],
): FixedRangeVolumeProfileInstance {
  return {
    id: 'frvp-test',
    fromTime,
    toTime,
    selectionInterval,
    rowCount: 24,
    valueAreaPercent: 70,
    enabled: true,
  }
}

describe('fixedRangeVolumeProfileRequestBounds', () => {
  it('includes the last 1m candle in exclusive API end', () => {
    const bounds = computeFixedRangeVolumeProfileRequestBounds(
      instance(1_700_000_000, 1_700_000_060, '1m'),
    )
    assert.deepEqual(bounds, {
      requestStartTime: 1_700_000_000,
      requestEndTime: 1_700_000_120,
    })
  })

  it('includes the last 4h candle in exclusive API end', () => {
    const from = 1_700_000_000
    const to = from + 14_400
    const bounds = computeFixedRangeVolumeProfileRequestBounds(instance(from, to, '4h'))
    assert.equal(bounds?.requestEndTime, to + 14_400)
  })

  it('includes the last 1h and 2h candles in exclusive API end', () => {
    const from = 1_700_000_000
    const oneHour = computeFixedRangeVolumeProfileRequestBounds(
      instance(from, from + 3600, '1h'),
    )
    assert.equal(oneHour?.requestEndTime, from + 7200)
    const twoHour = computeFixedRangeVolumeProfileRequestBounds(
      instance(from, from + 7200, '2h'),
    )
    assert.equal(twoHour?.requestEndTime, from + 14_400)
  })

  it('includes the last 1d candle in exclusive API end', () => {
    const from = 1_700_000_000
    const to = from + 86_400
    const bounds = computeFixedRangeVolumeProfileRequestBounds(instance(from, to, '1d'))
    assert.equal(bounds?.requestEndTime, to + 86_400)
  })

  it('includes the last 1w candle in exclusive API end', () => {
    const from = 1_700_000_000
    const to = from + 604_800
    const bounds = computeFixedRangeVolumeProfileRequestBounds(instance(from, to, '1w'))
    assert.equal(bounds?.requestEndTime, to + 604_800)
  })

  it('normalizes right-to-left selection while preserving interval', () => {
    const bounds = computeFixedRangeVolumeProfileRequestBounds(
      instance(1_700_000_120, 1_700_000_000, '5m'),
    )
    assert.deepEqual(bounds, {
      requestStartTime: 1_700_000_000,
      requestEndTime: 1_700_000_120 + 300,
    })
  })

  it('maps exclusive API bounds to inclusive Stage 1 computation bounds', () => {
    const request = { requestStartTime: 100, requestEndTime: 260 }
    assert.deepEqual(computeFixedRangeVolumeProfileComputationBounds(request), {
      fromTime: 100,
      toTime: 259,
    })
  })

  it('rejects overflow request bounds', () => {
    const bounds = computeFixedRangeVolumeProfileRequestBounds(
      instance(Number.MAX_SAFE_INTEGER - 10, Number.MAX_SAFE_INTEGER - 5, '1w'),
    )
    assert.equal(bounds, null)
  })
})
