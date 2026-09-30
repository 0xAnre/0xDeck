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
    subscribeCrosshairMove: () => {},
    unsubscribeCrosshairMove: () => {},
    timeScale: () => ({
      coordinateToTime: () => null,
    }),
    panes: () => [
      {
        getHTMLElement: () =>
          ({
            addEventListener: () => {},
            removeEventListener: () => {},
          }) as unknown as HTMLElement,
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
    const first = applyFixedRangeVolumeProfileClick(armed, 100, [], '1m')
    const second = applyFixedRangeVolumeProfileClick(first.state, 200, [], '1m')
    assert.equal(second.state.phase, 'inactive')
    assert.equal(isFixedRangeVolumeProfileChartInteractionLocked(second.state), false)
  })

  it('unlocks chart interaction immediately after escape', () => {
    const preview = applyFixedRangeVolumeProfileClick(armFixedRangeVolumeProfileTool(), 100, [], '1m')
      .state
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
    const preview = applyFixedRangeVolumeProfileClick(armFixedRangeVolumeProfileTool(), 100, [], '1m')
      .state
    const moved = applyFixedRangeVolumeProfileCrosshairTime(preview, 150)
    const movedAgain = applyFixedRangeVolumeProfileCrosshairTime(moved, 180)
    assert.equal(movedAgain.draft?.previewTime, 180)
  })

  it('dispose unlocks chart interaction and detaches handlers', () => {
    withMockWindow(() => {
      const { chart, scrollMode } = createMockChart()
      let crosshairHandlers = 0
      chart.subscribeCrosshairMove = () => {
        crosshairHandlers += 1
      }
      chart.unsubscribeCrosshairMove = () => {
        crosshairHandlers -= 1
      }
      const controller = attachFixedRangeVolumeProfileChartTool(chart, {
        getSnapshot: () => ({
          interaction: armFixedRangeVolumeProfileTool(),
          instances: [],
        }),
        getSelectionInterval: () => '1m',
        onInteractionChange: () => {},
        onInstanceCompleted: () => {},
      })
      assert.equal(scrollMode(), 'locked')
      controller.dispose()
      assert.equal(scrollMode(), 'unlocked')
      assert.equal(crosshairHandlers, 0)
    })
  })

  it('second click unlocks before reading stale snapshot in controller flow', () => {
    withMockWindow(() => {
      const { chart, scrollMode } = createMockChart()
      let interaction = armFixedRangeVolumeProfileTool()
      const controller = attachFixedRangeVolumeProfileChartTool(chart, {
        getSnapshot: () => ({ interaction, instances: [] }),
        getSelectionInterval: () => '1m',
        onInteractionChange: (state) => {
          interaction = state
        },
        onInstanceCompleted: () => {},
      })
      assert.equal(scrollMode(), 'locked')
      const first = applyFixedRangeVolumeProfileClick(interaction, 100, [], '1m')
      interaction = first.state
      applyFixedRangeVolumeProfileChartInteractionMode(chart, first.state)
      const second = applyFixedRangeVolumeProfileClick(first.state, 200, [], '1m')
      interaction = second.state
      applyFixedRangeVolumeProfileChartInteractionMode(chart, second.state)
      controller.sync()
      assert.equal(scrollMode(), 'unlocked')
    })
  })
})
