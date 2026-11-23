import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { IChartApi } from 'lightweight-charts'
import {
  buildRectangleChartTimeContext,
  latestCandleUnixTime,
  projectRectangleTimeToCoordinate,
  resolveRectangleTimeFromCoordinate,
  resolveRectangleTimeToCoordinate,
  type RectangleChartTimeContext,
} from './rectangleChartTime.ts'

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
      coordinateToLogical: (x: number) => x / spacing,
      coordinateToTime: (x: number) => barTimes[Math.round(x / spacing)] ?? null,
    }),
  } as unknown as IChartApi
}

function contextForBars(barTimes: number[], intervalSeconds = 300): RectangleChartTimeContext {
  return {
    intervalDurationSeconds: intervalSeconds,
    lastBarUnixTime: barTimes[barTimes.length - 1],
    lastBarLogicalIndex: barTimes.length - 1,
  }
}

const fiveMinuteOpen = 1_700_000_000
const barTimes = [fiveMinuteOpen, fiveMinuteOpen + 300, fiveMinuteOpen + 600]
const context = contextForBars(barTimes)

describe('latestCandleUnixTime', () => {
  it('returns the last loaded candle time without walking earlier history', () => {
    assert.equal(latestCandleUnixTime([]), null)
    assert.equal(latestCandleUnixTime([{ time: Number.NaN }]), null)
    assert.equal(
      latestCandleUnixTime([{ time: fiveMinuteOpen }, { time: fiveMinuteOpen + 600 }]),
      fiveMinuteOpen + 600,
    )
  })
})

describe('buildRectangleChartTimeContext', () => {
  it('anchors future projection on the supplied last bar time', () => {
    const chart = chartWithBars(barTimes)
    const built = buildRectangleChartTimeContext(chart, barTimes[barTimes.length - 1], 300)
    assert.equal(built.lastBarUnixTime, barTimes[barTimes.length - 1])
    assert.equal(built.lastBarLogicalIndex, barTimes.length - 1)
    assert.equal(built.intervalDurationSeconds, 300)
  })

  it('leaves the anchor empty when no last bar time is available', () => {
    const chart = chartWithBars(barTimes)
    const built = buildRectangleChartTimeContext(chart, null, 300)
    assert.equal(built.lastBarUnixTime, null)
    assert.equal(built.lastBarLogicalIndex, null)
  })
})

describe('resolveRectangleTimeToCoordinate', () => {
  it('uses the exact candle coordinate when the timestamp exists', () => {
    const chart = chartWithBars(barTimes)
    assert.equal(resolveRectangleTimeToCoordinate(chart, fiveMinuteOpen + 300, 'start', context), 10)
    assert.equal(resolveRectangleTimeToCoordinate(chart, fiveMinuteOpen + 300, 'end', context), 10)
  })

  it('projects an in-gap start and end onto opposite interval boundaries', () => {
    const chart = chartWithBars(barTimes)
    assert.equal(resolveRectangleTimeToCoordinate(chart, fiveMinuteOpen + 60, 'start', context), 0)
    assert.equal(resolveRectangleTimeToCoordinate(chart, fiveMinuteOpen + 240, 'end', context), 10)
  })

  it('keeps a wider range on the candles that contain each endpoint', () => {
    const chart = chartWithBars(barTimes)
    assert.equal(resolveRectangleTimeToCoordinate(chart, fiveMinuteOpen + 60, 'start', context), 0)
    assert.equal(resolveRectangleTimeToCoordinate(chart, fiveMinuteOpen + 420, 'end', context), 20)
  })

  it('does not project timestamps that precede the loaded history', () => {
    const chart = chartWithBars(barTimes)
    assert.equal(resolveRectangleTimeToCoordinate(chart, fiveMinuteOpen - 240, 'start', context), null)
    assert.equal(resolveRectangleTimeToCoordinate(chart, fiveMinuteOpen - 60, 'end', context), null)
  })

  it('extends a range past the last candle using interval-aware logical bars', () => {
    const chart = chartWithBars(barTimes)
    assert.equal(resolveRectangleTimeToCoordinate(chart, fiveMinuteOpen + 700, 'start', context), 20)
    assert.equal(resolveRectangleTimeToCoordinate(chart, fiveMinuteOpen + 800, 'end', context), 30)
    assert.equal(resolveRectangleTimeToCoordinate(chart, fiveMinuteOpen + 1_500, 'end', context), 50)
  })
})

/**
 * Same bars, but the first bar sits at a non-zero pane coordinate (for example
 * a fractional pan with whitespace left of the loaded history). A clipped
 * projection must reuse that bar coordinate, not fabricate logical 0 -> x 0.
 */
