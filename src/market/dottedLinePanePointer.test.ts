import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { IChartApi, ISeriesApi, SeriesType, Time } from 'lightweight-charts'
import { applyDottedLinePanePointerUp } from './dottedLinePanePointer.ts'
import { armDottedLineTool } from './dottedLineInteraction.ts'

function createMockChart(): IChartApi {
  return {
    timeScale: () => ({
      coordinateToTime: (x: number) => (x === 50 ? 100 : x === 80 ? 150 : null),
    }),
  } as unknown as IChartApi
}

function createMockSeries(): ISeriesApi<SeriesType, Time> {
  return {
    coordinateToPrice: (y: number) => (y === 100 ? 50_000 : y === 80 ? 51_000 : null),
  } as unknown as ISeriesApi<SeriesType, Time>
}

describe('dottedLinePanePointer', () => {
  it('commits line on second pointer up', () => {
    const chart = createMockChart()
    const series = createMockSeries()
    let interaction = armDottedLineTool()
    let completed = 0

    const callbacks = {
      getSnapshot: () => ({ interaction, instances: [] }),
      getSeries: () => series,
      onInteractionChange: (state: typeof interaction) => {
        interaction = state
      },
      onInstanceCompleted: () => {
        completed += 1
      },
    }

    applyDottedLinePanePointerUp(chart, 50, 100, callbacks)
    assert.equal(interaction.phase, 'preview')
    applyDottedLinePanePointerUp(chart, 80, 80, callbacks)
    assert.equal(completed, 1)
    assert.equal(interaction.phase, 'inactive')
  })
})
