import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { resolveRectangleTimeToCoordinate } from './rectangleChartTime.ts'

describe('resolveRectangleTimeToCoordinate', () => {
  it('falls back to nearest bar index when exact candle time is missing', () => {
    const chart = {
      timeScale: () => ({
        timeToCoordinate: (time: number) => (time === 300 ? 30 : null),
        timeToIndex: (time: number, findNearest?: boolean) => {
          if (!findNearest) return null
          if (time === 180) return 18
          return null
        },
        logicalToCoordinate: (logical: number) => logical * 2,
      }),
    }

    assert.equal(resolveRectangleTimeToCoordinate(chart as never, 300), 30)
    assert.equal(resolveRectangleTimeToCoordinate(chart as never, 180), 36)
  })
})
