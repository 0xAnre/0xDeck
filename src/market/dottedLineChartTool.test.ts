import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { IChartApi } from 'lightweight-charts'
import {
  attachDottedLineChartTool,
  isDottedLineChartInteractionLocked,
} from './dottedLineChartTool.ts'
import {
  armDottedLineTool,
  cancelDottedLineInteraction,
  INITIAL_DOTTED_LINE_INTERACTION_STATE,
} from './dottedLineInteraction.ts'
import { armFixedRangeVolumeProfileTool } from './fixedRangeVolumeProfileInteraction.ts'

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
            getBoundingClientRect: () => ({ left: 0, top: 0 }),
          }) as unknown as HTMLElement,
      },
    ],
  } as unknown as IChartApi
  return { chart, scrollMode: () => mode }
}

describe('dottedLineChartTool lifecycle', () => {
  it('locks chart interaction when armed', () => {
    const armed = armDottedLineTool()
    assert.equal(isDottedLineChartInteractionLocked(armed), true)
  })

  it('escape cancels through controller cleanup path', () => {
    withMockWindow(() => {
      const { chart, scrollMode } = createMockChart()
      let interaction = armDottedLineTool()
      const controller = attachDottedLineChartTool(chart, {
        getSnapshot: () => ({ interaction, instances: [] }),
        getSeries: () => null,
        onInteractionChange: (state) => {
          interaction = state
        },
        onInstanceCompleted: () => {},
      })
      assert.equal(scrollMode(), 'locked')
      interaction = cancelDottedLineInteraction(interaction)
      controller.sync()
      assert.equal(interaction.phase, 'inactive')
      controller.dispose()
      assert.equal(scrollMode(), 'unlocked')
    })
  })

  it('respects combined lock callback with FRVP', () => {
    withMockWindow(() => {
      const { chart, scrollMode } = createMockChart()
      let dotted = INITIAL_DOTTED_LINE_INTERACTION_STATE
      const frvpArmed = armFixedRangeVolumeProfileTool()
      const controller = attachDottedLineChartTool(chart, {
        getSnapshot: () => ({ interaction: dotted, instances: [] }),
        getSeries: () => null,
        getChartInteractionLocked: () =>
          frvpArmed.phase !== 'inactive' || dotted.phase !== 'inactive',
        onInteractionChange: (state) => {
          dotted = state
        },
        onInstanceCompleted: () => {},
      })
      assert.equal(scrollMode(), 'locked')
      controller.dispose()
    })
  })
})
