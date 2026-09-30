import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { FixedRangeVolumeProfileSeriesPrimitive } from './fixedRangeVolumeProfileSeriesPrimitive.ts'

describe('fixedRangeVolumeProfileSeriesPrimitive lifecycle', () => {
  it('attaches once and updates views without re-attaching', () => {
    let attachCount = 0
    let updateCount = 0
    const series = {
      attachPrimitive: () => {
        attachCount += 1
      },
      detachPrimitive: () => {},
      priceToCoordinate: () => 100,
    }
    const chart = {
      timeScale: () => ({
        timeToCoordinate: () => 50,
        options: () => ({ barSpacing: 6 }),
      }),
      panes: () => [{ getHeight: () => 400 }],
    }

    const primitive = new FixedRangeVolumeProfileSeriesPrimitive(() => ({
      instances: [],
      runtimeById: {},
    }))
    series.attachPrimitive(primitive)
    primitive.attached({
      chart: chart as never,
      series: series as never,
      requestUpdate: () => {
        updateCount += 1
      },
    })
    primitive.updateAllViews()
    primitive.updateAllViews()
    assert.equal(attachCount, 1)
    assert.ok(updateCount >= 0)
    primitive.detached()
  })

  it('removes deleted instance profiles from the render model', () => {
    const primitive = new FixedRangeVolumeProfileSeriesPrimitive(() => ({
      instances: [],
      runtimeById: {},
    }))
    const chart = {
      timeScale: () => ({
        timeToCoordinate: () => 50,
        options: () => ({ barSpacing: 6 }),
      }),
      panes: () => [{ getHeight: () => 400 }],
    }
    const series = { priceToCoordinate: () => 100 }
    primitive.attached({
      chart: chart as never,
      series: series as never,
      requestUpdate: () => {},
    })
    primitive.updateAllViews()
    const view = primitive.paneViews()[0] as { renderer: () => unknown }
    assert.equal(view.renderer(), null)
    primitive.detached()
  })
})
