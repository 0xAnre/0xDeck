import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { IChartApi } from 'lightweight-charts'
import { resolveLineTimeToCoordinate, type LineChartTimeContext } from './lineChartTime.ts'
import {
  armLineTool,
  INITIAL_LINE_INTERACTION_STATE,
  startLineCreateDraft,
  startLineMoveDraft,
  startLineResizeDraft,
  updateLineCreatePreview,
} from './lineInteraction.ts'
import { lineChartStrokeDashPattern } from './lineChartStroke.ts'
import { readLineStrokeStyleForInstance } from './lineColors.ts'
import {
  createLineInstance,
  lineInstanceStrokeStyle,
  lineInstanceStrokeWidth,
} from './lineInstances.ts'
import { buildLineDrawModels, projectLineInstanceToScreenSegment } from './lineRenderGeometry.ts'

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

describe('lineRenderGeometry', () => {
  it('includes preview segment and endpoint handles while resizing', () => {
    const interaction = updateLineCreatePreview(
      startLineCreateDraft(armLineTool(INITIAL_LINE_INTERACTION_STATE), 1_700_000_000, 0),
      1_700_000_300,
      5,
    )
    const models = buildLineDrawModels({
      instances: [],
      interaction,
      strokeStyle: 'gray',
      pointerTime: 1_700_000_300,
      pointerPrice: 5,
      timeToCoordinate: (time) => time,
      priceToY: (price) => price,
    })
    assert.equal(models.length, 1)
    assert.equal(models[0].handles.length, 0)

    const selected = {
      phase: 'inactive' as const,
      selectedId: 'line-abc',
      draft: null,
    }
    const persisted = buildLineDrawModels({
      instances: [
        {
          id: 'line-abc',
          timeA: 1_700_000_000,
          priceA: 0,
          timeB: 1_700_000_300,
          priceB: 10,
        },
      ],
      interaction: selected,
      strokeStyle: 'gray',
      pointerTime: null,
      pointerPrice: null,
      timeToCoordinate: (time) => time,
      priceToY: (price) => price,
    })
    assert.equal(persisted[0].handles.length, 2)
  })

  it('projects off-grid endpoints by chronological order', () => {
    const fiveMinuteOpen = 1_700_000_000
    const barTimes = [fiveMinuteOpen, fiveMinuteOpen + 300, fiveMinuteOpen + 600]
    const chart = chartWithBars(barTimes)
    const context: LineChartTimeContext = {
      intervalDurationSeconds: 300,
      lastBarUnixTime: barTimes[barTimes.length - 1],
      lastBarLogicalIndex: barTimes.length - 1,
    }
    const timeToCoordinate = (time: number, edge: 'start' | 'end') =>
      resolveLineTimeToCoordinate(chart, time, edge, context)
    const priceToY = (price: number) => price

    const leftToRight = projectLineInstanceToScreenSegment(
      {
        id: 'line-ltr',
        timeA: fiveMinuteOpen + 60,
        priceA: 1,
        timeB: fiveMinuteOpen + 240,
        priceB: 2,
      },
      timeToCoordinate,
      priceToY,
    )
    assert.deepEqual(
      leftToRight && { ax: leftToRight.ax, bx: leftToRight.bx },
      { ax: 0, bx: 10 },
    )

    const rightToLeft = projectLineInstanceToScreenSegment(
      {
        id: 'line-rtl',
        timeA: fiveMinuteOpen + 310,
        priceA: 1,
        timeB: fiveMinuteOpen + 290,
        priceB: 2,
      },
      timeToCoordinate,
      priceToY,
    )
    assert.ok(rightToLeft)
    assert.equal(rightToLeft.ax, 20)
    assert.equal(rightToLeft.bx, 0)
    assert.ok(rightToLeft.ax > rightToLeft.bx)

    const futureRightToLeft = projectLineInstanceToScreenSegment(
      {
        id: 'line-future',
        timeA: fiveMinuteOpen + 800,
        priceA: 1,
        timeB: fiveMinuteOpen + 700,
        priceB: 2,
      },
      timeToCoordinate,
      priceToY,
    )
    assert.ok(futureRightToLeft)
    assert.equal(futureRightToLeft.ax, 30)
    assert.equal(futureRightToLeft.bx, 20)
    assert.ok(futureRightToLeft.ax > futureRightToLeft.bx)
  })

  it('keeps custom stroke presentation on move and resize previews', () => {
    const colored = {
      ...createLineInstance({
        timeA: 100,
        priceA: 10,
        timeB: 200,
        priceB: 20,
      })!,
      strokeColor: '#ff0000',
      lineWidth: 3,
      lineStyle: 'solid' as const,
    }
    const other = createLineInstance({
      timeA: 300,
      priceA: 10,
      timeB: 400,
      priceB: 20,
    })!
    const defaultStroke = 'gray'
    const shared = {
      strokeStyle: defaultStroke,
      pointerTime: 250,
      pointerPrice: 5,
      timeToCoordinate: (time: number) => time,
      priceToY: (price: number) => 100 - price,
    }

    const resizeModels = buildLineDrawModels({
      ...shared,
      instances: [colored, other],
      interaction: startLineResizeDraft(INITIAL_LINE_INTERACTION_STATE, colored, 'endpoint-b'),
    })
    assert.equal(resizeModels.length, 2)
    const resizePreview = resizeModels[1]
    assert.equal(resizePreview.strokeStyle, readLineStrokeStyleForInstance(colored, defaultStroke))
    assert.equal(resizePreview.lineWidthCssPx, lineInstanceStrokeWidth(colored))
    assert.deepEqual(
      resizePreview.dashPatternCssPx,
      lineChartStrokeDashPattern(lineInstanceStrokeStyle(colored)),
    )

    const moveModels = buildLineDrawModels({
      ...shared,
      instances: [colored],
      interaction: startLineMoveDraft(INITIAL_LINE_INTERACTION_STATE, colored, 150, 15),
    })
    assert.equal(moveModels.length, 1)
    assert.equal(moveModels[0].strokeStyle, readLineStrokeStyleForInstance(colored, defaultStroke))
    assert.equal(moveModels[0].lineWidthCssPx, 3)

    const creating = updateLineCreatePreview(
      startLineCreateDraft(armLineTool(INITIAL_LINE_INTERACTION_STATE), 100, 10),
      200,
      20,
    )
    const createModels = buildLineDrawModels({
      ...shared,
      instances: [colored],
      interaction: creating,
    })
    const createPreview = createModels.at(-1)
    assert.equal(createPreview?.strokeStyle, defaultStroke)
    assert.equal(createPreview?.lineWidthCssPx, 1)
    assert.deepEqual(createPreview?.dashPatternCssPx, lineChartStrokeDashPattern('dashed'))
  })
})
