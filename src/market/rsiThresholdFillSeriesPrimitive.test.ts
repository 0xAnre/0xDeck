import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  attachRsiThresholdFillSeriesPrimitive,
  RsiThresholdFillSeriesPrimitive,
  type RsiThresholdFillSeriesPrimitiveContext,
} from './rsiThresholdFillSeriesPrimitive.ts'

function baseChart() {
  return {
    timeScale: () => ({
      timeToCoordinate: (time: number) => time,
      options: () => ({ barSpacing: 6 }),
    }),
  }
}

function fillContext(
  points: RsiThresholdFillSeriesPrimitiveContext['points'],
  thresholds: RsiThresholdFillSeriesPrimitiveContext['thresholds'],
): RsiThresholdFillSeriesPrimitiveContext {
  return {
    points,
    thresholds,
    overboughtFillStyle: 'rgba(239, 68, 68, 0.13)',
    oversoldFillStyle: 'rgba(34, 197, 94, 0.13)',
    visible: true,
  }
}

describe('rsiThresholdFillSeriesPrimitive lifecycle', () => {
  it('renders nothing between the thresholds and fills after a threshold change', () => {
    let context = fillContext(
      [
        { time: 10, value: 50 },
        { time: 20, value: 55 },
      ],
      { overbought: 70, oversold: 30 },
    )
    const primitive = new RsiThresholdFillSeriesPrimitive(() => context)
    primitive.attached({
      chart: baseChart() as never,
      series: { priceToCoordinate: (price: number) => 100 - price } as never,
      requestUpdate: () => {},
    })
    const view = primitive.paneViews()[0] as { renderer: () => unknown }
    assert.equal(view.renderer(), null)

    // New thresholds, same stored points: the fill re-segments immediately.
    context = fillContext(context.points, { overbought: 40, oversold: 20 })
    primitive.updateAllViews()
    assert.notEqual(view.renderer(), null)

    context = fillContext(context.points, { overbought: 70, oversold: 30 })
    primitive.updateAllViews()
    assert.equal(view.renderer(), null)
    primitive.detached()
  })

  it('clears the fill when hidden', () => {
    let context = fillContext([{ time: 10, value: 80 }], {
      overbought: 70,
      oversold: 30,
    })
    const primitive = new RsiThresholdFillSeriesPrimitive(() => context)
    primitive.attached({
      chart: baseChart() as never,
      series: { priceToCoordinate: (price: number) => 100 - price } as never,
      requestUpdate: () => {},
    })
    const view = primitive.paneViews()[0] as { renderer: () => unknown }
    assert.notEqual(view.renderer(), null)

    context = { ...context, visible: false }
    primitive.updateAllViews()
    assert.equal(view.renderer(), null)
  })
})

describe('attachRsiThresholdFillSeriesPrimitive', () => {
  it('attaches once to the RSI series and detaches on dispose', () => {
    let attached: RsiThresholdFillSeriesPrimitive | null = null
    let detached = false
    const series = {
      attachPrimitive: (primitive: RsiThresholdFillSeriesPrimitive) => {
        attached = primitive
      },
      detachPrimitive: () => {
        detached = true
      },
      priceToCoordinate: (price: number) => 100 - price,
    }

    const attachment = attachRsiThresholdFillSeriesPrimitive(
      series as never,
      fillContext([], { overbought: 70, oversold: 30 }),
    )
    assert.ok(attached)

    attachment.setData(
      [
        { time: 10, value: 50 },
        { time: 20, value: 55 },
      ],
      { overbought: 70, oversold: 30 },
    )
    attached!.attached({
      chart: baseChart() as never,
      series: series as never,
      requestUpdate: () => {},
    })
    const view = attached!.paneViews()[0] as { renderer: () => unknown }
    assert.equal(view.renderer(), null)

    attachment.setThresholds({ overbought: 40, oversold: 20 })
    assert.notEqual(view.renderer(), null)

    attachment.setData([], { overbought: 40, oversold: 20 })
    assert.equal(view.renderer(), null)

    attachment.dispose()
    assert.equal(detached, true)
  })
})