function chartWithBarsOffset(barTimes: number[], spacing = 10, originX = 37.5): IChartApi {
  const base = chartWithBars(barTimes, spacing) as unknown as {
    timeScale: () => {
      timeToCoordinate: (time: number) => number | null
      logicalToCoordinate: (logical: number) => number
    }
  }
  const timeScale = () => {
    const inner = base.timeScale()
    return {
      timeToCoordinate: (time: number) => {
        const coordinate = inner.timeToCoordinate(time)
        return coordinate === null ? null : coordinate + originX
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
      logicalToCoordinate: (logical: number) => inner.logicalToCoordinate(logical) + originX,
      coordinateToLogical: (x: number) => (x - originX) / spacing,
      coordinateToTime: (x: number) => barTimes[Math.round((x - originX) / spacing)] ?? null,
    }
  }
  return { timeScale } as unknown as IChartApi
}

describe('projectRectangleTimeToCoordinate', () => {
  it('clips a timestamp before the loaded history to the earliest loaded bar', () => {
    const chart = chartWithBars(barTimes)
    assert.deepEqual(
      projectRectangleTimeToCoordinate(chart, fiveMinuteOpen - 240, 'start', context),
      { coordinate: 0, clippedBeforeLoadedHistory: true },
    )
    assert.deepEqual(
      projectRectangleTimeToCoordinate(chart, fiveMinuteOpen - 60, 'end', context),
      { coordinate: 0, clippedBeforeLoadedHistory: true },
    )
  })

  it('uses the loaded bar coordinate, not a fabricated zero, for the clipped edge', () => {
    const chart = chartWithBarsOffset(barTimes)
    const started = projectRectangleTimeToCoordinate(chart, fiveMinuteOpen - 600, 'start', context)
    assert.deepEqual(started, { coordinate: 37.5, clippedBeforeLoadedHistory: true })
    // A box that starts at the first loaded bar keeps that same coordinate.
    assert.deepEqual(
      projectRectangleTimeToCoordinate(chart, fiveMinuteOpen, 'start', context),
      { coordinate: 37.5, clippedBeforeLoadedHistory: false },
    )
  })

  it('keeps loaded, in-gap and future projections unchanged and unclipped', () => {
    const chart = chartWithBars(barTimes)
    assert.deepEqual(
      projectRectangleTimeToCoordinate(chart, fiveMinuteOpen + 300, 'start', context),
      { coordinate: 10, clippedBeforeLoadedHistory: false },
    )
    assert.deepEqual(
      projectRectangleTimeToCoordinate(chart, fiveMinuteOpen + 60, 'start', context),
      { coordinate: 0, clippedBeforeLoadedHistory: false },
    )
    assert.deepEqual(
      projectRectangleTimeToCoordinate(chart, fiveMinuteOpen + 240, 'end', context),
      { coordinate: 10, clippedBeforeLoadedHistory: false },
    )
    assert.deepEqual(
      projectRectangleTimeToCoordinate(chart, fiveMinuteOpen + 800, 'end', context),
      { coordinate: 30, clippedBeforeLoadedHistory: false },
    )
  })

  it('keeps the legacy resolver null for a pre-history edge on other tools', () => {
    const chart = chartWithBars(barTimes)
    assert.equal(
      resolveRectangleTimeToCoordinate(chart, fiveMinuteOpen - 240, 'start', context),
      null,
    )
  })

  it('guards non-finite, invalid and unresolvable inputs', () => {
    const chart = chartWithBars(barTimes)
    assert.equal(projectRectangleTimeToCoordinate(chart, Number.NaN, 'start', context), null)
    assert.equal(projectRectangleTimeToCoordinate(chart, Number.POSITIVE_INFINITY, 'start', context), null)
    assert.equal(projectRectangleTimeToCoordinate(chart, -1, 'start', context), null)
    const empty = chartWithBars([])
    assert.equal(projectRectangleTimeToCoordinate(empty, fiveMinuteOpen, 'start', context), null)
    const noCoordinate = {
      timeScale: () => ({
        timeToCoordinate: () => null,
        timeToIndex: () => 0,
        logicalToCoordinate: () => null,
        coordinateToLogical: () => null,
        coordinateToTime: () => barTimes[0],
      }),
    } as unknown as IChartApi
    assert.equal(
      projectRectangleTimeToCoordinate(noCoordinate, fiveMinuteOpen - 240, 'start', context),
      null,
    )
  })
})

describe('resolveRectangleTimeFromCoordinate', () => {
  it('resolves future whitespace coordinates to future unix timestamps', () => {
    const chart = chartWithBars(barTimes)
    assert.equal(resolveRectangleTimeFromCoordinate(chart, 50, context), fiveMinuteOpen + 1_500)
  })

  it('keeps absolute future toTime while the future whitespace shrinks as candles arrive', () => {
    const futureToTime = fiveMinuteOpen + 1_500
    const chartBefore = chartWithBars(barTimes)
    const coordBefore = resolveRectangleTimeToCoordinate(chartBefore, futureToTime, 'end', context)
    assert.equal(coordBefore, 50)
    const logicalBefore = chartBefore.timeScale().coordinateToLogical(coordBefore)
    const lastLogicalBefore = context.lastBarLogicalIndex as number
    assert.equal((logicalBefore as number) - lastLogicalBefore, 3)

    const extendedBars = [...barTimes, fiveMinuteOpen + 900, fiveMinuteOpen + 1_200]
    const chartAfter = chartWithBars(extendedBars)
    const extendedContext = contextForBars(extendedBars)
    const coordAfter = resolveRectangleTimeToCoordinate(
      chartAfter,
      futureToTime,
      'end',
      extendedContext,
    )
    assert.equal(coordAfter, 50)
    const logicalAfter = chartAfter.timeScale().coordinateToLogical(coordAfter)
    const lastLogicalAfter = extendedContext.lastBarLogicalIndex as number
    assert.equal((logicalAfter as number) - lastLogicalAfter, 1)
    assert.equal(futureToTime, fiveMinuteOpen + 1_500)
  })
})
