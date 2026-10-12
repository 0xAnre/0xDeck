import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { IChartApi, MouseEventParams, Time } from 'lightweight-charts'
import {
  clampFixedRangeVolumeProfileSelectionTime,
  resolveChartEventTime,
  resolveChartTimeFromCoordinate,
  resolveFixedRangeVolumeProfileCrosshairTime,
  resolveFixedRangeVolumeProfileResizePointerTime,
} from './fixedRangeVolumeProfileChartTime.ts'

function clickParam(overrides: Partial<MouseEventParams<Time>> = {}): MouseEventParams<Time> {
  return {
    point: { x: 120, y: 80 },
    time: 1_700_000_000 as Time,
    ...overrides,
  } as MouseEventParams<Time>
}

const fiveMinuteOpen = 1_700_000_000
const barTimes = [fiveMinuteOpen, fiveMinuteOpen + 300, fiveMinuteOpen + 600]

function chartWithBars(barTimesList: number[], spacing = 10): IChartApi {
  return {
    timeScale: () => ({
      timeToCoordinate: (time: number) => {
        const index = barTimesList.indexOf(time)
        return index === -1 ? null : index * spacing
      },
      timeToIndex: (time: number, findNearest?: boolean) => {
        if (barTimesList.length === 0) return null
        const lastIndex = barTimesList.length - 1
        if (time > barTimesList[lastIndex]) return findNearest ? lastIndex : null
        const index = barTimesList.findIndex((bar) => bar >= time)
        if (index === -1) return findNearest ? lastIndex : null
        if (barTimesList[index] > time) return findNearest ? index : null
        return index
      },
      logicalToCoordinate: (logical: number) => logical * spacing,
      coordinateToLogical: (x: number) => x / spacing,
      coordinateToTime: (x: number) => barTimesList[Math.round(x / spacing)] ?? null,
    }),
  } as unknown as IChartApi
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

describe('resolveChartTimeFromCoordinate for latest candle', () => {
  it('resolves whitespace past the last bar to the last loaded candle time', () => {
    const chart = chartWithBars(barTimes)
    const context = {
      intervalDurationSeconds: 300,
      lastBarUnixTime: barTimes[barTimes.length - 1],
      lastBarLogicalIndex: barTimes.length - 1,
    }
    const time = resolveChartTimeFromCoordinate(chart, 50, context)
    assert.equal(time, barTimes[barTimes.length - 1])
  })

  it('prefers logical resolution past the last bar when coordinateToTime snaps early', () => {
    const chart = {
      timeScale: () => ({
        coordinateToTime: (x: number) => {
          if (x >= 25) return barTimes[1] as Time
          return barTimes[Math.round(x / 10)] ?? null
        },
        coordinateToLogical: (x: number) => x / 10,
        logicalToCoordinate: (logical: number) => logical * 10,
        timeToIndex: (time: number, findNearest?: boolean) => {
          const lastIndex = barTimes.length - 1
          if (time > barTimes[lastIndex]) return findNearest ? lastIndex : null
          const index = barTimes.findIndex((bar) => bar >= time)
          if (index === -1) return findNearest ? lastIndex : null
          return index
        },
      }),
    } as unknown as IChartApi
    const context = {
      intervalDurationSeconds: 300,
      lastBarUnixTime: barTimes[barTimes.length - 1],
      lastBarLogicalIndex: barTimes.length - 1,
    }
    const time = resolveChartTimeFromCoordinate(chart, 50, context)
    assert.equal(time, barTimes[barTimes.length - 1])
  })

  it('keeps the start endpoint on its candle when the pointer is at the handle center', () => {
    const chart = {
      timeScale: () => ({
        options: () => ({ barSpacing: 10 }),
        timeToCoordinate: (time: number) => (time === barTimes[0] ? 5 : null),
        coordinateToTime: (x: number) => {
          if (x <= 5) return barTimes[0] - 300
          return barTimes[0]
        },
      }),
    } as unknown as IChartApi
    const time = resolveFixedRangeVolumeProfileResizePointerTime(chart, 5, null, {
      kind: 'resize',
      instanceId: 'frvp-1',
      endpoint: 'start',
      initialFromTime: barTimes[0],
      initialToTime: barTimes[2],
      previewPointerTime: barTimes[0],
    })
    assert.equal(time, barTimes[0])
  })

  it('clamps projected future timestamps to the last loaded candle', () => {
    const context = {
      intervalDurationSeconds: 300,
      lastBarUnixTime: fiveMinuteOpen + 600,
      lastBarLogicalIndex: 2,
    }
    const clamped = clampFixedRangeVolumeProfileSelectionTime(fiveMinuteOpen + 1_500, context)
    assert.equal(clamped, fiveMinuteOpen + 600)
  })
})
