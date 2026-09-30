import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { IChartApi, MouseEventParams, Time } from 'lightweight-charts'
import {
  resolveChartEventTime,
  resolveFixedRangeVolumeProfileCrosshairTime,
} from './fixedRangeVolumeProfileChartTime.ts'

function clickParam(overrides: Partial<MouseEventParams<Time>> = {}): MouseEventParams<Time> {
  return {
    point: { x: 120, y: 80 },
    time: 1_700_000_000 as Time,
    ...overrides,
  } as MouseEventParams<Time>
}

function mockChart(coordinateTime: Time | null = 1_700_000_060 as Time): IChartApi {
  return {
    timeScale: () => ({
      coordinateToTime: (x: number) => (x === 120 ? coordinateTime : null),
    }),
  } as unknown as IChartApi
}

describe('resolveChartEventTime', () => {
  it('accepts utc seconds', () => {
    assert.equal(resolveChartEventTime(1_700_000_000 as Time), 1_700_000_000)
  })
})

describe('resolveFixedRangeVolumeProfileCrosshairTime', () => {
  it('uses coordinateToTime when param.time is missing', () => {
    const chart = mockChart(150 as Time)
    const time = resolveFixedRangeVolumeProfileCrosshairTime(
      chart,
      clickParam({ time: undefined }),
    )
    assert.equal(time, 150)
  })
})
