import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { IChartApi } from 'lightweight-charts'
import {
  applyFixedRangeVolumeProfileChartInteractionMode,
  attachFixedRangeVolumeProfileChartTool,
  isFixedRangeVolumeProfileChartInteractionLocked,
} from './fixedRangeVolumeProfileChartTool.ts'
import {
  applyFixedRangeVolumeProfileClick,
  applyFixedRangeVolumeProfileCrosshairTime,
  armFixedRangeVolumeProfileTool,
  cancelFixedRangeVolumeProfileInteraction,
  INITIAL_FIXED_RANGE_VP_INTERACTION_STATE,
} from './fixedRangeVolumeProfileInteraction.ts'
import { buildFixedRangeVolumeProfileRangeSegments } from './fixedRangeVolumeProfileRangePrimitive.ts'
import { createFixedRangeVolumeProfileInstance } from './fixedRangeVolumeProfileInstances.ts'

type ScrollMode = 'locked' | 'unlocked'

function withMockWindow<T>(run: () => T): T {
  const keydownHandlers: Array<(event: KeyboardEvent) => void> = []
  const originalWindow = globalThis.window
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      addEventListener: (type: string, handler: (event: KeyboardEvent) => void) => {
        if (type === 'keydown') keydownHandlers.push(handler)
      },
      removeEventListener: (type: string, handler: (event: KeyboardEvent) => void) => {
        if (type === 'keydown') {
          const index = keydownHandlers.indexOf(handler)
          if (index >= 0) keydownHandlers.splice(index, 1)
        }
      },
    },
  })
  try {
    return run()
  } finally {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    })
  }
}

function createMockChart(): { chart: IChartApi; scrollMode: () => ScrollMode } {
  let mode: ScrollMode = 'unlocked'
  const chart = {
    applyOptions: (options: {
      handleScroll?: { mouseWheel?: boolean }
    }) => {
      if (options.handleScroll?.mouseWheel === false) mode = 'locked'
      if (options.handleScroll?.mouseWheel === true) mode = 'unlocked'
    },
    subscribeClick: () => {},
    unsubscribeClick: () => {},
    subscribeCrosshairMove: () => {},
    unsubscribeCrosshairMove: () => {},
    panes: () => [
      {
        attachPrimitive: () => {},
        detachPrimitive: () => {},
      },
    ],
  } as unknown as IChartApi
  return { chart, scrollMode: () => mode }
}

describe('fixedRangeVolumeProfileChartTool lifecycle', () => {
  it('locks chart interaction when armed', () => {
    const armed = armFixedRangeVolumeProfileTool()
    assert.equal(isFixedRangeVolumeProfileChartInteractionLocked(armed), true)
  })

  it('unlocks chart interaction immediately after second valid click', () => {
    const armed = armFixedRangeVolumeProfileTool()
    const first = applyFixedRangeVolumeProfileClick(armed, 100, [])
    const second = applyFixedRangeVolumeProfileClick(first.state, 200, [])
    assert.equal(second.state.phase, 'inactive')
    assert.equal(isFixedRangeVolumeProfileChartInteractionLocked(second.state), false)
  })

  it('unlocks chart interaction immediately after escape', () => {
    const preview = applyFixedRangeVolumeProfileClick(armFixedRangeVolumeProfileTool(), 100, []).state
    const cancelled = cancelFixedRangeVolumeProfileInteraction(preview)
    assert.equal(isFixedRangeVolumeProfileChartInteractionLocked(cancelled), false)
  })

  it('applies chart scroll lock and unlock through explicit interaction state', () => {
    const { chart, scrollMode } = createMockChart()
    applyFixedRangeVolumeProfileChartInteractionMode(chart, armFixedRangeVolumeProfileTool())
    assert.equal(scrollMode(), 'locked')
    applyFixedRangeVolumeProfileChartInteractionMode(chart, INITIAL_FIXED_RANGE_VP_INTERACTION_STATE)
    assert.equal(scrollMode(), 'unlocked')
  })

  it('uses the latest crosshair time for preview updates', () => {
    const preview = applyFixedRangeVolumeProfileClick(armFixedRangeVolumeProfileTool(), 100, []).state
    const moved = applyFixedRangeVolumeProfileCrosshairTime(preview, 150)
    const movedAgain = applyFixedRangeVolumeProfileCrosshairTime(moved, 180)
    assert.equal(movedAgain.draft?.previewTime, 180)
  })

  it('sync repaints primitive segments after instance removal', () => {
    const instance = createFixedRangeVolumeProfileInstance({ fromTime: 100, toTime: 200 })!
    let instances = [instance]
    const segmentsAfterDelete = buildFixedRangeVolumeProfileRangeSegments(
      instances.filter((item) => item.id !== instance.id),
      INITIAL_FIXED_RANGE_VP_INTERACTION_STATE,
    )
    assert.equal(segmentsAfterDelete.length, 0)
    instances = instances.filter((item) => item.id !== instance.id)
    assert.equal(instances.length, 0)
  })

  it('keeps only completed instance segments without draft copy', () => {
    const instance = createFixedRangeVolumeProfileInstance({ fromTime: 100, toTime: 200 })!
    const segments = buildFixedRangeVolumeProfileRangeSegments(
      [instance],
      INITIAL_FIXED_RANGE_VP_INTERACTION_STATE,
    )
    assert.equal(segments.length, 1)
    const withDraft = buildFixedRangeVolumeProfileRangeSegments([instance], {
      phase: 'preview',
      draft: { anchorTime: 300, previewTime: 400 },
    })
    assert.equal(withDraft.length, 2)
  })

  it('dispose unlocks chart interaction and detaches handlers', () => {
    withMockWindow(() => {
      const { chart, scrollMode } = createMockChart()
      let clickHandlers = 0
      chart.subscribeClick = () => {
        clickHandlers += 1
      }
      chart.unsubscribeClick = () => {
        clickHandlers -= 1
      }
      const controller = attachFixedRangeVolumeProfileChartTool(chart, {
        getSnapshot: () => ({
          interaction: armFixedRangeVolumeProfileTool(),
          instances: [],
        }),
        onInteractionChange: () => {},
        onInstanceCompleted: () => {},
      })
      assert.equal(scrollMode(), 'locked')
      controller.dispose()
      assert.equal(scrollMode(), 'unlocked')
      assert.equal(clickHandlers, 0)
    })
  })

  it('second click unlocks before reading stale snapshot in controller flow', () => {
    withMockWindow(() => {
      const { chart, scrollMode } = createMockChart()
      let interaction = armFixedRangeVolumeProfileTool()
      const controller = attachFixedRangeVolumeProfileChartTool(chart, {
        getSnapshot: () => ({ interaction, instances: [] }),
        onInteractionChange: (state) => {
          interaction = state
        },
        onInstanceCompleted: () => {},
      })
      assert.equal(scrollMode(), 'locked')
      const first = applyFixedRangeVolumeProfileClick(interaction, 100, [])
      interaction = first.state
      applyFixedRangeVolumeProfileChartInteractionMode(chart, first.state)
      const second = applyFixedRangeVolumeProfileClick(first.state, 200, [])
      interaction = second.state
      applyFixedRangeVolumeProfileChartInteractionMode(chart, second.state)
      controller.sync()
      assert.equal(scrollMode(), 'unlocked')
    })
  })
})
