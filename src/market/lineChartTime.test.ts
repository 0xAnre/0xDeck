import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { resolveLineTimeToCoordinate } from './lineChartTime.ts'
import type { LineChartTimeContext } from './lineChartTime.ts'

describe('lineChartTime', () => {
  it('projects future timestamps using shared chart time context', () => {
    const context: LineChartTimeContext = {
      intervalDurationSeconds: 60,
      lastBarUnixTime: 1_700_000_000,
      lastBarLogicalIndex: 100,
    }
    const chart = {
      timeScale: () => ({
        timeToCoordinate: () => null,
        logicalToCoordinate: (logical: number) => logical * 2,
        timeToIndex: () => null,
      }),
    }
    const coordinate = resolveLineTimeToCoordinate(
      chart as never,
      1_700_000_120,
      'end',
      context,
    )
    assert.equal(coordinate, 204)
  })
})
