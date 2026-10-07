import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { IChartApi } from 'lightweight-charts'
import { resolveRectangleTimeToCoordinate } from './rectangleChartTime.ts'

function chartWithBars(barTimes: number[], spacing = 10): IChartApi {
  return {
    timeScale: () => ({
      timeToCoordinate: (time: number) => {
        const index = barTimes.indexOf(time)
        return index === -1 ? null : index * spacing
      },
      timeToIndex: (time: number, findNearest?: boolean) => {
        if (barTimes.length === 0) return null
        const lastIndex = barTimes.length - 1
        if (time > barTimes[lastIndex]) return findNearest ? lastIndex : null
        const index = barTimes.findIndex((bar) => bar >= time)
        if (index === -1) return findNearest ? lastIndex : null
        if (barTimes[index] > time) return findNearest ? index : null
        return index
      },
      logicalToCoordinate: (logical: number) => logical * spacing,
      coordinateToTime: (x: number) => barTimes[Math.round(x / spacing)] ?? null,
    }),
  } as unknown as IChartApi
}

const fiveMinuteOpen = 1_700_000_000

describe('resolveRectangleTimeToCoordinate', () => {
  it('uses the exact candle coordinate when the timestamp exists', () => {
    const chart = chartWithBars([fiveMinuteOpen, fiveMinuteOpen + 300, fiveMinuteOpen + 600])
    assert.equal(resolveRectangleTimeToCoordinate(chart, fiveMinuteOpen + 300, 'start'), 10)
    assert.equal(resolveRectangleTimeToCoordinate(chart, fiveMinuteOpen + 300, 'end'), 10)
  })

  it('projects an in-gap start and end onto opposite interval boundaries', () => {
    const chart = chartWithBars([fiveMinuteOpen, fiveMinuteOpen + 300, fiveMinuteOpen + 600])
    assert.equal(resolveRectangleTimeToCoordinate(chart, fiveMinuteOpen + 60, 'start'), 0)
    assert.equal(resolveRectangleTimeToCoordinate(chart, fiveMinuteOpen + 240, 'end'), 10)
  })

  it('keeps a wider range on the candles that contain each endpoint', () => {
    const chart = chartWithBars([fiveMinuteOpen, fiveMinuteOpen + 300, fiveMinuteOpen + 600])
    assert.equal(resolveRectangleTimeToCoordinate(chart, fiveMinuteOpen + 60, 'start'), 0)
    assert.equal(resolveRectangleTimeToCoordinate(chart, fiveMinuteOpen + 420, 'end'), 20)
  })

  it('extends a range past the last candle by one logical bar', () => {
    const chart = chartWithBars([fiveMinuteOpen, fiveMinuteOpen + 300, fiveMinuteOpen + 600])
    assert.equal(resolveRectangleTimeToCoordinate(chart, fiveMinuteOpen + 700, 'start'), 20)
    assert.equal(resolveRectangleTimeToCoordinate(chart, fiveMinuteOpen + 800, 'end'), 30)
  })
})
