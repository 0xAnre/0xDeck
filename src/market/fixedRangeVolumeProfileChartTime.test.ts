import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { IChartApi, MouseEventParams, Time } from 'lightweight-charts'
import {
  applyFixedRangeVolumeProfileClick,
  armFixedRangeVolumeProfileTool,
} from './fixedRangeVolumeProfileInteraction.ts'
import {
  resolveChartEventTime,
  resolveFixedRangeVolumeProfileClickTime,
  resolveFixedRangeVolumeProfileCrosshairTime,
} from './fixedRangeVolumeProfileChartTime.ts'

function clickParam(overrides: Partial<MouseEventParams<Time>> = {}): MouseEventParams<Time> {
  return {
    point: { x: 120, y: 80 },
    time: 1_700_000_000 as Time,
    ...overrides,
  } as MouseEventParams<Time>
}

function mockChart(
  coordinateTime: Time | null = 1_700_000_060 as Time,
  logicalTime: Time | null = null,
): IChartApi {
  return {
    timeScale: () => ({
      coordinateToTime: (x: number) => (x === 120 ? coordinateTime : x === 88 ? logicalTime : null),
      logicalToCoordinate: (logical: number) => (logical === 42 ? 88 : null),
    }),
  } as unknown as IChartApi
}

describe('resolveChartEventTime', () => {
  it('accepts utc seconds', () => {
    assert.equal(resolveChartEventTime(1_700_000_000 as Time), 1_700_000_000)
  })
})

describe('resolveFixedRangeVolumeProfileClickTime', () => {
  it('uses param.time when present', () => {
    const chart = mockChart()
    const interaction = armFixedRangeVolumeProfileTool()
    const time = resolveFixedRangeVolumeProfileClickTime(
      chart,
      clickParam({ time: 1_700_000_100 as Time }),
      interaction,
    )
    assert.equal(time, 1_700_000_100)
  })

  it('falls back to logical index mapping when time and point coordinate fail', () => {
    const chart = mockChart(null, 1_700_000_300 as Time)
    const interaction = armFixedRangeVolumeProfileTool()
    const time = resolveFixedRangeVolumeProfileClickTime(
      chart,
      clickParam({ time: undefined, logical: 42 as never, point: { x: 999, y: 1 } }),
      interaction,
    )
    assert.equal(time, 1_700_000_300)
  })

  it('falls back to coordinateToTime when param.time is missing', () => {
    const chart = mockChart(1_700_000_200 as Time)
    const interaction = armFixedRangeVolumeProfileTool()
    const time = resolveFixedRangeVolumeProfileClickTime(
      chart,
      clickParam({ time: undefined }),
      interaction,
    )
    assert.equal(time, 1_700_000_200)
  })

  it('falls back to draft.previewTime in preview when time and coordinate fail', () => {
    const chart = mockChart(null)
    const first = applyFixedRangeVolumeProfileClick(armFixedRangeVolumeProfileTool(), 100, [], '1m')
    assert.equal(first.state.phase, 'preview')
    const time = resolveFixedRangeVolumeProfileClickTime(
      chart,
      clickParam({ time: undefined, point: { x: 999, y: 1 } }),
      first.state,
    )
    assert.equal(time, first.state.draft?.previewTime)
  })

  it('returns null without mutating when no valid time is available', () => {
    const chart = mockChart(null)
    const interaction = armFixedRangeVolumeProfileTool()
    const time = resolveFixedRangeVolumeProfileClickTime(
      chart,
      clickParam({ time: undefined, point: { x: 999, y: 1 } }),
      interaction,
    )
    assert.equal(time, null)
    const result = applyFixedRangeVolumeProfileClick(interaction, time, [], '1m')
    assert.equal(result.state.phase, 'armed')
    assert.equal(result.completedInstance, null)
  })

  it('completes selection on second click with coordinate fallback only', () => {
    const chart = mockChart(200 as Time)
    const first = applyFixedRangeVolumeProfileClick(armFixedRangeVolumeProfileTool(), 100, [], '1m')
    const clickTime = resolveFixedRangeVolumeProfileClickTime(
      chart,
      clickParam({ time: undefined }),
      first.state,
    )
    const second = applyFixedRangeVolumeProfileClick(first.state, clickTime, [], '1m')
    assert.equal(second.completedInstance?.fromTime, 100)
    assert.equal(second.completedInstance?.toTime, 200)
    assert.equal(second.state.phase, 'inactive')
  })

  it('creates only one instance across a normal two-click flow', () => {
    const instances: unknown[] = []
    let interaction = armFixedRangeVolumeProfileTool()
    const first = applyFixedRangeVolumeProfileClick(interaction, 100, instances, '1m')
    interaction = first.state
    const second = applyFixedRangeVolumeProfileClick(interaction, 200, instances, '1m')
    if (second.completedInstance) instances.push(second.completedInstance)
    assert.equal(instances.length, 1)
    const third = applyFixedRangeVolumeProfileClick(second.state, 300, instances, '1m')
    assert.equal(third.completedInstance, null)
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
